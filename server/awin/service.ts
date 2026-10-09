import type {
  AwinFeed,
  AwinOverview,
  AwinRecord,
  AwinRun,
} from "../../shared/awin.js";
import type { PluginContext } from "../admin/registry.js";
import { config as portalConfig } from "../config.js";
import { awinConfig, type AwinConfig } from "./config.js";
import { AwinRepository } from "./repository.js";
import { AwinClient } from "./client.js";
import { parseFeed } from "./parsers.js";
import { normalizeAwin } from "./normalize.js";
import { affiliateUrl, merchantUrl } from "./urls.js";
import { AwinError, awinErrorCode } from "./errors.js";
import type { Readable } from "node:stream";

export class AwinService {
  readonly repository: AwinRepository;
  readonly client: AwinClient;
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;
  private closed = false;
  private controller = new AbortController();
  private activeRun: string | null = null;
  constructor(
    readonly ctx: Pick<PluginContext, "db" | "registry" | "settings">,
    readonly config: AwinConfig = awinConfig(),
  ) {
    this.repository = new AwinRepository(ctx.db, config.publisherId, [
      config.apiToken,
      config.feedKey,
    ]);
    this.client = new AwinClient(config, this.repository);
  }
  enabled() {
    const plugin = this.ctx.registry.get("awin");
    return (
      !this.closed &&
      !!plugin &&
      this.ctx.registry.enabled(this.ctx.db, plugin) &&
      this.ctx.settings.get<boolean>("awin.enabled") &&
      (!portalConfig.fixtures || false)
    );
  }
  membershipCurrent() {
    const connection = this.repository.state<{
      status: string;
      checkedAt: string | null;
    }>("connection", { status: "unknown", checkedAt: null });
    return (
      connection.status === "connected" &&
      !!connection.checkedAt &&
      Date.parse(connection.checkedAt) +
        this.ctx.settings.get<number>("awin.programTtlHours") * 3600000 >
        Date.now()
    );
  }
  publishableRecord(key: string) {
    if (!this.enabled() || !this.membershipCurrent()) return null;
    const item = this.repository.eligibleRecord(key);
    if (!item) return null;
    const a = this.repository.advertiser(item.advertiserId);
    if (!a || !merchantUrl(item.originalUrl, a)) return null;
    const content = (item.name + " " + item.externalCategory)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const excluded = a.excludedTerms.some((term) =>
      content.includes(
        term
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase(),
      ),
    );
    return excluded ? null : item;
  }
  canPublish(key: string) {
    return !!this.publishableRecord(key);
  }
  destination(catalogId: string) {
    for (const ref of this.repository.byCatalogId([catalogId])) {
      const item = this.publishableRecord(ref.listingKey),
        a = item && this.repository.advertiser(item.advertiserId);
      if (item && a)
        return affiliateUrl(
          item.affiliateUrl,
          a,
          item.originalUrl,
          item.awinProductId,
        );
    }
    return null;
  }
  shops() {
    if (!this.enabled() || !this.membershipCurrent()) return [];
    return this.repository
      .advertisers()
      .filter(
        (a) =>
          a.enabled &&
          a.relationship === "joined" &&
          a.status === "Active" &&
          a.linkStatus !== "Offline",
      )
      .map((a) => ({
        id: String(a.id),
        name: a.name,
        logoUrl: a.logoUrl ? `/api/awin/logos/${a.id}` : null,
        available:
          a.termsReviewed &&
          ((this.repository.verifiedCount(a.id) > 0 &&
            this.repository
              .feeds(a.id)
              .some((f) => f.policy.enabled && !!f.activeRunId)) ||
            (!!this.config.apiToken &&
              !!a.searchUrlTemplate &&
              !!merchantUrl(
                a.searchUrlTemplate.replace("{query}", "produto"),
                a,
              ))),
        searchMode:
          this.repository.verifiedCount(a.id) > 0 ? "catalog" : "store",
      }));
  }
  overview(): AwinOverview {
    return {
      publisherId: this.config.publisherId,
      enabled: this.enabled(),
      scheduler: this.ctx.settings.get<boolean>("awin.scheduler"),
      fixtures: portalConfig.fixtures,
      revision: this.ctx.settings.revision("awin"),
      values: this.ctx.settings.values("awin"),
      credentials: {
        api: {
          reference: "AWIN_API_TOKEN",
          configured: !!this.config.apiToken,
        },
        feeds: {
          reference: "AWIN_FEED_API_KEY",
          configured: !!this.config.feedKey,
        },
      },
      connection: this.repository.state("connection", {
        status: "unknown",
        checkedAt: null,
        errorCode: null,
      }),
      feedDiscovery: this.repository.state("feedDiscovery", {
        checkedAt: null,
        errorCode: null,
      }),
      advertisers: this.repository.advertisers().map((a) => ({
        ...a,
        diagnostic:
          !this.config.apiToken || !this.config.feedKey
            ? "credential_pending"
            : this.repository.state<{ status: string }>("connection", {
                  status: "unknown",
                }).status === "failed"
              ? "technical_failure"
              : this.repository.feeds(a.id).length > 0 &&
                  (!this.repository
                    .feeds(a.id)
                    .some((f) => f.policy.marketCountry === "BR") ||
                    (a.productCount > 0 &&
                      !this.repository.hasBrazilCatalog(a.id)))
                ? "market_unavailable"
                : a.productCount > 0 &&
                    this.repository.verifiedCount(a.id) === 0
                  ? "restricted"
                  : a.diagnostic,
      })),
      feeds: this.repository.feeds().map((f) => ({
        ...f,
        downloadPath: new URL(
          f.downloadPath.replace("{AWIN_FEED_API_KEY}", "configured"),
        ).hostname,
      })),
      runs: this.repository.runs(),
    };
  }
  async discoverPrograms() {
    if (portalConfig.fixtures && true) throw new AwinError("fixtures_disabled");
    try {
      const programs = await this.client.programs(
        AbortSignal.any([this.controller.signal, AbortSignal.timeout(60000)]),
      );
      if (this.closed) return;
      this.repository.savePrograms(
        programs,
        this.ctx.settings.get<boolean>("awin.autoActivate"),
      );
    } catch (error) {
      if (!this.closed) {
        this.repository.setState("connection", {
          status: "failed",
          checkedAt: new Date().toISOString(),
          errorCode: awinErrorCode(error),
        });
        this.repository.changed();
      }
      throw error;
    }
  }
  async discoverFeeds() {
    if (portalConfig.fixtures && true) throw new AwinError("fixtures_disabled");
    try {
      const feeds = await this.client.feeds(
        AbortSignal.any([this.controller.signal, AbortSignal.timeout(60000)]),
      );
      if (this.closed) return;
      this.repository.saveFeeds(feeds);
    } catch (error) {
      if (!this.closed)
        this.repository.setState("feedDiscovery", {
          checkedAt: new Date().toISOString(),
          errorCode: awinErrorCode(error),
        });
      throw error;
    }
  }
  async testLink(key: string) {
    const item = this.publishableRecord(key),
      a = item && this.repository.advertiser(item.advertiserId);
    if (
      !item ||
      !a ||
      !affiliateUrl(item.affiliateUrl, a, item.originalUrl, item.awinProductId)
    )
      throw new AwinError("ineligible");
    const response = await this.client.http.request(item.affiliateUrl!, {
      method: "HEAD",
      signal: AbortSignal.any([
        this.controller.signal,
        AbortSignal.timeout(30000),
      ]),
      merchantHosts: ["www.awin1.com", "awin1.com", ...a.domains],
    });
    response.resume();
    const final = this.client.http.resolvedUrl(response),
      allowed = final && merchantUrl(final, a);
    const original = new URL(item.originalUrl!),
      destination =
        !!allowed &&
        new URL(allowed).hostname === original.hostname &&
        new URL(allowed).pathname === original.pathname;
    return {
      status: response.statusCode,
      structural: true,
      destination,
      commission: "Não verificada; requer transação elegível.",
    };
  }
  start() {
    if (this.timer || this.closed) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 30000);
    this.timer.unref();
    void this.tick();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.controller.abort();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.activeRun)
      this.ctx.db.sql
        .prepare(
          "UPDATE awin_runs SET status='queued',lease_until=0,error_code='interrupted' WHERE id=? AND status='running'",
        )
        .run(this.activeRun);
  }
  async tick() {
    if (this.busy || this.closed || !this.enabled()) return;
    this.busy = true;
    try {
      if (this.ctx.settings.get<boolean>("awin.scheduler")) {
        const checked = this.repository.state<{ checkedAt: string | null }>(
          "connection",
          { checkedAt: null },
        ).checkedAt;
        if (!checked || Date.parse(checked) + 6 * 3600000 < Date.now()) {
          await this.discoverPrograms();
          await this.discoverFeeds();
        }
        for (const f of this.repository.feeds())
          if (
            f.policy.enabled &&
            f.policy.marketCountry === "BR" &&
            (!f.nextRunAt || Date.parse(f.nextRunAt) <= Date.now())
          )
            this.repository.enqueue(f.id);
      }
      if (this.repository.runs().some((r) => r.status === "queued")) {
        const discovery = this.repository.state<{
          checkedAt: string | null;
          errorCode: string | null;
        }>("feedDiscovery", { checkedAt: null, errorCode: null });
        if (
          !discovery.checkedAt ||
          discovery.errorCode ||
          Date.parse(discovery.checkedAt) + 15 * 60000 < Date.now()
        )
          await this.discoverFeeds();
      }
      const run = this.repository.claim();
      if (run) await this.run(run);
      if (!this.closed) this.repository.cleanup();
    } catch {
      /* Isolated scheduler failures are represented in connection/run state, without external payloads. */
    } finally {
      this.busy = false;
    }
  }
  async run(run: AwinRun, input?: Readable, partial = false) {
    this.activeRun = run.id;
    const started = performance.now();
    let processed = 0,
      accepted = 0,
      rejected = 0,
      downloadedBytes = 0,
      peakRssBytes = process.memoryUsage().rss;
    const repo = this.repository;
    const finish = (status: AwinRun["status"], errorCode?: string) => {
      if (!this.closed)
        repo.finish(run, status, {
          processed,
          accepted,
          rejected,
          downloadedBytes,
          peakRssBytes,
          durationMs: performance.now() - started,
          errorCode,
        });
    };
    try {
      const feed = repo.feed(run.feedId),
        advertiser = repo.advertiser(feed.advertiserId);
      if (
        !advertiser ||
        advertiser.relationship !== "joined" ||
        advertiser.status !== "Active" ||
        advertiser.linkStatus === "Offline" ||
        !advertiser.enabled ||
        !advertiser.termsReviewed ||
        !feed.policy.enabled ||
        feed.policy.marketCountry !== "BR" ||
        !this.membershipCurrent()
      )
        throw new AwinError("ineligible");
      const job = this.ctx.db.sql
        .prepare("SELECT source_updated_at FROM awin_runs WHERE id=?")
        .get(run.id);
      if (
        !input &&
        job?.source_updated_at &&
        feed.activeRunId &&
        repo.activeSourceDate(feed) === feed.sourceUpdatedAt
      ) {
        finish("unchanged");
        return;
      }
      if (!input && !this.config.feedKey && feed.format === "csv")
        throw new AwinError("credential_pending");
      while (repo.clearStaging(run)) {
        if (this.closed) throw new AwinError("interrupted");
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const signal = AbortSignal.any([
        this.controller.signal,
        AbortSignal.timeout(this.config.timeoutMs),
      ]);
      const response =
        input ||
        (await this.client.http.request(this.downloadUrl(feed), {
          signal,
          token: feed.format === "jsonl" ? this.config.apiToken : undefined,
        }));
      const gzip = input
        ? true
        : feed.format === "csv" &&
          feed.downloadPath.includes("/compression/gzip/");
      let items: AwinRecord[] = [];
      const importedAt = new Date().toISOString();
      for await (const row of parseFeed(response, feed.format, {
        gzip,
        maxBytes: this.config.maxDownloadBytes,
        maxExpandedBytes: this.config.maxExpandedBytes,
        signal,
        onBytes: (n) => {
          downloadedBytes = n;
        },
      })) {
        if (this.closed) throw new AwinError("interrupted");
        if (++processed > feed.policy.maxRecords)
          throw new AwinError("record_limit");
        const item = normalizeAwin(row, feed, advertiser, importedAt);
        if (!item) {
          rejected++;
          continue;
        }
        // Keep excluded records for diagnosis; publication applies the current category/stock policies.
        const rule = repo.category(advertiser.id, item.externalCategory);
        if (rule) item.category = rule.category as AwinRecord["category"];
        items.push(item);
        accepted++;
        if (items.length >= 250) {
          repo.stage(run, items);
          items = [];
          peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
      if (items.length) repo.stage(run, items);
      if (!processed || !accepted) throw new AwinError("empty_feed");
      if (rejected / processed > 0.05) throw new AwinError("invalid_feed");
      if (
        !partial &&
        feed.productCount > 0 &&
        accepted < feed.productCount * (1 - feed.policy.maxDropPercent / 100)
      )
        throw new AwinError("suspicious_drop");
      // Full CSVs can report an expected scope. A filtered or truncated response cannot prove deletions.
      if (
        !partial &&
        feed.expectedRecords &&
        processed <
          feed.expectedRecords * (1 - feed.policy.maxDropPercent / 100)
      )
        throw new AwinError("incomplete_feed");
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      finish(partial ? "partial" : "complete");
    } catch (error) {
      finish("failed", awinErrorCode(error));
    } finally {
      this.activeRun = null;
    }
  }
  private downloadUrl(feed: AwinFeed) {
    if (feed.publisherId !== this.config.publisherId)
      throw new AwinError("ineligible");
    return feed.downloadPath.replace(
      "{AWIN_FEED_API_KEY}",
      encodeURIComponent(this.config.feedKey),
    );
  }
}
const services = new WeakMap<PluginContext, AwinService>();
export function awinService(ctx: PluginContext) {
  let service = services.get(ctx);
  if (!service) {
    service = new AwinService(ctx);
    services.set(ctx, service);
  }
  return service;
}
