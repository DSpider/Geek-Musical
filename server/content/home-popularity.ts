import type { HomePopularity } from "../../shared/home-editor.js";
import type { AdminDatabase } from "../admin/database.js";
import { analyticsConfig } from "../analytics/config.js";
import { AnalyticsRepository } from "../analytics/repository.js";
import { addDays, dateInZone } from "../analytics/sync.js";

// Reading a Home never initiates a Google request or changes sync settings.
export function homePopularity(
  db?: AdminDatabase,
  now = new Date(),
  property = analyticsConfig().ga4Property,
): HomePopularity {
  const to = addDays(dateInZone("America/Sao_Paulo", now), -1);
  const period = { from: addDays(to, -29), to };
  const result: HomePopularity = {
    ...period,
    views: {},
    available: false,
    partial: true,
  };
  if (!db || !property) return result;
  try {
    const repo = new AnalyticsRepository(db);
    const views: Record<string, number> = Object.create(null);
    for (const row of repo.facts("ga4_page_daily", property, period)) {
      const path = row.dimensions.pagePath;
      const value = row.metrics.screenPageViews;
      if (
        typeof path !== "string" ||
        !path.startsWith("/") ||
        path.startsWith("//") ||
        /[\\\x00-\x1f]/.test(path) ||
        path.length > 500 ||
        !Number.isFinite(value) ||
        value <= 0
      )
        continue;
      const canonical = path.split(/[?#]/)[0];
      views[canonical] = (views[canonical] || 0) + value;
    }
    const coverage = repo
      .coverage(property, period)
      .filter((day) => day.dataset === "ga4_page_daily" && day.complete);
    return {
      ...period,
      views,
      available: Object.keys(views).length > 0,
      partial: coverage.length < 30,
    };
  } catch {
    // Optional analytics failures must not make the public Home unavailable.
    return result;
  }
}
