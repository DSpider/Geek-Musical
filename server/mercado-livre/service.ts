import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  lstatSync,
  openSync,
  fsyncSync,
  closeSync,
  chmodSync,
} from "node:fs";
import type { PluginContext } from "../admin/registry.js";
import { mercadoLivreConnection } from "../content/mercado-livre.js";
import { ProviderError, logFailure } from "../lib/http.js";
import { MeliApi } from "./api.js";
import { meliMigration } from "./migration.js";
import {
  checksum,
  identityOf,
  parseEnvelope,
  schedule,
  sourceSchema,
  validatedSchema,
  visible,
  currentPrice,
  type MeliSource,
  type MeliValidated,
} from "./protocol.js";

type Item = {
  identity_key: string;
  source_event_id: string;
  source_ms: number;
  payload: string;
  validation: string | null;
  revision: number;
  state: string;
  last_slot: string | null;
};
export const searchText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function atomicPrivate(filename: string, data: string) {
  const temporary = filename + ".tmp";
  const fd = openSync(temporary, "w", 0o600);
  try {
    writeFileSync(fd, data, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, filename);
  chmodSync(filename, 0o600);
}
export class MeliCatalog {
  readonly directory: string;
  readonly api: MeliApi;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private closed = false;
  private readonly stop = new AbortController();
  private blockedUntil = 0;
  constructor(
    readonly ctx: PluginContext,
    readonly env: NodeJS.ProcessEnv = process.env,
    readonly now = () => Date.now(),
    api?: MeliApi,
  ) {
    this.ctx.db.migrate([meliMigration]);
    this.directory = path.resolve(
      env.MELI_CATALOG_DIRECTORY ||
        path.join(env.STATE_DIRECTORY || "artifacts", "mercado-livre"),
    );
    for (const unsafe of ["public", "src", "dist/client", "content"]) {
      const relative = path.relative(path.resolve(unsafe), this.directory);
      if (!relative.startsWith("..") && !path.isAbsolute(relative))
        throw new Error("CatÃ¡logo exige armazenamento privado.");
    }
    let ancestor = this.directory;
    while (true) {
      try {
        if (lstatSync(ancestor).isSymbolicLink())
          throw new Error("Symlink no catÃ¡logo.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    for (const folder of [
      "",
      "inbox",
      "outbox",
      "acks",
      "processed",
      "rejected",
      "probes",
    ])
      mkdirSync(path.join(this.directory, folder), {
        recursive: true,
        mode: 0o700,
      });
    this.api = api || new MeliApi(mercadoLivreConnection(ctx));
  }
  enabled() {
    return this.env.MELI_CATALOG_ENABLED === "true" && !this.closed;
  }
  publicEnabled() {
    return this.enabled() && this.env.MELI_CATALOG_PUBLIC_ENABLED !== "false";
  }
  liveEnabled() {
    return (
      !this.closed &&
      this.env.MELI_API_SEARCH_ENABLED === "true" &&
      mercadoLivreConnection(this.ctx).status().connected
    );
  }
  affiliateDestination(key: string) {
    const row = this.item(key);
    return row
      ? sourceSchema.parse(JSON.parse(row.payload)).affiliateUrl
      : null;
  }
  offers() {
    return this.ctx.db.sql
      .prepare(
        "SELECT identity_key,payload,state FROM meli_items ORDER BY source_ms DESC LIMIT 200",
      )
      .all()
      .map((row) => ({
        key: String(row.identity_key),
        ...sourceSchema.parse(JSON.parse(String(row.payload))),
        state: row.state,
      }));
  }
  addOffer(title: string, originalUrl: string, affiliateUrl: string) {
    const source = sourceSchema.parse({
      eventId: `mago:${randomUUID()}`,
      title,
      originalUrl,
      affiliateUrl,
      sourceAt: new Date(this.now()).toISOString(),
      tipopromo: 0,
      groupNumber: 1,
      groupOrder: 1,
      legacy: false,
    });
    if (!identityOf(source.originalUrl)) throw new Error("offer_identity");
    this.ctx.db.transaction(() => this.importSource(source));
    return { ok: true };
  }
  authority() {
    return (
      this.ctx.web.environment === "production" &&
      this.env.STAGING_FIXTURES !== "true" &&
      this.env.MELI_CATALOG_VALIDATOR !== "false"
    );
  }
  private item(key: string): Item | undefined {
    return this.ctx.db.sql
      .prepare("SELECT * FROM meli_items WHERE identity_key=?")
      .get(key) as Item | undefined;
  }
  private state(key: string, value?: string) {
    if (value !== undefined)
      this.ctx.db.sql
        .prepare(
          "INSERT INTO meli_state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(key, value);
    return this.ctx.db.sql
      .prepare("SELECT value FROM meli_state WHERE key=?")
      .get(key)?.value as string | undefined;
  }
  importBatch(raw: string) {
    const { envelope, records } = parseEnvelope(raw);
    if (envelope.kind === "validation" && this.authority())
      throw new Error("validation_authority");
    const previous = this.ctx.db.sql
      .prepare("SELECT checksum FROM meli_batches WHERE id=?")
      .get(envelope.id);
    if (previous && previous.checksum !== envelope.checksum)
      throw new Error("batch_conflict");
    if (!previous)
      this.ctx.db.transaction(() => {
        for (const record of records) {
          if (envelope.kind === "source")
            this.importSource(record as MeliSource);
          else this.importValidation(record as MeliValidated);
        }
        this.ctx.db.sql
          .prepare("INSERT INTO meli_batches VALUES (?,?,?,?)")
          .run(
            envelope.id,
            envelope.checksum,
            envelope.kind,
            new Date(this.now()).toISOString(),
          );
      });
    const ack = {
      version: 1,
      id: envelope.id,
      checksum: envelope.checksum,
      appliedAt: new Date(this.now()).toISOString(),
    };
    atomicPrivate(
      path.join(this.directory, "acks", envelope.id + ".json"),
      JSON.stringify(ack),
    );
    return ack;
  }
  private importSource(source: MeliSource) {
    const payload = JSON.stringify(source),
      ms = Date.parse(source.sourceAt);
    if (ms > this.now() + 5 * 60000) throw new Error("source_clock");
    const prior = this.ctx.db.sql
      .prepare("SELECT payload FROM meli_sources WHERE event_id=?")
      .get(source.eventId);
    if (prior) {
      if (prior.payload !== payload) throw new Error("event_conflict");
      return;
    }
    const identity = identityOf(source.originalUrl);
    this.ctx.db.sql
      .prepare("INSERT INTO meli_sources VALUES (?,?,?,?,?)")
      .run(
        source.eventId,
        payload,
        identity?.key || null,
        ms,
        new Date(this.now()).toISOString(),
      );
    if (!identity) return;
    const existing = this.item(identity.key);
    if (
      existing &&
      (existing.source_ms > ms ||
        (existing.source_ms === ms &&
          existing.source_event_id > source.eventId))
    )
      return;
    this.ctx.db.sql
      .prepare(
        `INSERT INTO meli_items(identity_key,source_event_id,source_ms,payload) VALUES (?,?,?,?)
      ON CONFLICT(identity_key) DO UPDATE SET source_event_id=excluded.source_event_id,source_ms=excluded.source_ms,payload=excluded.payload,state='pending',last_slot=NULL,next_attempt_ms=0`,
      )
      .run(identity.key, source.eventId, ms, payload);
    if (this.authority()) {
      const priorValidation = existing?.validation
        ? validatedSchema.parse(JSON.parse(existing.validation))
        : null;
      this.save(
        {
          key: identity.key,
          source,
          state: "pending",
          name: priorValidation?.name || null,
          image: priorValidation?.image || null,
          price: null,
          stock: "unknown",
          features: priorValidation?.features || [],
          checkedAt: new Date(this.now()).toISOString(),
          reason: "awaiting_validation",
          missingCount: priorValidation?.missingCount || 0,
          missingSlot: priorValidation?.missingSlot || null,
        },
        source.eventId,
      );
    }
  }
  private importValidation(validation: MeliValidated) {
    const existing = this.item(validation.key),
      ms = Date.parse(validation.source.sourceAt);
    if (existing && validation.revision <= existing.revision) return;
    // Positive observations never override a newer unvalidated source. Negative
    // observations still disable the same identity, even if its link changed.
    if (existing && validation.state === "active" && ms < existing.source_ms) {
      this.ctx.db.sql
        .prepare("UPDATE meli_items SET revision=? WHERE identity_key=?")
        .run(validation.revision, validation.key);
      return;
    }
    const keepSource = existing && existing.source_ms > ms,
      source = keepSource
        ? sourceSchema.parse(JSON.parse(existing.payload))
        : validation.source;
    this.ctx.db.sql
      .prepare(
        `INSERT INTO meli_items(identity_key,source_event_id,source_ms,payload,validation,revision,state,search_text) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(identity_key) DO UPDATE SET source_event_id=excluded.source_event_id,source_ms=excluded.source_ms,payload=excluded.payload,validation=excluded.validation,revision=excluded.revision,state=excluded.state,search_text=excluded.search_text`,
      )
      .run(
        validation.key,
        source.eventId,
        Date.parse(source.sourceAt),
        JSON.stringify(source),
        JSON.stringify(validation),
        validation.revision,
        validation.state,
        searchText(
          [validation.name, source.title, ...validation.features].join(" "),
        ),
      );
  }
  private save(value: Omit<MeliValidated, "revision">, eventId: string) {
    if (this.closed || this.item(value.key)?.source_event_id !== eventId)
      return;
    const revision = Number(
      this.ctx.db.sql
        .prepare("INSERT INTO meli_changes(identity_key,payload) VALUES (?,?)")
        .run(value.key, "").lastInsertRowid,
    );
    const result = validatedSchema.parse({ ...value, revision }),
      payload = JSON.stringify(result);
    this.ctx.db.sql
      .prepare("UPDATE meli_changes SET payload=? WHERE revision=?")
      .run(payload, revision);
    this.ctx.db.sql
      .prepare(
        "UPDATE meli_items SET validation=?,revision=?,state=?,search_text=? WHERE identity_key=? AND source_event_id=?",
      )
      .run(
        payload,
        revision,
        result.state,
        searchText(
          [result.name, result.source.title, ...result.features].join(" "),
        ),
        result.key,
        eventId,
      );
  }
  private ingestFiles() {
    for (const name of readdirSync(path.join(this.directory, "inbox"))
      .filter((n) => /^(source-[a-f0-9]{32}|validation-\d+-\d+)\.json$/.test(n))
      .sort()
      .slice(0, 100)) {
      const filename = path.join(this.directory, "inbox", name);
      try {
        const stat = lstatSync(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5_000_000)
          throw new Error("batch_file");
        this.importBatch(readFileSync(filename, "utf8"));
        renameSync(filename, path.join(this.directory, "processed", name));
      } catch (error) {
        this.state("last_error", "batch_rejected");
        logFailure("mercado-livre-catalogo", error);
        if (
          lstatSync(filename).isFile() &&
          !lstatSync(filename).isSymbolicLink()
        )
          renameSync(filename, path.join(this.directory, "rejected", name));
      }
    }
  }
  publishChanges() {
    if (!this.authority() || this.closed) return;
    const last = Number(this.state("published_revision") || 0),
      changes = this.ctx.db.sql
        .prepare(
          "SELECT revision,payload FROM meli_changes WHERE revision>? ORDER BY revision LIMIT 1000",
        )
        .all(last) as { revision: number; payload: string }[];
    if (!changes.length) return;
    const first = changes[0].revision,
      end = changes.at(-1)!.revision,
      body = JSON.stringify(changes.map((r) => JSON.parse(r.payload))),
      envelope = {
        version: 1,
        id: `validation-${first}-${end}`,
        kind: "validation",
        checksum: checksum(body),
        body,
      };
    atomicPrivate(
      path.join(this.directory, "outbox", envelope.id + ".json"),
      JSON.stringify(envelope),
    );
    this.state("published_revision", String(end));
  }
  async validateDue() {
    const now = this.now(),
      window = schedule(now);
    if (
      !this.enabled() ||
      !this.authority() ||
      !window.open ||
      this.blockedUntil > now
    )
      return;
    const deadline = now + 12 * 60000;
    let consecutiveFailures = 0;
    while (!this.closed && this.now() < deadline) {
      const due = this.ctx.db.sql
        .prepare(
          "SELECT * FROM meli_items WHERE state<>'invalid' AND (last_slot IS NULL OR last_slot<>?) AND next_attempt_ms<=? ORDER BY CASE state WHEN 'active' THEN 0 ELSE 1 END,source_ms DESC LIMIT 2",
        )
        .all(window.slot, this.now()) as Item[];
      if (!due.length) break;
      await Promise.all(
        due.map(async (item) => {
          const source = sourceSchema.parse(JSON.parse(item.payload)),
            identity = identityOf(source.originalUrl);
          if (!identity || this.closed) return;
          this.ctx.db.sql
            .prepare("UPDATE meli_items SET last_slot=? WHERE identity_key=?")
            .run(window.slot, identity.key);
          const prior = item.validation
            ? validatedSchema.parse(JSON.parse(item.validation))
            : null;
          let value: Omit<MeliValidated, "revision">;
          try {
            const observation = await this.api.observe(
              identity,
              AbortSignal.any([this.stop.signal, AbortSignal.timeout(8000)]),
            );
            if (this.closed) return;
            value = {
              ...observation,
              key: identity.key,
              source,
              checkedAt: new Date(this.now()).toISOString(),
              missingCount: 0,
              missingSlot: null,
            };
            consecutiveFailures = 0;
          } catch (error) {
            if (this.closed) return;
            const status =
                error instanceof ProviderError ? error.status : undefined,
              missing =
                status === 404
                  ? (prior?.missingCount || 0) +
                    (prior?.missingSlot === window.slot ? 0 : 1)
                  : 0,
              reason = status
                ? `http_${status}`
                : error instanceof ProviderError
                  ? error.code
                  : "timeout";
            value = {
              key: identity.key,
              source,
              state: missing >= 2 ? "invalid" : "pending",
              name: prior?.name || null,
              image: prior?.image || null,
              price: null,
              features: prior?.features || [],
              stock: "unknown",
              checkedAt: new Date(this.now()).toISOString(),
              reason,
              missingCount: missing,
              missingSlot: status === 404 ? window.slot : null,
            };
            if (status !== 404) consecutiveFailures++;
            if (error instanceof ProviderError && error.retryAfterMs) {
              this.blockedUntil = Math.max(
                this.blockedUntil,
                this.now() + error.retryAfterMs,
              );
              this.ctx.db.sql
                .prepare(
                  "UPDATE meli_items SET next_attempt_ms=? WHERE identity_key=?",
                )
                .run(this.blockedUntil, identity.key);
            }
            logFailure("mercado-livre-catalogo", error);
          }
          this.ctx.db.transaction(() => this.save(value, source.eventId));
        }),
      );
      this.publishChanges();
      if (this.blockedUntil > this.now() || consecutiveFailures >= 3) {
        this.blockedUntil = Math.max(
          this.blockedUntil,
          this.now() + 15 * 60000,
        );
        const pending = this.ctx.db.sql
          .prepare(
            "SELECT * FROM meli_items WHERE state<>'invalid' AND (last_slot IS NULL OR last_slot<>?)",
          )
          .all(window.slot) as Item[];
        this.ctx.db.transaction(() => {
          for (const item of pending) {
            const source = sourceSchema.parse(JSON.parse(item.payload));
            const prior = item.validation
              ? validatedSchema.parse(JSON.parse(item.validation))
              : null;
            this.save(
              {
                key: item.identity_key,
                source,
                state: "pending",
                name: prior?.name || null,
                image: prior?.image || null,
                price: null,
                features: prior?.features || [],
                stock: "unknown",
                checkedAt: new Date(this.now()).toISOString(),
                reason: "validation_blocked",
                missingCount: 0,
                missingSlot: null,
              },
              source.eventId,
            );
            this.ctx.db.sql
              .prepare(
                "UPDATE meli_items SET last_slot=?,next_attempt_ms=? WHERE identity_key=?",
              )
              .run(window.slot, this.blockedUntil, item.identity_key);
          }
        });
        break;
      }
    }
    this.state("last_validation_at", new Date(this.now()).toISOString());
    this.state("last_validation_slot", window.slot);
  }
  record(key: string): MeliValidated | null {
    const row = this.item(key);
    if (!row?.validation || row.state !== "active") return null;
    const record = validatedSchema.parse(JSON.parse(row.validation));
    return record.source.eventId === row.source_event_id &&
      visible(record, this.now())
      ? record
      : null;
  }
  canPublish(key: string, eventId: string) {
    return this.publicEnabled() && this.record(key)?.source.eventId === eventId;
  }
  search(keywords: string) {
    const tokens = [
      ...new Set(searchText(keywords).match(/[a-z0-9]{2,}/g) || []),
    ]
      .filter(
        (t) =>
          ![
            "para",
            "com",
            "uma",
            "um",
            "de",
            "do",
            "da",
            "ate",
            "por",
            "reais",
            "quero",
            "preciso",
          ].includes(t),
      )
      .slice(0, 8);
    if (!tokens.length) return [];
    // A interpretação existente usa "smartphone" para pedidos de "celular".
    // A equivalência é só de busca; identidade e variação continuam pelos IDs.
    const terms = tokens.map((token) =>
      ["smartphone", "celular"].includes(token)
        ? ["smartphone", "celular", "iphone"]
        : [token],
    );
    const rows = this.ctx.db.sql
      .prepare(
        "SELECT identity_key FROM meli_items WHERE state='active' AND " +
          terms
            .map(
              (group) =>
                "(" +
                group.map(() => "search_text LIKE ? ESCAPE '\\'").join(" OR ") +
                ")",
            )
            .join(" AND ") +
          " ORDER BY source_ms DESC LIMIT 80",
      )
      .all(...terms.flat().map((t) => "%" + t + "%")) as {
      identity_key: string;
    }[];
    return rows.flatMap((r) => {
      const record = this.record(r.identity_key);
      return record ? [record] : [];
    });
  }
  version() {
    const rows = this.ctx.db.sql
      .prepare(
        "SELECT identity_key,validation,revision,source_event_id FROM meli_items WHERE state='active'",
      )
      .all() as {
      identity_key: string;
      validation: string | null;
      revision: number;
      source_event_id: string;
    }[];
    return checksum(
      JSON.stringify([
        this.publicEnabled(),
        rows.map((r) => {
          const value = r.validation
            ? validatedSchema.parse(JSON.parse(r.validation))
            : null;
          return [
            r.identity_key,
            r.revision,
            r.source_event_id,
            value && visible(value, this.now()),
            value && currentPrice(value, this.now()),
          ];
        }),
      ]),
    );
  }
  status() {
    const counts = this.ctx.db.sql
      .prepare("SELECT state,count(*) AS total FROM meli_items GROUP BY state")
      .all();
    return {
      enabled: this.enabled(),
      publicEnabled: this.publicEnabled(),
      authority: this.authority(),
      counts,
      pendingIdentity: Number(
        this.ctx.db.sql
          .prepare(
            "SELECT count(*) AS n FROM meli_sources WHERE identity_key IS NULL",
          )
          .get()!.n,
      ),
      publishedRevision: Number(this.state("published_revision") || 0),
      lastValidationSlot: this.state("last_validation_slot") || null,
      lastValidationAt: this.state("last_validation_at") || null,
      lastError: this.state("last_error") || null,
    };
  }
  // Amostra operacional privada: usa a mesma instância OAuth do serviço e
  // não insere ofertas nem simula eventos do histórico de mensagens.
  private async validateProbe() {
    if (
      !this.authority() ||
      !schedule(this.now()).open ||
      this.blockedUntil > this.now()
    )
      return;
    const name = readdirSync(path.join(this.directory, "inbox")).find((n) =>
      /^probe-[a-f0-9]{32}\.json$/.test(n),
    );
    if (!name) return;
    const filename = path.join(this.directory, "inbox", name);
    try {
      const stat = lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 20000)
        throw new Error("probe_file");
      const request = z
        .object({
          version: z.literal(1),
          id: z.string(),
          checksum: z.string().regex(/^[a-f0-9]{64}$/),
          body: z.string().max(18000),
        })
        .strict()
        .parse(JSON.parse(readFileSync(filename, "utf8")));
      if (
        request.id + ".json" !== name ||
        checksum(request.body) !== request.checksum
      )
        throw new Error("probe_integrity");
      const urls = z
        .array(z.string().max(4000))
        .min(1)
        .max(5)
        .parse(JSON.parse(request.body));
      const identities = urls.map((url) => identityOf(url));
      if (identities.some((identity) => !identity))
        throw new Error("probe_identity");
      const destination = path.join(this.directory, "probes", name);
      let previous: { checksum?: string } | null = null;
      try {
        previous = JSON.parse(readFileSync(destination, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (previous && previous.checksum !== request.checksum)
        throw new Error("probe_conflict");
      if (!previous) {
        const samples = [];
        for (const identity of identities) {
          if (!identity || this.closed) return;
          try {
            samples.push({
              key: identity.key,
              ...(await this.api.observe(
                identity,
                AbortSignal.any([this.stop.signal, AbortSignal.timeout(8000)]),
              )),
              checkedAt: new Date(this.now()).toISOString(),
            });
          } catch (error) {
            if (this.closed) return;
            samples.push({
              key: identity.key,
              error: error instanceof ProviderError ? error.code : "timeout",
              status:
                error instanceof ProviderError ? error.status || null : null,
            });
            // Não repete renovação ou chamadas após falha de autenticação/limite.
            break;
          }
        }
        atomicPrivate(
          destination,
          JSON.stringify({
            version: 1,
            id: request.id,
            checksum: request.checksum,
            samples,
          }),
        );
      }
      renameSync(filename, path.join(this.directory, "processed", name));
    } catch (error) {
      if (!this.closed) {
        renameSync(filename, path.join(this.directory, "rejected", name));
        logFailure("mercado-livre-probe", error);
      }
    }
  }
  async tick() {
    if (this.running || this.closed || !this.enabled()) return;
    this.running = true;
    if (this.authority())
      atomicPrivate(
        path.join(this.directory, "worker-status.json"),
        JSON.stringify({ ...this.status(), running: true }),
      );
    try {
      this.ingestFiles();
      this.publishChanges();
      await this.validateProbe();
      await this.validateDue();
      this.publishChanges();
    } catch (error) {
      if (!this.closed) {
        this.state("last_error", "worker_failure");
        logFailure("mercado-livre-catalogo", error);
      }
    } finally {
      this.running = false;
      if (this.authority() && !this.closed)
        atomicPrivate(
          path.join(this.directory, "worker-status.json"),
          JSON.stringify({ ...this.status(), running: false }),
        );
    }
  }
  start() {
    // Testes HTTP não consomem a fila real nem iniciam chamadas autenticadas.
    if (this.env.NODE_ENV === "test" && !this.env.MELI_CATALOG_DIRECTORY)
      return;
    if (this.timer || !this.enabled()) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 5000);
    this.timer.unref();
  }
  close() {
    this.closed = true;
    this.stop.abort();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
const services = new WeakMap<PluginContext, MeliCatalog>();
export function meliCatalog(ctx: PluginContext) {
  let service = services.get(ctx);
  if (!service) {
    service = new MeliCatalog(ctx);
    services.set(ctx, service);
  }
  return service;
}
export function closeMeliCatalog(ctx: PluginContext) {
  services.get(ctx)?.close();
}
