import { z } from "zod";
import { affiliateStore } from "../../../shared/affiliate.js";
import { safeContentLink } from "../../../shared/content.js";
import { adminUser } from "../auth.js";
import { digest } from "../database.js";
import { AdminError } from "../errors.js";
import type { AdminPluginDefinition, PluginContext } from "../registry.js";
import { readImageSource } from "../../lib/remote-image.js";

export function affiliateInventory(ctx: PluginContext) {
  const entries = new Map<
    string,
    {
      id: string;
      url: string;
      store: string;
      articles: string[];
      evidence: Record<string, unknown> | null;
    }
  >();
  for (const post of ctx.content.snapshot().posts) {
    const offers = [
      ...(post.links || []).map((l) => l.url),
      ...(ctx.content.snapshot().registries.products || [])
        .filter((p) => post.body.includes(`product:${p.id}`))
        .flatMap((p) => p.offers.map((o) => o.url)),
    ];
    for (const url of offers) {
      const store = affiliateStore(url);
      if (!store) continue;
      const id = digest(url);
      if (!entries.has(id)) {
        const row = ctx.db.sql
          .prepare("SELECT value FROM affiliate_evidence WHERE id=?")
          .get(id);
        entries.set(id, {
          id,
          url,
          store,
          articles: [],
          evidence: row ? JSON.parse(String(row.value)) : null,
        });
      }
      const row = entries.get(id)!;
      if (!row.articles.includes(post.id)) row.articles.push(post.id);
    }
  }
  return [...entries.values()];
}
const evidenceInput = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    accessibility: z.enum(["pending", "accessible", "inaccessible"]),
    product: z.enum(["pending", "correct", "incorrect"]),
    tracking: z.enum(["pending", "officially-confirmed", "unconfirmed"]),
    source: z.string().max(2000),
    notes: z.string().max(4000),
  })
  .strict();
function evidenceRevision(ctx: PluginContext, id: string) {
  return digest(
    String(
      ctx.db.sql
        .prepare("SELECT value FROM affiliate_evidence WHERE id=?")
        .get(id)?.value || "",
    ),
  );
}
export const affiliatesPlugin: AdminPluginDefinition = {
  id: "affiliates",
  name: "Afiliados",
  description:
    "Inventário deduplicado e evidências independentes de acesso, produto e rastreamento.",
  version: "1.0.0",
  required: true,
  permissions: [
    { id: "affiliates.read", roles: ["admin", "editor", "seo"] },
    { id: "affiliates.manage", roles: ["admin"] },
  ],
  pages: [
    {
      label: "Afiliados",
      path: "/gm-admin/affiliates",
      page: "affiliates",
      permission: "affiliates.read",
      icon: "Link",
      position: 45,
    },
  ],
  migrations: [
    {
      id: "affiliates:001-evidence",
      sql: "CREATE TABLE affiliate_evidence (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE affiliate_history (id INTEGER PRIMARY KEY, link_id TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL);",
    },
  ],
  api: [
    {
      method: "get",
      path: "/affiliates",
      permission: "affiliates.read",
      handle: (ctx, _req, res) =>
        res.json({
          items: affiliateInventory(ctx).map((e) => ({
            ...e,
            revision: evidenceRevision(ctx, e.id),
          })),
          identifiers: {
            amazon: "geekmusical-20",
            mercadoLivre: "geekmusical",
            shopeeSubId: "geekmusical",
          },
        }),
    },
    {
      method: "post",
      path: "/affiliates/:id/check",
      permission: "affiliates.manage",
      handle: async (ctx, req, res) => {
        const entry = affiliateInventory(ctx).find(
          (e) => e.id === req.params.id,
        );
        if (!entry) throw new AdminError("NOT_FOUND", "Link não encontrado.");
        let accessibility = "inaccessible",
          destination = entry.url;
        try {
          const result = await readImageSource(
            entry.url,
            AbortSignal.timeout(10000),
            true,
          );
          destination = result.url;
          accessibility = "accessible";
        } catch {
          /* Bounded DNS-pinned checker; previous editorial destination remains intact. */
        }
        let evidence: Record<string, unknown>;
        ctx.db.transaction(() => {
          const latest = ctx.db.sql
            .prepare("SELECT value FROM affiliate_evidence WHERE id=?")
            .get(entry.id);
          const previous = latest ? JSON.parse(String(latest.value)) : {};
          evidence = {
            ...previous,
            accessibility,
            observedDestination: destination,
            checkedAt: new Date().toISOString(),
            product: previous.product || "pending",
            tracking: previous.tracking || "pending",
          };
          ctx.db.sql
            .prepare(
              "INSERT INTO affiliate_evidence VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            )
            .run(entry.id, JSON.stringify(evidence), new Date().toISOString());
          ctx.db.sql
            .prepare(
              "INSERT INTO affiliate_history(link_id,value,created_at) VALUES (?, ?, ?)",
            )
            .run(entry.id, JSON.stringify(evidence), new Date().toISOString());
          ctx.db.audit(
            adminUser(res).id,
            "CHECK_AFFILIATE_ACCESS",
            "affiliates",
            entry.id,
          );
        });
        res.json({
          evidence: evidence!,
          revision: evidenceRevision(ctx, entry.id),
        });
      },
    },
    {
      method: "put",
      path: "/affiliates/:id",
      permission: "affiliates.manage",
      handle: (ctx, req, res) => {
        const entry = affiliateInventory(ctx).find(
          (e) => e.id === req.params.id,
        );
        if (!entry) throw new AdminError("NOT_FOUND", "Link não encontrado.");
        const { revision, ...input } = evidenceInput.parse(req.body);
        if (
          input.tracking === "officially-confirmed" &&
          (!safeContentLink(input.source) || !input.source.startsWith("https:"))
        )
          throw new AdminError(
            "VALIDATION_ERROR",
            "Informe a fonte oficial da comprovação de rastreamento.",
          );
        ctx.db.transaction(() => {
          if (revision !== evidenceRevision(ctx, entry.id))
            throw new AdminError("CONFLICT", "Evidência alterada. Recarregue.");
          const value = JSON.stringify({
            ...entry.evidence,
            ...input,
            reviewedAt: new Date().toISOString(),
          });
          ctx.db.sql
            .prepare(
              "INSERT INTO affiliate_evidence VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            )
            .run(entry.id, value, new Date().toISOString());
          ctx.db.sql
            .prepare(
              "INSERT INTO affiliate_history(link_id,value,created_at) VALUES (?, ?, ?)",
            )
            .run(entry.id, value, new Date().toISOString());
          ctx.db.audit(
            adminUser(res).id,
            "REVIEW_AFFILIATE",
            "affiliates",
            entry.id,
          );
        });
        res.json({ revision: evidenceRevision(ctx, entry.id) });
      },
    },
  ],
};
