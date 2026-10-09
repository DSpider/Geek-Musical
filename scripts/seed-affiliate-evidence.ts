import "../server/config.js";
import { readFileSync } from "node:fs";
import { config } from "../server/config.js";
import { adminConfig } from "../server/admin/config.js";
import { AdminDatabase, digest } from "../server/admin/database.js";
import { builtinPlugins } from "../server/admin/plugins/index.js";
import { readSourceContent } from "../server/content/catalog.js";
import { affiliateStore } from "../shared/affiliate.js";
const options = adminConfig(config.web);
const db = new AdminDatabase(options.databaseFile);
try {
  builtinPlugins().initialize(db);
  const report = JSON.parse(
    readFileSync("docs/migration/official-affiliate-verification.json", "utf8"),
  );
  const source = readSourceContent(options.contentRoot);
  const urls = new Set(
    source.posts.flatMap((p) => (p.links || []).map((l) => l.url)),
  );
  const records = new Map<string, Record<string, unknown>>();
  const manual = new Map<string, Record<string, unknown>>(
    JSON.parse(
      readFileSync("docs/migration/manual-affiliate-verification.json", "utf8"),
    ).map((r: Record<string, unknown>) => [r.url, r]),
  );
  for (const record of report.records) {
    records.set(record.url, record);
    if (
      record.store === "amazon" &&
      record.product === "correct" &&
      record.officialCandidate
    )
      records.set(record.officialCandidate, record);
  }
  let added = 0;
  db.transaction(() => {
    for (const url of urls) {
      if (!affiliateStore(url)) continue;
      const proof = records.get(url);
      const official =
        proof?.store === "amazon" &&
        proof.product === "correct" &&
        proof.officialCandidate === url;
      const value = JSON.stringify({
        accessibility: "pending",
        product: official ? "correct" : "pending",
        tracking: official ? "officially-confirmed" : "unconfirmed",
        source: official
          ? "https://affiliate-program.amazon.com/creatorsapi"
          : "",
        checkedAt: proof?.checkedAt || null,
        expectedTitle: proof?.expectedTitle || null,
        observedTitle: proof?.observedTitle || null,
        productIdentity: proof?.identity || null,
        notes: official
          ? "API oficial retornou o mesmo ASIN, título idêntico e URL para geekmusical-20. A acessibilidade HTTP do destino é uma verificação independente."
          : "Link histórico preservado. Produto e rastreamento exigem comprovação individual. Consulte o relatório de migração.",
        ...manual.get(url),
      });
      const result = db.sql
        .prepare("INSERT OR IGNORE INTO affiliate_evidence VALUES (?, ?, ?)")
        .run(digest(url), value, new Date().toISOString());
      let changed = Number(result.changes);
      if (!changed && manual.has(url)) {
        changed = Number(
          db.sql
            .prepare(
              "UPDATE affiliate_evidence SET value=?,updated_at=? WHERE id=? AND json_extract(value,'$.reviewedAt') IS NULL AND json_extract(value,'$.product')='pending'",
            )
            .run(value, new Date().toISOString(), digest(url)).changes,
        );
      }
      if (changed) {
        added++;
        db.sql
          .prepare(
            "INSERT INTO affiliate_history(link_id,value,created_at) VALUES (?,?,?)",
          )
          .run(digest(url), value, new Date().toISOString());
      }
    }
    db.audit(
      null,
      "IMPORT_AFFILIATE_EVIDENCE",
      "affiliates",
      String(added),
      "SUCCESS",
    );
  });
  console.log(JSON.stringify({ added, preservedExisting: true }));
} finally {
  db.close();
}
