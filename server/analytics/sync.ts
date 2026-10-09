import {
  periodSchema,
  type AnalyticsSource,
  type Dataset,
  type DatasetResult,
  type Period,
} from "../../shared/analytics.js";
import type { AnalyticsConfig } from "./config.js";
import { AnalyticsError, safeAnalyticsError } from "./errors.js";
import { AnalyticsRepository } from "./repository.js";
import { gscDimensions } from "./gsc.js";

export function addDays(date: string, amount: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + amount * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function dateInZone(zone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function periodDays(period: Period) {
  return (
    Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86400000) + 1
  );
}
export function days(period: Period) {
  return Array.from({ length: periodDays(period) }, (_, index) =>
    addDays(period.from, index),
  );
}
export const sourceDatasets: Record<AnalyticsSource, Dataset[]> = {
  gsc: Object.keys(gscDimensions) as Dataset[],
  ga4: [
    "ga4_page_daily",
    "ga4_event_daily",
    "ga4_summary_daily",
    "ga4_page_event_daily",
  ],
};
export interface MetricsClient {
  range?(dataset: Dataset, period: Period): Promise<DatasetResult>;
  verifyAccess?(): Promise<void>;
  day(dataset: Dataset, date: string): Promise<DatasetResult>;
}
export function incrementalPeriod(
  repo: AnalyticsRepository,
  source: AnalyticsSource,
  property: string,
  options: AnalyticsConfig,
  now = new Date(),
): Period {
  const end = addDays(
    dateInZone(
      source === "ga4" ? "America/Sao_Paulo" : "America/Los_Angeles",
      now,
    ),
    source === "ga4" ? -1 : -3,
  );
  const checkpoint = repo.checkpoint(source, property);
  const from = checkpoint
    ? addDays(checkpoint, 1 - options.overlapDays)
    : addDays(end, -27);
  return periodSchema.parse({ from: from > end ? end : from, to: end });
}
export async function synchronize(
  repo: AnalyticsRepository,
  client: MetricsClient,
  source: AnalyticsSource,
  property: string,
  period: Period,
  options: AnalyticsConfig,
) {
  periodSchema.parse(period);
  if (!options.sync || !(source === "gsc" ? options.gscSync : options.ga4Sync))
    throw new AnalyticsError(
      "SYNC_DISABLED",
      "Sincronização desativada. Habilite as flags da origem no ambiente antes de executar.",
    );
  if (periodDays(period) > options.maxDays)
    throw new AnalyticsError(
      "SYNC_LIMIT",
      "Período acima de ANALYTICS_MAX_SYNC_DAYS. Divida o histórico em lotes.",
    );
  const release = repo.acquire(source, property);
  let id: string | undefined,
    received = 0,
    written = 0,
    partial = false;
  try {
    id = repo.start(source, property, period);
    await client.verifyAccess?.();
    for (const dataset of sourceDatasets[source]) {
      const range = client.range
        ? await client.range(dataset, period)
        : undefined;
      for (const date of days(period)) {
        const observed = range || (await client.day(dataset, date));
        const result = {
          ...observed,
          warnings: [...observed.warnings],
          rows: range
            ? observed.rows.filter((row) => row.date === date)
            : observed.rows,
        };
        if (
          date >
          addDays(
            dateInZone(
              source === "ga4" ? "America/Sao_Paulo" : "America/Los_Angeles",
            ),
            -3,
          )
        ) {
          result.complete = false;
          result.dataState = "preliminary";
          result.warnings.push(
            `${source === "ga4" ? "GA4" : "Search Console"} recente: período ainda sujeito a processamento. Reprocesse após a janela de três dias.`,
          );
        }
        received += result.rows.length;
        written += repo.writeDay(dataset, property, date, id, result);
        partial ||= !result.complete;
      }
    }
    repo.finish(id, partial ? "partial" : "success", received, written);
    return {
      id,
      status: partial ? "partial" : "success",
      rowsReceived: received,
      rowsWritten: written,
      period,
    };
  } catch (error) {
    if (id)
      repo.finish(
        id,
        "failed",
        received,
        written,
        safeAnalyticsError(error).code,
      );
    throw error;
  } finally {
    release();
  }
}
