import path from "node:path";
import { z } from "zod";
import type { WebConfig } from "../config.js";

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const optional = z.string().trim().default("");
export function analyticsConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = z
    .object({
      collection: flag,
      sync: flag,
      gscSync: flag,
      ga4Sync: flag,
      sitemapSubmit: flag,
      gscSite: optional.refine(
        (value) =>
          !value ||
          /^sc-domain:(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(value) ||
          (() => {
            try {
              const url = new URL(value);
              return (
                url.protocol === "https:" &&
                !url.username &&
                !url.password &&
                !url.port &&
                !url.search &&
                !url.hash &&
                value.endsWith("/")
              );
            } catch {
              return false;
            }
          })(),
        "GSC_SITE_URL exige propriedade de domínio ou prefixo HTTPS com / final.",
      ),
      ga4Property: optional.refine(
        (value) => !value || /^\d+$/.test(value),
        "GA4_PROPERTY_ID exige ID numérico.",
      ),
      measurementId: optional.refine(
        (value) => !value || /^G-[A-Z0-9]+$/.test(value),
        "GA4_MEASUREMENT_ID inválido.",
      ),
      credentialsFile: optional,
      reportSiteUrl: z
        .string()
        .url()
        .refine((value) => {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            !url.port &&
            url.pathname === "/" &&
            !url.search &&
            !url.hash
          );
        }, "ANALYTICS_REPORT_SITE_URL deve ser uma origem HTTPS.")
        .transform((value) => new URL(value).origin),
      timeoutMs: z.coerce.number().int().min(1000).max(60000).default(15000),
      maxDays: z.coerce.number().int().min(1).max(366).default(90),
      overlapDays: z.coerce.number().int().min(1).max(14).default(7),
    })
    .parse({
      collection: env.ANALYTICS_COLLECTION_ENABLED,
      sync: env.ANALYTICS_SYNC_ENABLED,
      gscSync: env.GSC_SYNC_ENABLED,
      ga4Sync: env.GA4_SYNC_ENABLED,
      sitemapSubmit: env.GSC_SITEMAP_SUBMIT_ENABLED,
      gscSite: env.GSC_SITE_URL,
      ga4Property: env.GA4_PROPERTY_ID,
      measurementId: env.GA4_MEASUREMENT_ID,
      credentialsFile: env.GOOGLE_APPLICATION_CREDENTIALS,
      reportSiteUrl:
        env.ANALYTICS_REPORT_SITE_URL ||
        env.SITE_URL ||
        "https://www.geekmusical.com.br",
      timeoutMs: env.ANALYTICS_API_TIMEOUT_MS,
      maxDays: env.ANALYTICS_MAX_SYNC_DAYS,
      overlapDays: env.ANALYTICS_OVERLAP_DAYS,
    });
  if (result.credentialsFile) {
    const filename = path.resolve(result.credentialsFile);
    const relative = path.relative(process.cwd(), filename);
    if (
      !relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative)
    )
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS deve apontar para arquivo privado fora do repositório.",
      );
  }
  return result;
}
export type AnalyticsConfig = ReturnType<typeof analyticsConfig>;
export function collectionEnabled(web: WebConfig, options: AnalyticsConfig) {
  return (
    web.production &&
    web.environment === "production" &&
    web.publicSite &&
    options.collection &&
    !!options.measurementId
  );
}
export function propertyContains(property: string, value: string) {
  const url = new URL(value);
  if (property.startsWith("sc-domain:")) {
    const domain = property.slice(10);
    return url.hostname === domain || url.hostname.endsWith("." + domain);
  }
  const prefix = new URL(property);
  return (
    url.origin === prefix.origin && url.pathname.startsWith(prefix.pathname)
  );
}
