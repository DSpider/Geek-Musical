import { z } from "zod";
import type { Category } from "./types.js";

export const awinCategories = [
  "notebook",
  "smartphone",
  "smartwatch",
  "tv",
  "headphones",
  "monitor",
  "tablet",
  "appliance",
  "other",
] as const;
export const advertiserInputSchema = z
  .object({
    enabled: z.boolean(),
    termsReviewed: z.boolean(),
    termsReference: z.string().max(1000),
    allowedDomains: z
      .array(z.string().regex(/^(?:\*\.)?(?:[a-z0-9-]+\.)+[a-z]{2,63}$/))
      .max(100)
      .default([]),
    excludedTerms: z
      .array(z.string().trim().min(2).max(200))
      .max(100)
      .default([]),
    searchUrlTemplate: z.string().max(2000).optional(),
  })
  .strict()
  .refine(
    (v) =>
      !v.termsReviewed ||
      /^https:\/\/ui\.awin\.com\/awin\/affiliate\/\d+\/merchant-profile(?:-terms)?\/\d+$/.test(
        v.termsReference,
      ),
    {
      message:
        "Para publicar, confira os termos e informe a referência oficial do programa.",
    },
  );
export const feedPolicySchema = z
  .object({
    enabled: z.boolean().default(false),
    marketCountry: z.enum(["BR", "unknown"]).default("unknown"),
    intervalHours: z.number().int().min(1).max(168).default(12),
    priceTtlHours: z.number().int().min(1).max(168).default(48),
    maxRecords: z.number().int().min(1).max(500000).default(50000),
    maxDropPercent: z.number().int().min(0).max(95).default(50),
    includeUnknownPrice: z.boolean().default(true),
    allowUnpricedCurrency: z.boolean().optional(),
    excludeOutOfStock: z.boolean().default(true),
    directUrlParameter: z
      .string()
      .regex(/^(?:[a-zA-Z][a-zA-Z0-9_]{0,79})?$/)
      .default(""),
    // Only field names; values and download credentials never belong to settings.
    mappings: z
      .partialRecord(
        z.enum([
          "brand",
          "model",
          "gtin",
          "mpn",
          "colour",
          "size",
          "voltage",
          "capacity",
          "quantity",
          "condition",
        ]),
        z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/),
      )
      .default({}),
  })
  .strict();
export const categoryRuleSchema = z
  .object({
    external: z.string().trim().min(1).max(400),
    category: z.enum(awinCategories),
    enabled: z.boolean(),
  })
  .strict();
export type FeedPolicy = z.infer<typeof feedPolicySchema>;
export const awinConfigBundleSchema = z
  .object({
    publisherId: z.number().int().positive(),
    advertisers: z
      .array(
        z
          .object({
            id: z.number().int().positive(),
            config: advertiserInputSchema,
          })
          .strict(),
      )
      .max(2000),
    feeds: z
      .array(
        z
          .object({
            sourceId: z.string().regex(/^[\w.-]+$/),
            policy: feedPolicySchema,
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export type AwinDiagnostic =
  | "available"
  | "catalog_unavailable"
  | "market_unavailable"
  | "credential_pending"
  | "ineligible"
  | "restricted"
  | "technical_failure"
  | "review_pending";
export const awinDiagnosticLabels: Record<AwinDiagnostic, string> = {
  available: "Integração disponível",
  catalog_unavailable: "Catálogo indisponível",
  market_unavailable: "Catálogo Brasil/BRL indisponível",
  credential_pending: "Credencial pendente",
  ineligible: "Parceria não elegível",
  restricted: "Recurso restrito",
  technical_failure: "Falha técnica",
  review_pending: "Revisão e ativação pendentes",
};
export interface AwinAdvertiser {
  id: number;
  publisherId: number;
  name: string;
  logoUrl: string | null;
  relationship: "joined" | "pending" | "suspended" | "rejected" | "notjoined";
  status: string;
  linkStatus: string | null;
  country: string | null;
  currency: string | null;
  domains: string[];
  allowedDomains: string[];
  excludedTerms: string[];
  searchUrlTemplate?: string;
  enabled: boolean;
  termsReviewed: boolean;
  termsReference: string;
  discoveredAt: string;
  diagnostic: AwinDiagnostic;
  productCount: number;
}
export interface AwinFeed {
  id: string;
  advertiserId: number;
  publisherId: number;
  sourceId: string;
  name: string;
  format: "csv" | "jsonl";
  language: string;
  currency: string | null;
  sourceUpdatedAt: string | null;
  downloadPath: string;
  policy: FeedPolicy;
  activeRunId: string | null;
  expectedRecords: number | null;
  metadataCheckedAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  productCount: number;
  lastError: string | null;
}
export interface AwinRecord {
  listingKey: string;
  advertiserId: number;
  publisherId: number;
  sourceProductId: string;
  awinProductId: string | null;
  name: string;
  description: string;
  brand: string | null;
  model: string | null;
  gtin: string | null;
  mpn: string | null;
  externalCategory: string;
  category: Category;
  variant: Record<string, string>;
  identityKey: string | null;
  image: string | null;
  additionalImages: string[];
  originalUrl: string | null;
  affiliateUrl: string | null;
  linkStatus: "verified" | "missing" | "invalid";
  price: number | null;
  currency: string | null;
  referencePrice: number | null;
  availability: "in_stock" | "out_of_stock" | "unknown";
  shipping: number | null;
  commercialText: string;
  installment: { months: number; amount: number; currency: string } | null;
  sourceUpdatedAt: string | null;
  feedUpdatedAt: string | null;
  importedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  features: string[];
  technicalHash: string;
}
export interface AwinRun {
  id: string;
  feedId: string;
  status:
    "queued" | "running" | "complete" | "failed" | "partial" | "unchanged";
  startedAt: string | null;
  finishedAt: string | null;
  processed: number;
  accepted: number;
  rejected: number;
  durationMs: number | null;
  peakRssBytes: number | null;
  downloadedBytes: number;
  errorCode: string | null;
}
export interface AwinOverview {
  publisherId: number;
  enabled: boolean;
  scheduler: boolean;
  fixtures: boolean;
  revision: string;
  values: Record<string, unknown>;
  credentials: {
    api: { reference: string; configured: boolean };
    feeds: { reference: string; configured: boolean };
  };
  connection: {
    status: string;
    checkedAt: string | null;
    errorCode: string | null;
  };
  feedDiscovery: { checkedAt: string | null; errorCode: string | null };
  advertisers: AwinAdvertiser[];
  feeds: AwinFeed[];
  runs: AwinRun[];
}
