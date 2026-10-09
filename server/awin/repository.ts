import { randomUUID } from "node:crypto";
import type {
  AwinAdvertiser,
  AwinFeed,
  AwinRecord,
  AwinRun,
  FeedPolicy,
} from "../../shared/awin.js";
import { feedPolicySchema } from "../../shared/awin.js";
import type { AdminDatabase } from "../admin/database.js";
import { stableListingId } from "../products/catalog.js";
import { AwinError } from "./errors.js";
import { priceCurrent } from "./normalize.js";
import { productSearchText } from "../ai/search-terms.js";
import { merchantUrl } from "./urls.js";
type Row = Record<string, unknown>;
const iso = () => new Date().toISOString();
export type Program = Omit<
  AwinAdvertiser,
  | "enabled"
  | "termsReviewed"
  | "termsReference"
  | "diagnostic"
  | "productCount"
  | "allowedDomains"
  | "excludedTerms"
  | "searchUrlTemplate"
>;
export type FeedMetadata = Pick<
  AwinFeed,
  | "id"
  | "publisherId"
  | "advertiserId"
  | "sourceId"
  | "name"
  | "format"
  | "language"
  | "currency"
  | "sourceUpdatedAt"
  | "downloadPath"
  | "expectedRecords"
  | "metadataCheckedAt"
