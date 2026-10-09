import { randomUUID } from "node:crypto";
import type {
  AnalyticsSource,
  Dataset,
  DatasetResult,
  MetricRow,
  Period,
  SeoUrl,
  SyncRun,
} from "../../shared/analytics.js";
import type { AdminDatabase } from "../admin/database.js";
import { AnalyticsError } from "./errors.js";

export class AnalyticsRepository {
  constructor(readonly db: AdminDatabase) {}
  replaceInventory(rows: SeoUrl[]) {
    this.db.transaction(() => {
      this.db.sql.prepare("DELETE FROM seo_url_inventory").run();
      const insert = this.db.sql.prepare(
        "INSERT INTO seo_url_inventory VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const now = new Date().toISOString();
      for (const row of rows)
        insert.run(
          row.url,
          row.path,
          row.type,
          row.status,
          row.canonical,
          row.indexable ? 1 : 0,
          row.categoryId,
          row.postId,
          row.createdAt,
          row.updatedAt,
          row.sitemap,
          row.label,
          now,
        );
    });
  }
  acquire(source: string, property: string) {
    this.db.transaction(() => {
      const previous = this.db.sql
        .prepare(
          "SELECT owner_pid FROM analytics_sync_locks WHERE source=? AND property=?",
        )
        .get(source, property);
      if (previous) {
        try {
          process.kill(Number(previous.owner_pid), 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH")
            this.db.sql
              .prepare(
                "DELETE FROM analytics_sync_locks WHERE source=? AND property=?",
              )
              .run(source, property);
          else
            throw new AnalyticsError(
              "SYNC_BUSY",
              "Já existe uma sincronização em execução.",
            );
        }
        if (
          this.db.sql
            .prepare(
              "SELECT 1 FROM analytics_sync_locks WHERE source=? AND property=?",
            )
            .get(source, property)
        )
          throw new AnalyticsError(
            "SYNC_BUSY",
            "Já existe uma sincronização em execução para esta propriedade.",
          );
      }
      this.db.sql
        .prepare("INSERT INTO analytics_sync_locks VALUES (?, ?, ?, ?)")
        .run(source, property, process.pid, new Date().toISOString());
    });
    return () =>
      this.db.sql
        .prepare(
          "DELETE FROM analytics_sync_locks WHERE source=? AND property=? AND owner_pid=?",
        )
        .run(source, property, process.pid);
  }
  start(source: AnalyticsSource, property: string, period: Period) {
    const id = randomUUID();
    this.db.sql
      .prepare(
        "INSERT INTO analytics_sync_runs(id, source, property, started_at, status, period_from, period_to) VALUES (?, ?, ?, ?, 'running', ?, ?)",
      )
      .run(
        id,
        source,
        property,
        new Date().toISOString(),
        period.from,
        period.to,
      );
    this.db.audit(null, "ANALYTICS_SYNC_START", "analytics", id);
    return id;
  }
  finish(
    id: string,
    status: "success" | "partial" | "failed",
    received: number,
    written: number,
    code: string | null = null,
  ) {
    this.db.sql
      .prepare(
        "UPDATE analytics_sync_runs SET finished_at=?, status=?, rows_received=?, rows_written=?, error_code=? WHERE id=?",
      )
      .run(new Date().toISOString(), status, received, written, code, id);
    this.db.audit(
      null,
      "ANALYTICS_SYNC_" + status.toUpperCase(),
      "analytics",
      id,
      status === "failed" ? "FAILURE" : "SUCCESS",
    );
  }
  writeDay(
    dataset: Dataset,
    property: string,
    date: string,
    runId: string,
    result: DatasetResult,
  ) {
    if (result.rows.some((row) => row.date !== date))
      throw new AnalyticsError(
        "INVALID_DATA",
        "A API retornou datas fora do dia solicitado.",
      );
    this.db.transaction(() => {
      // Replace the successful response window, including removed/zero rows; failures keep the previous snapshot.
      this.db.sql
        .prepare(
          "DELETE FROM analytics_daily_facts WHERE dataset=? AND property=? AND date=?",
        )
        .run(dataset, property, date);
      const insert = this.db.sql.prepare(
        "INSERT INTO analytics_daily_facts VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const keys = new Set<string>();
      for (const row of result.rows) {
        const key = JSON.stringify(
          Object.entries(row.dimensions).sort(([a], [b]) => a.localeCompare(b)),
        );
        if (keys.has(key))
          throw new AnalyticsError(
            "DUPLICATE_DATA",
            "A API repetiu uma linha na paginação. A importação deste dia foi cancelada.",
          );
        keys.add(key);
        insert.run(
          dataset,
          property,
          date,
          key,
          JSON.stringify(row.dimensions),
          JSON.stringify(row.metrics),
          runId,
          new Date().toISOString(),
        );
      }
      this.db.sql
        .prepare(
          "INSERT INTO analytics_daily_coverage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dataset,property,date) DO UPDATE SET complete=excluded.complete, data_state=excluded.data_state, timezone=excluded.timezone, row_count=excluded.row_count, warnings=excluded.warnings, run_id=excluded.run_id",
        )
        .run(
          dataset,
          property,
          date,
          result.complete ? 1 : 0,
          result.dataState,
          result.timezone,
          result.rows.length,
          JSON.stringify(result.warnings),
          runId,
        );
    });
    return result.rows.length;
  }
  facts(dataset: Dataset, property: string, period: Period): MetricRow[] {
    return this.db.sql
      .prepare(
        "SELECT date, dimensions, metrics FROM analytics_daily_facts WHERE dataset=? AND property=? AND date BETWEEN ? AND ? ORDER BY date, dimension_key",
      )
      .all(dataset, property, period.from, period.to)
      .map((row) => ({
        date: String(row.date),
        dimensions: JSON.parse(String(row.dimensions)),
        metrics: JSON.parse(String(row.metrics)),
      }));
  }
  coverage(property: string, period: Period) {
    return this.db.sql
      .prepare(
        "SELECT dataset, date, complete, warnings FROM analytics_daily_coverage WHERE property=? AND date BETWEEN ? AND ? ORDER BY dataset, date",
      )
      .all(property, period.from, period.to)
      .map((row) => ({
        dataset: String(row.dataset),
        date: String(row.date),
        complete: row.complete === 1,
        warnings: JSON.parse(String(row.warnings)) as string[],
      }));
  }
  checkpoint(source: AnalyticsSource, property: string) {
    const row = this.db.sql
      .prepare(
        "SELECT period_to FROM analytics_sync_runs WHERE source=? AND property=? AND status='success' ORDER BY period_to DESC LIMIT 1",
      )
      .get(source, property);
    return row ? String(row.period_to) : null;
  }
  snapshot(kind: string, property: string, resource: string, payload: unknown) {
    this.db.sql
      .prepare(
        "INSERT INTO analytics_snapshots(kind,property,resource,observed_at,payload) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        kind,
        property,
        resource,
        new Date().toISOString(),
        JSON.stringify(payload),
      );
  }
  latestSnapshot<T>(
    kind: string,
    property: string,
    resource: string,
  ): { observedAt: string; payload: T } | null {
    const row = this.db.sql
      .prepare(
        "SELECT observed_at, payload FROM analytics_snapshots WHERE kind=? AND property=? AND resource=? ORDER BY id DESC LIMIT 1",
      )
      .get(kind, property, resource);
    return row
      ? {
          observedAt: String(row.observed_at),
          payload: JSON.parse(String(row.payload)) as T,
        }
      : null;
  }
  runs(limit = 20): SyncRun[] {
    return this.db.sql
      .prepare(
        "SELECT id, source, property, started_at AS startedAt, finished_at AS finishedAt, status, period_from AS 'from', period_to AS 'to', rows_received AS rowsReceived, rows_written AS rowsWritten, error_code AS errorCode FROM analytics_sync_runs ORDER BY started_at DESC LIMIT ?",
      )
      .all(limit) as unknown as SyncRun[];
  }
  queries(
    property: string,
    period: Period,
    urls: string[] | undefined,
    page = 1,
  ) {
    if (urls && !urls.length) return { items: [], page, total: 0, pages: 1 };
    const dataset = urls ? "gsc_page_query_daily" : "gsc_query_daily";
    const params = [dataset, property, period.from, period.to, ...(urls || [])];
    const where =
      "dataset=? AND property=? AND date BETWEEN ? AND ?" +
      (urls
        ? ` AND json_extract(dimensions,'$.page') IN (${urls.map(() => "?").join(",")})`
        : "");
    const query = "json_extract(dimensions,'$.query')";
    const total = Number(
      this.db.sql
        .prepare(
          `SELECT COUNT(DISTINCT ${query}) AS total FROM analytics_daily_facts WHERE ${where}`,
        )
        .get(...params)!.total,
    );
    const items = this.db.sql
      .prepare(
        `SELECT ${query} AS query, SUM(json_extract(metrics,'$.clicks')) AS clicks, SUM(json_extract(metrics,'$.impressions')) AS impressions, SUM(json_extract(metrics,'$.position') * json_extract(metrics,'$.impressions')) / NULLIF(SUM(json_extract(metrics,'$.impressions')),0) AS position FROM analytics_daily_facts WHERE ${where} GROUP BY ${query} ORDER BY impressions DESC, query LIMIT 50 OFFSET ?`,
      )
      .all(...params, (page - 1) * 50)
      .map((row) => ({
        query: String(row.query),
        clicks: Number(row.clicks),
        impressions: Number(row.impressions),
        position: row.position === null ? null : Number(row.position),
        ctr: Number(row.impressions)
          ? Number(row.clicks) / Number(row.impressions)
          : 0,
      }));
    return { items, page, total, pages: Math.max(1, Math.ceil(total / 50)) };
  }
}
