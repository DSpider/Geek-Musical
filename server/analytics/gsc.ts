import { z } from "zod";
import type { Dataset, DatasetResult } from "../../shared/analytics.js";
import { dateSchema } from "../../shared/analytics.js";
import type { AnalyticsConfig } from "./config.js";
import { propertyContains } from "./config.js";
import { AnalyticsError } from "./errors.js";
import { googleScopes, type GoogleTransport } from "./google.js";

export const gscDimensions: Partial<Record<Dataset, string[]>> = {
  gsc_search_daily: ["date"],
  gsc_page_daily: ["date", "page"],
  gsc_query_daily: ["date", "query"],
  gsc_page_query_daily: ["date", "page", "query"],
  gsc_device_daily: ["date", "device"],
  gsc_country_daily: ["date", "country"],
};
const searchResponse = z.object({
  rows: z
    .array(
      z.object({
        keys: z.array(z.string().max(5000)),
        clicks: z.number().nonnegative().finite(),
        impressions: z.number().nonnegative().finite(),
        ctr: z.number().min(0).max(1),
        position: z.number().nonnegative().finite(),
      }),
    )
    .default([]),
  metadata: z
    .object({ first_incomplete_date: dateSchema.optional() })
    .optional(),
});
const sitemapSchema = z.object({
  path: z.string().url(),
  lastSubmitted: z.string().optional(),
  lastDownloaded: z.string().optional(),
  isPending: z.boolean().optional(),
  isSitemapsIndex: z.boolean().optional(),
  warnings: z.coerce.number().nonnegative().optional(),
  errors: z.coerce.number().nonnegative().optional(),
});
export type GscSitemap = z.infer<typeof sitemapSchema>;
export interface InspectionSnapshot {
  verdict: string | null;
  coverageState: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  lastCrawlTime: string | null;
  indexingState: string | null;
}
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AnalyticsError(
      "GOOGLE_INVALID_RESPONSE",
      "A resposta do Search Console não respeitou o contrato esperado.",
    );
  return result.data;
}
export class SearchConsoleClient {
  private readonly site: string;
  private readonly base: string;
  constructor(
    private readonly transport: GoogleTransport,
    options: Pick<AnalyticsConfig, "gscSite">,
    private readonly rowLimit = 25000,
  ) {
    if (!options.gscSite)
      throw new AnalyticsError(
        "NOT_CONFIGURED",
        "Search Console não configurado. Defina GSC_SITE_URL e as credenciais Google.",
      );
    this.site = options.gscSite;
    this.base =
      "https://www.googleapis.com/webmasters/v3/sites/" +
      encodeURIComponent(this.site);
  }
  async access() {
    const result = checked(
      z.object({
        siteEntry: z
          .array(z.object({ siteUrl: z.string(), permissionLevel: z.string() }))
          .default([]),
      }),
      await this.transport.request(
        googleScopes.searchRead,
        "GET",
        "https://www.googleapis.com/webmasters/v3/sites",
      ),
    );
    const property = result.siteEntry.find(
      (entry) =>
        entry.siteUrl === this.site &&
        entry.permissionLevel !== "siteUnverifiedUser",
    );
    if (!property)
      throw new AnalyticsError(
        "PROPERTY_UNAVAILABLE",
        "A propriedade configurada não está acessível para esta credencial.",
      );
    return {
      configuredProperty: property.siteUrl,
      permissionLevel: property.permissionLevel,
      accessibleProperties: result.siteEntry.map((entry) => entry.siteUrl),
    };
  }
  async day(
    dataset: Dataset,
    date: string,
    dataState: "final" | "all" = "final",
  ): Promise<DatasetResult> {
    dateSchema.parse(date);
    const dimensions = gscDimensions[dataset];
    if (!dimensions)
      throw new AnalyticsError(
        "INVALID_DATASET",
        "Dataset Search Console inválido.",
      );
    const rows: DatasetResult["rows"] = [];
    let complete = true;
    const warnings = new Set<string>([
      "Search Console disponibiliza linhas principais e pode omitir queries por privacidade; paginação concluída não garante todos os dados da propriedade.",
    ]);
    for (let startRow = 0; startRow < 50000; startRow += this.rowLimit) {
      const result = checked(
        searchResponse,
        await this.transport.request(
          googleScopes.searchRead,
          "POST",
          this.base + "/searchAnalytics/query",
          {
            startDate: date,
            endDate: date,
            dimensions,
            type: "web",
            dataState,
            rowLimit: this.rowLimit,
            startRow,
          },
        ),
      );
      if (result.rows.length > this.rowLimit)
        throw new AnalyticsError(
          "GOOGLE_INVALID_RESPONSE",
          "Search Console ultrapassou o limite de linhas solicitado.",
        );
      for (const row of result.rows) {
        if (row.keys.length !== dimensions.length || row.keys[0] !== date)
          throw new AnalyticsError(
            "GOOGLE_INVALID_RESPONSE",
            "Dimensões ou data divergentes no Search Console.",
          );
        rows.push({
          date,
          dimensions: Object.fromEntries(
            dimensions
              .slice(1)
              .map((name, index) => [name, row.keys[index + 1]]),
          ),
          metrics: {
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          },
        });
      }
      if (
        result.metadata?.first_incomplete_date &&
        date >= result.metadata.first_incomplete_date
      ) {
        complete = false;
        warnings.add(
          "Dados recentes ainda incompletos: " +
            result.metadata.first_incomplete_date +
            ".",
        );
      }
      if (result.rows.length < this.rowLimit) break;
      if (rows.length >= 50000) {
        complete = false;
        warnings.add(
          "Limite oficial de 50.000 linhas por dia/tipo atingido; dataset truncado.",
        );
        break;
      }
    }
    if (dataState === "all") {
      complete = false;
      warnings.add(
        "Dados preliminares solicitados explicitamente (dataState=all).",
      );
    }
    return {
      rows,
      complete,
      warnings: [...warnings],
      dataState,
      timezone: "America/Los_Angeles",
    };
  }
  async sitemaps(): Promise<GscSitemap[]> {
    return checked(
      z.object({ sitemap: z.array(sitemapSchema).default([]) }),
      await this.transport.request(
        googleScopes.searchRead,
        "GET",
        this.base + "/sitemaps",
      ),
    ).sitemap;
  }
  async inspect(url: string): Promise<InspectionSnapshot> {
    if (!propertyContains(this.site, url))
      throw new AnalyticsError(
        "PROPERTY_MISMATCH",
        "URL fora da propriedade Search Console configurada.",
      );
    const result = checked(
      z.object({
        inspectionResult: z.object({
          indexStatusResult: z
            .object({
              verdict: z.string().optional(),
              coverageState: z.string().optional(),
              googleCanonical: z.string().optional(),
              userCanonical: z.string().optional(),
              lastCrawlTime: z.string().optional(),
              indexingState: z.string().optional(),
            })
            .optional(),
        }),
      }),
      await this.transport.request(
        googleScopes.searchRead,
        "POST",
        "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        { siteUrl: this.site, inspectionUrl: url, languageCode: "pt-BR" },
      ),
    );
    const index = result.inspectionResult.indexStatusResult;
    return {
      verdict: index?.verdict || null,
      coverageState: index?.coverageState || null,
      googleCanonical: index?.googleCanonical || null,
      userCanonical: index?.userCanonical || null,
      lastCrawlTime: index?.lastCrawlTime || null,
      indexingState: index?.indexingState || null,
    };
  }
  async submit(url: string) {
    if (!propertyContains(this.site, url))
      throw new AnalyticsError(
        "PROPERTY_MISMATCH",
        "Sitemap fora da propriedade configurada.",
      );
    await this.transport.request(
      googleScopes.searchWrite,
      "PUT",
      this.base + "/sitemaps/" + encodeURIComponent(url),
    );
  }
}
