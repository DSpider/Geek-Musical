import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { coreMigration } from "./migrations/001-core.js";
export interface Migration {
  id: string;
  sql: string;
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function openDatabase(filename: string) {
  const deadline = Date.now() + 5000;
  for (let attempt = 0; ; attempt++) {
    const connection = new DatabaseSync(filename);
    try {
      connection.exec(
        "PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
      );
      return connection;
    } catch (error) {
      connection.close();
      const code = Number((error as { errcode?: number }).errcode) & 255;
      if (![5, 6].includes(code) || attempt >= 5 || Date.now() >= deadline)
        throw error;
      // Competing WAL transitions can skip SQLite's busy handler. Closing the
      // connection releases its read lock before a short, bounded reopen.
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        30 + Math.random() * 70,
      );
    }
  }
}
export class AdminDatabase {
  readonly sql: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:") {
      mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    }
    this.sql = openDatabase(filename);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    this.migrate([coreMigration]);
  }
  transaction<T>(fn: () => T): T {
    this.sql.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.sql.exec("COMMIT");
      return result;
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    }
  }
  migrate(migrations: Migration[]) {
    for (const migration of migrations)
      this.transaction(() => {
        const previous = this.sql
          .prepare("SELECT checksum FROM schema_migrations WHERE id=?")
          .get(migration.id);
        const checksum = digest(migration.sql);
        if (previous) {
          if (previous.checksum !== checksum)
            throw new Error("Migration aplicada foi alterada.");
          return;
        }
        this.sql.exec(migration.sql);
        this.sql
          .prepare("INSERT INTO schema_migrations VALUES (?, ?, ?)")
          .run(migration.id, checksum, new Date().toISOString());
      });
  }
  audit(
    userId: string | null,
    action: string,
    resource: string,
    resourceId: string | null = null,
    result = "SUCCESS",
  ) {
    return Number(
      this.sql
        .prepare(
          "INSERT INTO audit_log(user_id, action, resource, resource_id, created_at, result) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          userId,
          action,
          resource,
          resourceId,
          new Date().toISOString(),
          result,
        ).lastInsertRowid,
    );
  }
  close() {
    this.sql.close();
  }
}
