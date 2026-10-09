import type { Migration } from "../../database.js";
export const analyticsMigration: Migration = {
  id: "analytics:001-data",
  sql: `
    CREATE TABLE seo_url_inventory (
      url TEXT PRIMARY KEY, path TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
      canonical TEXT NOT NULL, indexable INTEGER NOT NULL, category_id TEXT, post_id TEXT,
      created_at TEXT, updated_at TEXT, sitemap TEXT, label TEXT NOT NULL, observed_at TEXT NOT NULL
    );
    CREATE INDEX seo_inventory_category ON seo_url_inventory(category_id);
    CREATE TABLE analytics_sync_runs (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, property TEXT NOT NULL,
      started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL,
      period_from TEXT NOT NULL, period_to TEXT NOT NULL,
      rows_received INTEGER NOT NULL DEFAULT 0, rows_written INTEGER NOT NULL DEFAULT 0, error_code TEXT
    );
    CREATE INDEX analytics_runs_source ON analytics_sync_runs(source, property, started_at);
    CREATE TABLE analytics_daily_facts (
      dataset TEXT NOT NULL, property TEXT NOT NULL, date TEXT NOT NULL,
      dimension_key TEXT NOT NULL, dimensions TEXT NOT NULL, metrics TEXT NOT NULL,
      run_id TEXT NOT NULL REFERENCES analytics_sync_runs(id), synced_at TEXT NOT NULL,
      PRIMARY KEY(dataset, property, date, dimension_key)
    );
    CREATE INDEX analytics_facts_date ON analytics_daily_facts(dataset, property, date);
    CREATE TABLE analytics_daily_coverage (
      dataset TEXT NOT NULL, property TEXT NOT NULL, date TEXT NOT NULL,
      complete INTEGER NOT NULL, data_state TEXT NOT NULL, timezone TEXT NOT NULL,
      row_count INTEGER NOT NULL, warnings TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES analytics_sync_runs(id),
      PRIMARY KEY(dataset, property, date)
    );
    CREATE TABLE analytics_snapshots (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, property TEXT NOT NULL, resource TEXT NOT NULL,
      observed_at TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE INDEX analytics_snapshots_resource ON analytics_snapshots(kind, property, resource, observed_at);
    CREATE TABLE analytics_sync_locks (
      source TEXT NOT NULL, property TEXT NOT NULL, owner_pid INTEGER NOT NULL, acquired_at TEXT NOT NULL,
      PRIMARY KEY(source, property)
    );
  `,
};