>;
export class AwinRepository {
  constructor(
    readonly db: AdminDatabase,
    readonly publisherId: number,
    private readonly secrets: string[] = [],
  ) {}
  private nonSecret(value: unknown) {
    const text = JSON.stringify(value);
    if (this.secrets.some((s) => s.length > 5 && text.includes(s)))
      throw new AwinError("unsafe_config");
  }
  state<T>(key: string, fallback: T): T {
    const r = this.db.sql
      .prepare("SELECT value FROM awin_state WHERE publisher_id=? AND key=?")
      .get(this.publisherId, key);
    return r ? (JSON.parse(String(r.value)) as T) : fallback;
  }
  setState(key: string, value: unknown) {
    this.db.sql
      .prepare(
        "INSERT INTO awin_state VALUES(?,?,?) ON CONFLICT(publisher_id,key) DO UPDATE SET value=excluded.value",
      )
      .run(this.publisherId, key, JSON.stringify(value));
  }
  revision() {
    return this.state("revision", 0);
  }
  changed() {
    this.setState("revision", this.revision() + 1);
  }
  savePrograms(programs: Program[], autoActivate: boolean) {
    this.db.transaction(() => {
      this.db.sql
        .prepare(
          "UPDATE awin_advertisers SET relationship='notjoined' WHERE publisher_id=?",
        )
        .run(this.publisherId);
      const stmt = this.db.sql.prepare(
        `INSERT INTO awin_advertisers(publisher_id,id,name,logo_url,relationship,status,link_status,country,currency,domains,enabled,discovered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(publisher_id,id) DO UPDATE SET name=excluded.name,logo_url=excluded.logo_url,relationship=excluded.relationship,status=excluded.status,link_status=excluded.link_status,country=excluded.country,currency=excluded.currency,domains=excluded.domains,discovered_at=excluded.discovered_at`,
      );
      for (const p of programs) {
        if (p.publisherId !== this.publisherId)
          throw new AwinError("ineligible");
        stmt.run(
          this.publisherId,
          p.id,
          p.name,
          p.logoUrl,
          p.relationship,
          p.status,
          p.linkStatus,
          p.country,
          p.currency,
          JSON.stringify(p.domains),
          autoActivate ? 1 : 0,
          p.discoveredAt,
        );
      }
      this.setState("connection", {
        status: "connected",
        checkedAt: iso(),
        errorCode: null,
      });
      this.changed();
    });
  }
  advertisers(): AwinAdvertiser[] {
    return this.db.sql
      .prepare(
        "SELECT * FROM awin_advertisers WHERE publisher_id=? ORDER BY name",
      )
      .all(this.publisherId)
      .map((r) => {
        const feeds = this.feeds(Number(r.id));
        return {
          id: Number(r.id),
          publisherId: this.publisherId,
          name: String(r.name),
          logoUrl: r.logo_url as string | null,
          relationship: r.relationship as AwinAdvertiser["relationship"],
          status: String(r.status),
          linkStatus: r.link_status as string | null,
          country: r.country as string | null,
          currency: r.currency as string | null,
          domains: JSON.parse(String(r.domains)) as string[],
          allowedDomains: JSON.parse(String(r.allowed_domains)),
          excludedTerms: JSON.parse(String(r.excluded_terms)),
          searchUrlTemplate: this.state(`searchTemplate:${r.id}`, ""),
          enabled: !!r.enabled,
          termsReviewed: !!r.terms_reviewed,
          termsReference: String(r.terms_reference),
          discoveredAt: String(r.discovered_at),
          productCount: feeds.reduce((n, f) => n + f.productCount, 0),
          diagnostic:
            r.relationship !== "joined" ||
            r.status !== "Active" ||
            r.link_status === "Offline"
              ? "ineligible"
              : !feeds.length
                ? "catalog_unavailable"
                : !r.enabled || !r.terms_reviewed
                  ? "review_pending"
                  : feeds.some((f) => f.lastError === "restricted")
                    ? "restricted"
                    : feeds.some((f) => f.lastError)
                      ? "technical_failure"
                      : "available",
        };
      });
  }
  verifiedCount(advertiser: number) {
    return Number(
      this.db.sql
        .prepare(
          "SELECT count(*) AS n FROM awin_items i JOIN awin_feeds f ON f.id=i.feed_id AND f.active_run_id=i.run_id WHERE f.publisher_id=? AND f.advertiser_id=? AND f.available=1 AND json_extract(f.policy,'$.marketCountry')='BR' AND (i.currency='BRL' OR (json_extract(f.policy,'$.allowUnpricedCurrency')=1 AND json_extract(f.policy,'$.includeUnknownPrice')=1)) AND json_extract(i.payload,'$.linkStatus')='verified'",
        )
        .get(this.publisherId, advertiser)?.n || 0,
    );
  }
  hasBrazilCatalog(advertiser: number) {
    return !!this.db.sql
      .prepare(
        "SELECT 1 FROM awin_items i JOIN awin_feeds f ON f.id=i.feed_id AND f.active_run_id=i.run_id WHERE f.publisher_id=? AND f.advertiser_id=? AND f.available=1 AND json_extract(f.policy,'$.marketCountry')='BR' AND (i.currency='BRL' OR (json_extract(f.policy,'$.allowUnpricedCurrency')=1 AND json_extract(f.policy,'$.includeUnknownPrice')=1)) LIMIT 1",
      )
      .get(this.publisherId, advertiser);
  }
  advertiser(id: number): AwinAdvertiser | undefined {
    const r = this.db.sql
      .prepare("SELECT * FROM awin_advertisers WHERE publisher_id=? AND id=?")
      .get(this.publisherId, id);
    if (!r) return;
    return {
      id: Number(r.id),
      publisherId: this.publisherId,
      name: String(r.name),
      logoUrl: r.logo_url as string | null,
      relationship: r.relationship as AwinAdvertiser["relationship"],
      status: String(r.status),
      linkStatus: r.link_status as string | null,
      country: r.country as string | null,
      currency: r.currency as string | null,
      domains: JSON.parse(String(r.domains)),
      allowedDomains: JSON.parse(String(r.allowed_domains)),
      excludedTerms: JSON.parse(String(r.excluded_terms)),
      searchUrlTemplate: this.state(`searchTemplate:${r.id}`, ""),
      enabled: !!r.enabled,
      termsReviewed: !!r.terms_reviewed,
      termsReference: String(r.terms_reference),
      discoveredAt: String(r.discovered_at),
      diagnostic: "available",
      productCount: 0,
    };
  }
  configureAdvertiser(
    id: number,
    input: {
      enabled: boolean;
      termsReviewed: boolean;
      termsReference: string;
      allowedDomains?: string[];
      excludedTerms?: string[];
      searchUrlTemplate?: string;
    },
  ) {
    this.nonSecret(input);
    if (!this.advertiser(id)) throw new AwinError("ineligible");
    if (input.searchUrlTemplate !== undefined) {
      const a = this.advertiser(id)!;
      const template = input.searchUrlTemplate;
      if (
        template &&
        (template.split("{query}").length > 4 ||
          !merchantUrl(template.replace("{query}", "produto"), {
            ...a,
            allowedDomains: input.allowedDomains || [],
          }))
      )
        throw new AwinError("unsafe_url");
      this.setState(`searchTemplate:${id}`, template);
    }
    this.db.sql
      .prepare(
        "UPDATE awin_advertisers SET enabled=?,terms_reviewed=?,terms_reference=?,allowed_domains=?,excluded_terms=? WHERE publisher_id=? AND id=?",
      )
      .run(
        +input.enabled,
        +input.termsReviewed,
        input.termsReference,
        JSON.stringify(input.allowedDomains || []),
        JSON.stringify(input.excludedTerms || []),
        this.publisherId,
        id,
      );
    this.changed();
  }
  saveFeeds(feeds: FeedMetadata[]) {
    this.nonSecret(feeds);
    if (!feeds.length && this.feeds().length) throw new AwinError("empty_feed");
    this.db.transaction(() => {
      this.db.sql
        .prepare("UPDATE awin_feeds SET available=0 WHERE publisher_id=?")
        .run(this.publisherId);
      const stmt = this.db.sql.prepare(
        `INSERT INTO awin_feeds(id,publisher_id,advertiser_id,source_id,name,format,language,currency,source_updated_at,download_path,policy,expected_records,metadata_checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,format=excluded.format,language=excluded.language,currency=excluded.currency,source_updated_at=excluded.source_updated_at,download_path=excluded.download_path,available=1,expected_records=excluded.expected_records,metadata_checked_at=excluded.metadata_checked_at`,
      );
      for (const f of feeds) {
        if (f.publisherId !== this.publisherId)
          throw new AwinError("ineligible");
        stmt.run(
          f.id,
          this.publisherId,
          f.advertiserId,
          f.sourceId,
          f.name,
          f.format,
          f.language,
          f.currency,
          f.sourceUpdatedAt,
          f.downloadPath,
          JSON.stringify(
            feedPolicySchema.parse({
              marketCountry:
                this.advertiser(f.advertiserId)?.country === "BR"
                  ? "BR"
                  : "unknown",
            }),
          ),
          f.expectedRecords,
          f.metadataCheckedAt,
        );
      }
      this.setState("feedDiscovery", { checkedAt: iso(), errorCode: null });
      this.changed();
    });
  }
  private mapFeed(r: Row): AwinFeed {
    return {
      id: String(r.id),
      publisherId: Number(r.publisher_id),
      advertiserId: Number(r.advertiser_id),
      sourceId: String(r.source_id),
      name: String(r.name),
      format: r.format as "csv" | "jsonl",
      language: String(r.language),
      currency: r.currency as string | null,
      sourceUpdatedAt: r.source_updated_at as string | null,
      downloadPath: String(r.download_path),
      policy: feedPolicySchema.parse(JSON.parse(String(r.policy))),
      activeRunId: r.active_run_id as string | null,
      lastRunAt: r.last_run_at as string | null,
      nextRunAt: r.next_run_at as string | null,
      lastError: r.last_error as string | null,
      expectedRecords:
        r.expected_records === null ? null : Number(r.expected_records),
      metadataCheckedAt: r.metadata_checked_at as string | null,
      productCount: Number(
        this.db.sql
          .prepare("SELECT COUNT(*) AS n FROM awin_items WHERE run_id=?")
          .get(r.active_run_id as string | null)?.n || 0,
      ),
    };
  }
  feeds(advertiserId?: number): AwinFeed[] {
    return this.db.sql
      .prepare(
        "SELECT * FROM awin_feeds WHERE publisher_id=? AND available=1" +
          (advertiserId ? " AND advertiser_id=?" : "") +
          " ORDER BY advertiser_id,name",
      )
      .all(
        ...(advertiserId
          ? [this.publisherId, advertiserId]
          : [this.publisherId]),
      )
      .map((r) => this.mapFeed(r));
  }
  feed(id: string, available = true): AwinFeed {
    const r = this.db.sql
      .prepare(
        "SELECT * FROM awin_feeds WHERE publisher_id=? AND id=?" +
          (available ? " AND available=1" : ""),
      )
      .get(this.publisherId, id);
    if (!r) throw new AwinError("catalog_unavailable");
    return this.mapFeed(r);
  }
  configureFeed(id: string, policy: FeedPolicy) {
    this.nonSecret(policy);
    this.feed(id);
    if (policy.enabled && policy.marketCountry !== "BR")
      throw new AwinError("market_unconfirmed");
    this.db.sql
      .prepare("UPDATE awin_feeds SET policy=?,next_run_at=? WHERE id=?")
      .run(JSON.stringify(policy), iso(), id);
    this.changed();
  }
  categories(advertiserId: number) {
    return this.db.sql
      .prepare(
        "SELECT external,category,enabled FROM awin_categories WHERE publisher_id=? AND advertiser_id=? ORDER BY external",
      )
      .all(this.publisherId, advertiserId)
      .map((r) => ({
        external: String(r.external),
        category: String(r.category),
        enabled: !!r.enabled,
      }));
  }
  category(advertiserId: number, external: string) {
    return this.db.sql
      .prepare(
        "SELECT category,enabled FROM awin_categories WHERE publisher_id=? AND advertiser_id=? AND external=?",
      )
      .get(this.publisherId, advertiserId, external);
  }
  saveCategory(
    advertiserId: number,
    rule: { external: string; category: string; enabled: boolean },
  ) {
    this.nonSecret(rule);
    if (!this.advertiser(advertiserId)) throw new AwinError("ineligible");
    this.db.sql
      .prepare(
        "INSERT INTO awin_categories VALUES(?,?,?,?,?) ON CONFLICT(publisher_id,advertiser_id,external) DO UPDATE SET category=excluded.category,enabled=excluded.enabled",
      )
      .run(
        this.publisherId,
        advertiserId,
        rule.external,
        rule.category,
        +rule.enabled,
      );
    this.changed();
  }
  runs(): AwinRun[] {
    return this.db.sql
      .prepare(
        "SELECT r.* FROM awin_runs r JOIN awin_feeds f ON f.id=r.feed_id WHERE f.publisher_id=? ORDER BY r.created_at DESC LIMIT 100",
      )
      .all(this.publisherId)
      .map((r) => this.mapRun(r));
  }
  private mapRun(r: Row): AwinRun {
    return {
      id: String(r.id),
      feedId: String(r.feed_id),
      status: r.status as AwinRun["status"],
      startedAt: r.started_at as string | null,
      finishedAt: r.finished_at as string | null,
      processed: Number(r.processed),
      accepted: Number(r.accepted),
      rejected: Number(r.rejected),
      durationMs: r.duration_ms as number | null,
      peakRssBytes: r.peak_rss_bytes as number | null,
      downloadedBytes: Number(r.downloaded_bytes),
      errorCode: r.error_code as string | null,
    };
  }
  enqueue(id: string, force = false) {
    this.feed(id);
    const existing = this.db.sql
      .prepare(
        "SELECT id FROM awin_runs WHERE feed_id=? AND status IN ('queued','running')",
      )
      .get(id);
    if (existing) return String(existing.id);
    const run = randomUUID();
    this.db.sql
      .prepare(
        "INSERT INTO awin_runs(id,feed_id,status,source_updated_at,created_at) VALUES(?,?,'queued',?,?)",
      )
      .run(run, id, force ? null : this.feed(id).sourceUpdatedAt, iso());
    return run;
  }
  claim(): AwinRun | undefined {
    return this.db.transaction(() => {
      this.db.sql
        .prepare(
          "UPDATE awin_runs SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,error_code='interrupted' WHERE status='running' AND lease_until<? AND feed_id IN (SELECT id FROM awin_feeds WHERE publisher_id=?)",
        )
        .run(Date.now(), this.publisherId);
      const r = this.db.sql
        .prepare(
          "SELECT r.* FROM awin_runs r JOIN awin_feeds f ON f.id=r.feed_id WHERE r.status='queued' AND f.publisher_id=? ORDER BY r.created_at LIMIT 1",
        )
        .get(this.publisherId);
      if (!r) return;
      this.db.sql
        .prepare(
          "UPDATE awin_runs SET status='running',attempts=attempts+1,started_at=?,lease_until=? WHERE id=?",
        )
        .run(iso(), Date.now() + 300000, String(r.id));
      // A crashed staging snapshot is never public; restart its import from the beginning.
      return this.mapRun({ ...r, status: "running", started_at: iso() });
    });
  }
  clearStaging(run: AwinRun) {
    return Number(
      this.db.sql
        .prepare(
          "DELETE FROM awin_items WHERE rowid IN (SELECT rowid FROM awin_items WHERE run_id=? LIMIT 500)",
        )
        .run(run.id).changes,
    );
  }
  stage(run: AwinRun, items: AwinRecord[]) {
    this.nonSecret(items);
    this.db.transaction(() => {
      const stmt = this.db.sql.prepare(
        "INSERT INTO awin_items(run_id,feed_id,listing_key,catalog_id,payload,search_text,currency,category,price) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(run_id,listing_key) DO UPDATE SET payload=excluded.payload,search_text=excluded.search_text,currency=excluded.currency,category=excluded.category,price=excluded.price",
      );
      for (const item of items)
        stmt.run(
          run.id,
          run.feedId,
          item.listingKey,
          stableListingId("awin", item.listingKey),
          JSON.stringify(item),
          [item.name, item.brand, item.model, item.mpn, item.externalCategory]
            .filter(Boolean)
            .join(" "),
          item.currency,
          item.category,
          item.price,
        );
      this.db.sql
        .prepare("UPDATE awin_runs SET lease_until=? WHERE id=?")
        .run(Date.now() + 300000, run.id);
    });
  }
  finish(
    run: AwinRun,
    status: AwinRun["status"],
    metrics: {
      processed: number;
      accepted: number;
      rejected: number;
      durationMs: number;
      peakRssBytes: number;
      downloadedBytes: number;
      errorCode?: string | null;
    },
  ) {
    const f = this.feed(run.feedId, false),
      now = iso();
    this.db.transaction(() => {
      this.db.sql
        .prepare(
          "UPDATE awin_runs SET status=?,finished_at=?,processed=?,accepted=?,rejected=?,duration_ms=?,peak_rss_bytes=?,downloaded_bytes=?,error_code=?,lease_until=0,source_updated_at=? WHERE id=?",
        )
        .run(
          status,
          now,
          metrics.processed,
          metrics.accepted,
          metrics.rejected,
          metrics.durationMs,
          metrics.peakRssBytes,
          metrics.downloadedBytes,
          metrics.errorCode || null,
          f.sourceUpdatedAt,
          run.id,
        );
      this.db.sql
        .prepare(
          "UPDATE awin_feeds SET active_run_id=CASE WHEN ?='complete' THEN ? ELSE active_run_id END,last_run_at=?,next_run_at=?,last_error=? WHERE id=?",
        )
        .run(
          status,
          run.id,
          now,
          new Date(Date.now() + f.policy.intervalHours * 3600000).toISOString(),
          metrics.errorCode || null,
          f.id,
        );
      if (status === "complete") this.changed();
    });
  }
  activeSourceDate(feed: AwinFeed) {
    const r = feed.activeRunId
      ? this.db.sql
          .prepare("SELECT source_updated_at FROM awin_runs WHERE id=?")
          .get(feed.activeRunId)
      : undefined;
    return r?.source_updated_at as string | null | undefined;
  }
  // Reclaim small chunks; readers always use the atomically switched active snapshot.
  cleanup() {
    this.db.sql
      .prepare(
        "DELETE FROM awin_items WHERE rowid IN (SELECT i.rowid FROM awin_items i JOIN awin_feeds f ON f.id=i.feed_id JOIN awin_runs r ON r.id=i.run_id WHERE f.publisher_id=? AND i.run_id IS NOT f.active_run_id AND r.status NOT IN ('queued','running') LIMIT 500)",
      )
      .run(this.publisherId);
  }
  private withPolicy(row: Row): AwinRecord {
    const item = JSON.parse(String(row.payload)) as AwinRecord;
    const policy = JSON.parse(String(row.policy)) as FeedPolicy;
    const basis = item.sourceUpdatedAt || item.feedUpdatedAt;
    if (basis && item.validUntil) {
      // A shorter policy applies to existing snapshots. Extending it requires
      // reimporting, so a promotion's original expiry cannot be extended here.
      const end = Math.min(
        Date.parse(item.validUntil),
        Date.parse(basis) + policy.priceTtlHours * 3600000,
      );
      item.validUntil = Number.isFinite(end)
        ? new Date(end).toISOString()
        : null;
    }
    return item;
  }
  records(
    q: string,
    limit = 100,
    advertiserId?: number,
    published = false,
    storeIds?: string[],
  ): AwinRecord[] {
    const tokens =
      productSearchText(q)
        .match(/[\p{L}\p{N}]+/gu)
        ?.slice(0, 10) || [];
    const match = tokens
      .flatMap((t, i) => {
        if (t === "maquina" && tokens[i + 1] === "lavar")
          return ['(("maquina"* AND "lavar"*) OR "lavadora"*)'];
        if (t === "lavar" && tokens[i - 1] === "maquina") return [];
        return [
          t === "airfryer"
            ? '("airfryer"* OR ("air"* AND "fryer"*))'
            : '"' + t + '"*',
        ];
      })
      .join(" AND ");
    const from = match
      ? "awin_items_fts s CROSS JOIN awin_items i ON i.rowid=s.rowid"
      : "awin_items i";
    const stores = storeIds
      ? storeIds.length
        ? ` AND a.id IN (${storeIds.map(() => "?").join(",")})`
        : " AND 0"
      : "";
    const sql = `SELECT i.payload,f.policy FROM ${from} JOIN awin_feeds f ON f.id=i.feed_id AND f.active_run_id=i.run_id JOIN awin_advertisers a ON a.id=f.advertiser_id AND a.publisher_id=f.publisher_id WHERE f.publisher_id=? AND f.available=1${match ? " AND awin_items_fts MATCH ?" : ""}${advertiserId ? " AND a.id=?" : ""}${stores}${published ? " AND a.enabled=1 AND a.terms_reviewed=1 AND a.relationship='joined' AND a.status='Active' AND COALESCE(a.link_status,'Online')<>'Offline' AND json_extract(f.policy,'$.enabled')=1 AND json_extract(f.policy,'$.marketCountry')='BR' AND (i.currency='BRL' OR (json_extract(f.policy,'$.allowUnpricedCurrency')=1 AND json_extract(f.policy,'$.includeUnknownPrice')=1))" : ""} ORDER BY ${match ? "s.rank," : ""}i.rowid DESC LIMIT ?`;
    return this.db.sql
      .prepare(sql)
      .all(
        this.publisherId,
        ...(match ? [match] : []),
        ...(advertiserId ? [advertiserId] : []),
        ...(storeIds || []),
        limit,
      )
      .map((r) => this.withPolicy(r));
  }
  record(key: string): AwinRecord | undefined {
    const r = this.db.sql
      .prepare(
        "SELECT i.payload,f.policy FROM awin_items i INDEXED BY awin_items_listing JOIN awin_feeds f ON f.active_run_id=i.run_id AND f.id=i.feed_id WHERE f.publisher_id=? AND i.listing_key=? AND f.available=1 ORDER BY f.source_updated_at DESC LIMIT 1",
      )
      .get(this.publisherId, key);
    return r ? this.withPolicy(r) : undefined;
  }
  eligibleRecord(key: string): AwinRecord | undefined {
    const rows = this.db.sql
      .prepare(
        `SELECT i.payload,f.policy FROM awin_items i INDEXED BY awin_items_listing JOIN awin_feeds f ON f.active_run_id=i.run_id AND f.id=i.feed_id JOIN awin_advertisers a ON a.publisher_id=f.publisher_id AND a.id=f.advertiser_id LEFT JOIN awin_categories c ON c.publisher_id=a.publisher_id AND c.advertiser_id=a.id AND c.external=json_extract(i.payload,'$.externalCategory') WHERE f.publisher_id=? AND i.listing_key=? AND f.available=1 AND a.enabled=1 AND a.terms_reviewed=1 AND a.relationship='joined' AND a.status='Active' AND COALESCE(a.link_status,'Online')<>'Offline' AND json_extract(f.policy,'$.enabled')=1 AND json_extract(f.policy,'$.marketCountry')='BR' AND (i.currency='BRL' OR (json_extract(f.policy,'$.allowUnpricedCurrency')=1 AND json_extract(f.policy,'$.includeUnknownPrice')=1)) AND COALESCE(c.enabled,1)=1 AND json_extract(i.payload,'$.linkStatus')='verified' AND (json_extract(f.policy,'$.excludeOutOfStock')=0 OR json_extract(i.payload,'$.availability')<>'out_of_stock') AND (json_extract(f.policy,'$.includeUnknownPrice')=1 OR (i.currency='BRL' AND i.price IS NOT NULL AND json_extract(i.payload,'$.validUntil')>?)) ORDER BY f.source_updated_at DESC LIMIT 100`,
      )
      .all(this.publisherId, key, iso());
    for (const row of rows) {
      const item = this.withPolicy(row);
      if (
        JSON.parse(String(row.policy)).includeUnknownPrice ||
        priceCurrent(item)
      )
        return item;
    }
    return undefined;
  }
  byCatalogId(ids: string[]): AwinRecord[] {
    if (!ids.length) return [];
    return this.db.sql
      .prepare(
        `SELECT i.payload,f.policy FROM awin_items i INDEXED BY awin_items_catalog JOIN awin_feeds f ON f.active_run_id=i.run_id AND f.id=i.feed_id WHERE f.publisher_id=? AND i.catalog_id IN (${ids.map(() => "?").join(",")}) AND f.available=1`,
      )
      .all(this.publisherId, ...ids)
      .map((r) => this.withPolicy(r));
  }
  byIdentity(key: string): AwinRecord[] {
    return this.db.sql
      .prepare(
        "SELECT i.payload,f.policy FROM awin_items i INDEXED BY awin_items_identity JOIN awin_feeds f ON f.active_run_id=i.run_id AND f.id=i.feed_id WHERE json_extract(i.payload,'$.identityKey')=? AND json_extract(i.payload,'$.identityKey') IS NOT NULL AND f.publisher_id=? AND f.available=1 LIMIT 100",
      )
      .all(key, this.publisherId)
      .map((r) => this.withPolicy(r));
  }
  provenance(key: string) {
    return this.db.sql
      .prepare(
        "SELECT f.id,f.name,f.source_updated_at AS updatedAt FROM awin_items i INDEXED BY awin_items_listing JOIN awin_feeds f ON f.active_run_id=i.run_id AND f.id=i.feed_id WHERE f.publisher_id=? AND i.listing_key=?",
      )
      .all(this.publisherId, key);
  }
  link(advertiser: number, destination: string, context: string) {
    const r = this.db.sql
      .prepare(
        "SELECT url FROM awin_links WHERE publisher_id=? AND advertiser_id=? AND destination=? AND context=? AND verified_at>?",
      )
      .get(
        this.publisherId,
        advertiser,
        destination,
        context,
        new Date(Date.now() - 30 * 86400000).toISOString(),
      );
    return r ? String(r.url) : null;
  }
  saveLink(
    advertiser: number,
    destination: string,
    context: string,
    url: string,
  ) {
    this.nonSecret([destination, url]);
    this.db.sql
      .prepare(
        "INSERT INTO awin_links VALUES(?,?,?,?,?,?) ON CONFLICT(publisher_id,advertiser_id,destination,context) DO UPDATE SET url=excluded.url,verified_at=excluded.verified_at",
      )
      .run(this.publisherId, advertiser, destination, context, url, iso());
  }
}
