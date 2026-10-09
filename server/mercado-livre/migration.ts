export const meliMigration = {
  id: "meli-catalog:001",
  sql: `
CREATE TABLE meli_sources(event_id TEXT PRIMARY KEY,payload TEXT NOT NULL,identity_key TEXT,source_ms INTEGER NOT NULL,received_at TEXT NOT NULL);
CREATE INDEX meli_sources_identity ON meli_sources(identity_key,source_ms);
CREATE TABLE meli_items(identity_key TEXT PRIMARY KEY,source_event_id TEXT NOT NULL,source_ms INTEGER NOT NULL,payload TEXT NOT NULL,validation TEXT,revision INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'pending',search_text TEXT NOT NULL DEFAULT '',last_slot TEXT,next_attempt_ms INTEGER NOT NULL DEFAULT 0);
CREATE TABLE meli_changes(revision INTEGER PRIMARY KEY AUTOINCREMENT,identity_key TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE meli_batches(id TEXT PRIMARY KEY,checksum TEXT NOT NULL,kind TEXT NOT NULL,applied_at TEXT NOT NULL);
CREATE TABLE meli_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`,
};
