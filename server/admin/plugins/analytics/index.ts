import { z } from "zod";
import type { AdminPluginDefinition } from "../../registry.js";
import { analyticsMigration } from "./migration.js";
import {
  analyticsConfig,
  collectionEnabled,
} from "../../../analytics/config.js";
import { AnalyticsRepository } from "../../../analytics/repository.js";
import { analyticsReport } from "../../../analytics/reports.js";
import { addDays, dateInZone } from "../../../analytics/sync.js";
import { urlInventory } from "../../../web/inventory.js";
import { sitemapDocuments } from "../../../web/sitemaps.js";
import { periodSchema } from "../../../../shared/analytics.js";
import { settingsApi } from "../settings-api.js";
import { analyticsService } from "../../../analytics/service.js";
import { safeAnalyticsError } from "../../../analytics/errors.js";
import { AdminError } from "../../errors.js";
import { readWeeklyAuditSnapshot } from "../../../analytics/weekly-audit.js";

const filtersSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    category: z.string().max(80).optional(),
    post: z.string().max(80).optional(),
    path: z.string().max(500).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const analyticsPlugin: AdminPluginDefinition = {
  id: "analytics",
  name: "Analytics",
  version: "1.0.0",
  description:
    "Inventário, Search Console, GA4 e sinais SEO baseados em dados observados.",
  permissions: [
    { id: "analytics.read", roles: ["admin", "seo"] },
    { id: "analytics.manage", roles: ["admin"] },
  ],
  pages: [
    {
      path: "/gm-admin/analytics",
      page: "analytics",
      label: "Analytics",
      icon: "ChartNoAxesCombined",
      permission: "analytics.read",
      position: 66,
    },
  ],
  migrations: [analyticsMigration],
  close: (ctx) => analyticsService(ctx).close(),
  settings: [
    { key: "analytics.autoSync", schema: z.boolean(), defaultValue: true },
    {
      key: "analytics.syncIntervalHours",
      schema: z.number().int().min(1).max(168),
      defaultValue: 6,
    },
    { key: "analytics.auditPaused", schema: z.boolean(), defaultValue: false },
    {
      key: "analytics.auditRequestedAt",
      schema: z.union([z.literal(""), z.iso.datetime()]),
      defaultValue: "",
    },
    {
      key: "analytics.minImpressions",
      schema: z.number().int().min(1).max(1000000),
      defaultValue: 100,
    },
    {
      key: "analytics.maxCtr",
      schema: z.number().min(0).max(1),
      defaultValue: 0.02,
    },
    {
      key: "analytics.changeRatio",
      schema: z.number().min(0.01).max(10),
      defaultValue: 0.2,
    },
    {
      key: "analytics.minDays",
      schema: z.number().int().min(7).max(90),
      defaultValue: 28,
    },
  ],
  services: { repository: AnalyticsRepository, report: analyticsReport },
  api: [
    ...settingsApi("analytics", "analytics.manage"),
    {
      method: "post",
      path: "/analytics/sync",
      permission: "analytics.manage",
      handle: (ctx, req, res) => {
        const input = z
          .object({
            source: z.enum(["all", "ga4", "gsc"]).default("all"),
            period: periodSchema.optional(),
          })
          .strict()
          .parse(req.body);
        try {
          const state = analyticsService(ctx).request(
            input.source,
            input.period,
          );
          res.status(202).json(state);
        } catch (error) {
          throw new AdminError(
            "VALIDATION_ERROR",
            safeAnalyticsError(error).message,
          );
        }
      },
    },
    {
      method: "get",
      path: "/analytics/weekly-audit",
      permission: "analytics.read",
      handle: (ctx, _req, res) =>
        res.json({
          ...readWeeklyAuditSnapshot(),
          paused: ctx.settings.get<boolean>("analytics.auditPaused"),
          requestedAt: ctx.settings.get<string>("analytics.auditRequestedAt"),
          revision: ctx.settings.revision("analytics"),
          executor:
            "Codex local: pedidos manuais ficam na fila até uma execução desta tarefa; não há dispatcher remoto habilitado.",
        }),
    },
    {
      method: "get",
      path: "/analytics/overview",
      permission: "analytics.read",
      handle: (ctx, req, res) => {
        const filters = filtersSchema.parse(req.query);
        const end = addDays(dateInZone("America/Sao_Paulo"), -1);
        const period = periodSchema.parse({
          from: filters.from || addDays(end, -27),
          to: filters.to || end,
        });
        const options = analyticsConfig();
        const repo = new AnalyticsRepository(ctx.db);
        ctx.content.refresh();
        const catalog = ctx.content.catalog(true);
        const inventory = urlInventory(catalog, options.reportSiteUrl);
        const report = analyticsReport(
          repo,
          inventory,
          { gsc: options.gscSite, ga4: options.ga4Property },
          period,
          {
            minImpressions: ctx.settings.get<number>(
              "analytics.minImpressions",
            ),
            maxCtr: ctx.settings.get<number>("analytics.maxCtr"),
            changeRatio: ctx.settings.get<number>("analytics.changeRatio"),
            minDays: ctx.settings.get<number>("analytics.minDays"),
          },
        );
        res.json({
          environment: ctx.web.environment || "development",
          reportSiteUrl: options.reportSiteUrl,
          syncState: analyticsService(ctx).state,
          properties: {
            gscSite: options.gscSite,
            ga4Property: options.ga4Property,
            measurementId: options.measurementId,
          },
          configured: {
            gsc: !!options.gscSite,
            ga4: !!options.ga4Property,
            authentication: !!options.credentialsFile,
            collection: collectionEnabled(ctx.web, options),
            sync: options.sync,
            gscSync: options.gscSync,
            ga4Sync: options.ga4Sync,
          },
          sitemapCounts: sitemapDocuments(
            ctx.content.catalog(false),
            ctx.web.siteUrl,
          ).map((doc) => ({ path: doc.path, urls: doc.urls.length })),
          runs: repo.runs(),
          report,
        });
      },
    },
    {
      method: "get",
      path: "/analytics/queries",
      permission: "analytics.read",
      handle: (ctx, req, res) => {
        const filters = filtersSchema.parse(req.query);
        const end = addDays(dateInZone("America/Los_Angeles"), -3);
        const period = periodSchema.parse({
          from: filters.from || addDays(end, -27),
          to: filters.to || end,
        });
        ctx.content.refresh();
        const inventory = urlInventory(
          ctx.content.catalog(true),
          analyticsConfig().reportSiteUrl,
        );
        const scoped = filters.category || filters.post || filters.path;
        const urls = scoped
          ? inventory
              .filter(
                (url) =>
                  (!filters.category || url.categoryId === filters.category) &&
                  (!filters.post || url.postId === filters.post) &&
                  (!filters.path || url.path === filters.path),
              )
              .map((url) => url.url)
          : undefined;
        res.json(
          new AnalyticsRepository(ctx.db).queries(
            analyticsConfig().gscSite,
            period,
            urls,
            filters.page,
          ),
        );
      },
    },
    {
      method: "get",
      path: "/analytics/events",
      permission: "analytics.read",
      handle: (ctx, req, res) => {
        const input = filtersSchema.parse(req.query);
        const end = addDays(dateInZone("America/Los_Angeles"), -3);
        const period = periodSchema.parse({
          from: input.from || addDays(end, -27),
          to: input.to || end,
        });
        const rows = new AnalyticsRepository(ctx.db).facts(
          "ga4_event_daily",
          analyticsConfig().ga4Property,
          period,
        );
        const names = [...new Set(rows.map((row) => row.dimensions.eventName))];
        res.json({
          period,
          events: names.map((name) => ({
            name,
            count: rows
              .filter((row) => row.dimensions.eventName === name)
              .reduce((total, row) => total + row.metrics.eventCount, 0),
          })),
        });
      },
    },
  ],
};
