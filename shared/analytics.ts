import { z } from "zod";

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00Z");
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Data inválida.");
export const periodSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .strict()
  .refine(
    (period) =>
      period.from <= period.to &&
      (Date.parse(period.to) - Date.parse(period.from)) / 86400000 < 366,
    "O período deve ser crescente, com até 366 dias.",
  );
export type Period = z.infer<typeof periodSchema>;
export interface SeoUrl {
  url: string;
  path: string;
  type: string;
  label: string;
  status: string;
  canonical: string;
  indexable: boolean;
  categoryId: string | null;
  postId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  sitemap: string | null;
}
export type Dataset =
  | "gsc_search_daily"
  | "gsc_page_daily"
  | "gsc_query_daily"
  | "gsc_page_query_daily"
  | "gsc_device_daily"
  | "gsc_country_daily"
  | "ga4_page_daily"
  | "ga4_summary_daily"
  | "ga4_page_event_daily"
  | "ga4_event_daily";
export type AnalyticsSource = "gsc" | "ga4";
export interface MetricRow {
  date: string;
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}
export interface DatasetResult {
  rows: MetricRow[];
  complete: boolean;
  warnings: string[];
  dataState: string;
  timezone: string;
}
export interface SyncRun {
  id: string;
  source: string;
  property: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "partial" | "failed";
  from: string;
  to: string;
  rowsReceived: number;
  rowsWritten: number;
  errorCode: string | null;
}
export interface SearchMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
}
export interface PageAnalytics {
  pageViews: number;
  sessions: number;
  engagedSessions: number;
  engagementSeconds: number;
  activeUserDays: number;
}
export interface VisitedPage {
  path: string;
  label: string;
  categoryId: string | null;
  analytics: PageAnalytics;
  clicks: number | null;
  affiliateClicks: number | null;
  ctaClicks: number | null;
  searches: number | null;
  events: number | null;
}
export interface AnalyticsSummary extends PageAnalytics {
  events: number;
  newUsers: number;
  keyEvents: number;
}
export interface AnalyticsSyncState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  errors: { source: AnalyticsSource; code: string; message: string }[];
}
export interface UrlReport extends SeoUrl {
  search: SearchMetrics | null;
  previousSearch: SearchMetrics | null;
  analytics: PageAnalytics | null;
  inspection: {
    verdict: string | null;
    coverageState: string | null;
    inspectedAt: string;
  } | null;
}
export interface Opportunity {
  code: string;
  url: string;
  evidence: string;
  period: Period;
}
export interface AnalyticsReport {
  visitedPages: VisitedPage[];
  analytics: AnalyticsSummary | null;
  period: Period;
  previous: Period;
  search: SearchMetrics | null;
  previousSearch: SearchMetrics | null;
  urls: UrlReport[];
  categories: {
    id: string;
    urls: number;
    search: SearchMetrics | null;
    postsWithTraffic: number;
    inspected: number;
    inspectionsPassed: number;
  }[];
  opportunities: Opportunity[];
  coverage: {
    dataset: string;
    days: number;
    completeDays: number;
    warnings: string[];
  }[];
  notes: string[];
}
export interface AnalyticsOverview {
  reportSiteUrl: string;
  syncState: AnalyticsSyncState;
  environment: string;
  properties: {
    gscSite: string;
    ga4Property: string;
    measurementId: string;
  };
  configured: {
    gsc: boolean;
    ga4: boolean;
    authentication: boolean;
    collection: boolean;
    sync: boolean;
    gscSync: boolean;
    ga4Sync: boolean;
  };
  sitemapCounts: { path: string; urls: number }[];
  runs: SyncRun[];
  report: AnalyticsReport;
}

// Identifiers only: unknown fields, free text, URLs and transcripts are rejected.
const identifier = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/i);
const context = {
  source_page: z
    .string()
    .regex(/^\/(?:[a-z0-9-]+\/)*$/)
    .max(300),
  source_type: identifier,
  category: identifier.optional(),
};
export const analyticsEventSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("product_compare_start"),
      params: z
        .object({ ...context, product_count: z.number().int().min(2).max(3) })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("product_compare_complete"),
      params: z
        .object({
          ...context,
          product_count: z.number().int().min(2).max(3),
          outcome: z.enum([
            "direct",
            "adapted",
            "incompatible",
            "insufficient_data",
            "basic",
          ]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("page_view"),
      params: z.object(context).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("product_search_submit"),
      params: z
        .object({ ...context, input_type: z.enum(["text", "voice"]) })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("product_search_results_view"),
      params: z
        .object({
          ...context,
          input_type: z.enum(["text", "voice"]),
          result_count: z.number().int().min(0).max(10000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("affiliate_click"),
      params: z
        .object({
          ...context,
          marketplace: z.enum([
            "amazon",
            "shopee",
            "magalu",
            "awin",
            "mercado-livre",
          ]),
          product_id: identifier,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("blog_cta_click"),
      params: z
        .object({
          ...context,
          post_id: identifier.optional(),
          cta_key: identifier,
        })
        .strict(),
    })
    .strict(),
]);
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
