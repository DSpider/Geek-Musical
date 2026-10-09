import { randomUUID } from "node:crypto";
import type {
  RedirectInput,
  RedirectRecord,
  RedirectListInput,
} from "../../../../shared/redirect.js";
import { AdminDatabase, digest } from "../../database.js";
import { AdminError } from "../../errors.js";

const columns =
  "id, name, alias, destination, redirect_type AS redirectType, status, created_at AS createdAt, updated_at AS updatedAt";
export class RedirectRepository {
  constructor(readonly db: AdminDatabase) {}
  list(input: RedirectListInput) {
    const q = "%" + input.q.replace(/[%_\\]/g, "\\$&") + "%";
    const where =
      "WHERE (name LIKE ? ESCAPE '\\' OR alias LIKE ? ESCAPE '\\' OR destination LIKE ? ESCAPE '\\') AND (?='' OR status=?) AND (?=0 OR redirect_type=?)";
    const params = [
      q,
      q,
      q,
      input.status || "",
      input.status || "",
      input.type || 0,
      input.type || 0,
    ];
    const total = Number(
      this.db.sql
        .prepare(`SELECT COUNT(*) AS total FROM redirects ${where}`)
        .get(...params)!.total,
    );
    const pages = Math.max(1, Math.ceil(total / 15));
    const page = Math.min(input.page, pages);
    const items = this.db.sql
      .prepare(
        `SELECT ${columns} FROM redirects ${where} ORDER BY created_at DESC, id LIMIT 15 OFFSET ?`,
      )
      .all(...params, (page - 1) * 15)
      .map((row) => this.row(row)!);
    return { items, total, pages, page };
  }
  all(): RedirectRecord[] {
    return this.db.sql
      .prepare(`SELECT ${columns} FROM redirects ORDER BY created_at DESC, id`)
      .all()
      .map(
        (row) =>
          ({
            ...row,
            revision: digest(JSON.stringify(row)),
          }) as unknown as RedirectRecord,
      );
  }
  get(id: string) {
    const record = this.row(
      this.db.sql
        .prepare(`SELECT ${columns} FROM redirects WHERE id=?`)
        .get(id),
    );
    if (!record) throw new AdminError("NOT_FOUND", "Redirect não encontrado.");
    return record;
  }
  private row(
    row: Record<string, unknown> | undefined,
  ): RedirectRecord | undefined {
    return row
      ? ({
          ...row,
          revision: digest(JSON.stringify(row)),
        } as unknown as RedirectRecord)
      : undefined;
  }
  byAlias(alias: string) {
    return this.row(
      this.db.sql
        .prepare(`SELECT ${columns} FROM redirects WHERE alias=?`)
        .get(alias),
    );
  }
  create(input: RedirectInput) {
    const now = new Date().toISOString();
    return {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      revision: "",
    };
  }
  write(record: RedirectRecord) {
    this.db.sql
      .prepare(
        `INSERT INTO redirects (id,name,alias,destination,redirect_type,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, alias=excluded.alias,
      destination=excluded.destination, redirect_type=excluded.redirect_type, status=excluded.status, updated_at=excluded.updated_at`,
      )
      .run(
        record.id,
        record.name,
        record.alias,
        record.destination,
        record.redirectType,
        record.status,
        record.createdAt,
        record.updatedAt,
      );
  }
  remove(id: string) {
    this.db.sql.prepare("DELETE FROM redirects WHERE id=?").run(id);
  }
}
