import type { Migration } from "../../../database.js";
export const redirectMigration: Migration = {
  id: "redirect:001",
  sql: `CREATE TABLE redirects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    alias TEXT NOT NULL UNIQUE COLLATE NOCASE,
    destination TEXT NOT NULL,
    redirect_type INTEGER NOT NULL CHECK (redirect_type IN (301,302)),
    status TEXT NOT NULL CHECK (status IN ('active','inactive')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX redirects_status ON redirects(status);`,
};
