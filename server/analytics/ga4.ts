import { z } from "zod";
import type { Dataset, DatasetResult, Period } from "../../shared/analytics.js";
import { dateSchema, periodSchema } from "../../shared/analytics.js";
import { AnalyticsError } from "./errors.js";
import { googleScopes, type GoogleTransport } from "./google.js";

const reports = {
  ga4_page_daily: {
    dimensions: ["date", "pagePath"],
    metrics: [
      "screenPageViews",
      "activeUsers",
      "sessions",
      "engagedSessions",
      "userEngagementDuration",
    ],
  },
  ga4_event_daily: {
    dimensions: ["date", "eventName"],
    metrics: ["eventCount"],
  },
  ga4_summary_daily: {
    dimensions: ["date"],
    metrics: [
      "screenPageViews",
      "activeUsers",
      "sessions",
      "engagedSessions",
      "userEngagementDuration",
      "eventCount",
      "newUsers",
      "keyEvents",
    ],
  },
  ga4_page_event_daily: {
    dimensions: ["date", "pagePath", "eventName"],
    metrics: ["eventCount"],
  },
} as const;
const responseSchema = z.object({
  dimensionHeaders: z.array(z.object({ name: z.string() })).default([]),
  metricHeaders: z.array(z.object({ name: z.string() })).default([]),
  rows: z
    .array(
      z.object({
        dimensionValues: z.array(z.object({ value: z.string().max(5000) })),
        metricValues: z.array(z.object({ value: z.string() })),
      }),
    )
    .default([]),
  rowCount: z.number().int().nonnegative().default(0),
  metadata: z
    .object({
      timeZone: z.string().optional(),
      subjectToThresholding: z.boolean().optional(),
      dataLossFromOtherRow: z.boolean().optional(),
      samplingMetadatas: z
        .array(
          z.object({
            samplesReadCount: z.string(),
            samplingSpaceSize: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});
export class Ga4Client {
  private readonly base: string;
  private readonly compatibility = new Set<string>();
  constructor(
    private readonly transport: GoogleTransport,
    property: string,
    private readonly origin: string,
    private readonly rowLimit = 10000,
  ) {
    if (!/^\d+$/.test(property))
      throw new AnalyticsError(
        "NOT_CONFIGURED",
        "GA4 não configurado. Defina GA4_PROPERTY_ID numérico e as credenciais Google.",
      );
    this.base =
      "https://analyticsdata.googleapis.com/v1beta/properties/" + property;
  }
  async day(dataset: Dataset, date: string): Promise<DatasetResult> {
    dateSchema.parse(date);
    return this.range(dataset, { from: date, to: date });
  }
  async range(dataset: Dataset, period: Period): Promise<DatasetResult> {
    periodSchema.parse(period);
    if (!(dataset in reports))
      throw new AnalyticsError("INVALID_DATASET", "Dataset GA4 inválido.");
    const definition = reports[dataset as keyof typeof reports];
    const dimensions = definition.dimensions.map((name) => ({ name }));
    const metrics = definition.metrics.map((name) => ({ name }));
    if (!this.compatibility.has(dataset)) {
      const result = z
        .object({
          dimensionCompatibilities: z.array(
            z.object({
              dimensionMetadata: z.object({ apiName: z.string() }),
              compatibility: z.string(),
            }),
          ),
          metricCompatibilities: z.array(
            z.object({
              metricMetadata: z.object({ apiName: z.string() }),
              compatibility: z.string(),
            }),
          ),
        })
        .safeParse(
          await this.transport.request(
            googleScopes.analyticsRead,
            "POST",
            this.base + ":checkCompatibility",
            { dimensions, metrics },
          ),
        );
      if (
        !result.success ||
        dimensions.some(
          ({ name }) =>
            !result.data.dimensionCompatibilities.some(
              (item) =>
                item.dimensionMetadata.apiName === name &&
                item.compatibility === "COMPATIBLE",
            ),
        ) ||
        metrics.some(
          ({ name }) =>
            !result.data.metricCompatibilities.some(
              (item) =>
                item.metricMetadata.apiName === name &&
                item.compatibility === "COMPATIBLE",
            ),
        )
      )
        throw new AnalyticsError(
          "GA4_INCOMPATIBLE_REPORT",
          "A propriedade GA4 não permite esta combinação de dimensões e métricas.",
        );
      this.compatibility.add(dataset);
    }
    const rows: DatasetResult["rows"] = [];
    const warnings = new Set<string>();
    let complete = true,
      expectedCount: number | undefined,
      timezone = "não informado pela propriedade";
    for (let offset = 0; offset < 1000000; offset += this.rowLimit) {
      const raw = await this.transport.request(
        googleScopes.analyticsRead,
        "POST",
        this.base + ":runReport",
        {
          dateRanges: [{ startDate: period.from, endDate: period.to }],
          dimensions,
          metrics,
          dimensionFilter: {
            filter: {
              fieldName: "hostName",
              stringFilter: {
                matchType: "EXACT",
                value: new URL(this.origin).hostname,
                caseSensitive: false,
              },
            },
          },
          orderBys: definition.dimensions.map((dimensionName) => ({
            dimension: { dimensionName },
          })),
          limit: this.rowLimit,
          offset,
          returnPropertyQuota: true,
        },
      );
      const result = responseSchema.safeParse(raw);
      if (!result.success)
        throw new AnalyticsError(
          "GOOGLE_INVALID_RESPONSE",
          "GA4 retornou dados fora do contrato esperado.",
        );
      const data = result.data;
      if (expectedCount !== undefined && data.rowCount !== expectedCount)
        throw new AnalyticsError(
          "GA4_UNSTABLE_PAGINATION",
          "GA4 alterou o total durante a paginação. Reprocesse o dia depois.",
        );
      expectedCount = data.rowCount;
      if (
        data.rows.length > this.rowLimit ||
        offset + data.rows.length > data.rowCount
      )
        throw new AnalyticsError(
          "GOOGLE_INVALID_RESPONSE",
          "GA4 retornou linhas acima do limite ou total declarado.",
        );
      if (
        data.rowCount &&
        (data.dimensionHeaders.map((header) => header.name).join() !==
          definition.dimensions.join() ||
          data.metricHeaders.map((header) => header.name).join() !==
            definition.metrics.join())
      )
        throw new AnalyticsError(
          "GOOGLE_INVALID_RESPONSE",
          "Cabeçalhos de métricas ou dimensões divergentes no GA4.",
        );
      for (const row of data.rows) {
        if (
          row.dimensionValues.length !== dimensions.length ||
          row.metricValues.length !== metrics.length
        )
          throw new AnalyticsError(
            "GOOGLE_INVALID_RESPONSE",
            "Linha GA4 com quantidade inválida de dimensões/métricas.",
          );
        const values = row.dimensionValues.map((value) => value.value);
        const date = values[0].replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
        if (
          !dateSchema.safeParse(date).success ||
          date < period.from ||
          date > period.to
        )
          throw new AnalyticsError(
            "GOOGLE_INVALID_RESPONSE",
            "GA4 retornou data diferente da solicitada.",
          );
        const measures = row.metricValues.map((value) => Number(value.value));
        if (measures.some((value) => !Number.isFinite(value) || value < 0))
          throw new AnalyticsError(
            "GOOGLE_INVALID_RESPONSE",
            "GA4 retornou métrica inválida.",
          );
        rows.push({
          date,
          dimensions: Object.fromEntries(
            definition.dimensions
              .slice(1)
              .map((name, index) => [name, values[index + 1]]),
          ),
          metrics: Object.fromEntries(
            definition.metrics.map((name, index) => [name, measures[index]]),
          ),
        });
      }
      if (data.metadata?.timeZone) timezone = data.metadata.timeZone;
      if (
        data.metadata?.subjectToThresholding ||
        data.metadata?.dataLossFromOtherRow ||
        data.metadata?.samplingMetadatas?.some(
          (sample) =>
            Number(sample.samplesReadCount) < Number(sample.samplingSpaceSize),
        )
      ) {
        complete = false;
        warnings.add(
          "GA4 indicou limiar de privacidade, amostragem ou perda na linha (other).",
        );
      }
      if (rows.length >= data.rowCount) break;
      if (!data.rows.length || data.rows.length < this.rowLimit)
        throw new AnalyticsError(
          "GA4_INCOMPLETE_PAGINATION",
          "GA4 encerrou a paginação antes do total declarado. Dia não importado.",
        );
      if (offset + this.rowLimit >= 1000000) {
        complete = false;
        warnings.add(
          "Limite operacional de um milhão de linhas por dia atingido.",
        );
      }
    }
    return {
      rows,
      complete,
      warnings: [...warnings],
      dataState: "historical",
      timezone,
    };
  }
}
