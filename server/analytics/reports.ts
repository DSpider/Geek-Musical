import type {
  AnalyticsReport,
  MetricRow,
  Period,
  SearchMetrics,
  SeoUrl,
  UrlReport,
  PageAnalytics,
  VisitedPage,
} from "../../shared/analytics.js";
import type { InspectionSnapshot } from "./gsc.js";
import type { AnalyticsRepository } from "./repository.js";
import { addDays, periodDays } from "./sync.js";

export interface OpportunityThresholds {
  minImpressions: number;
  maxCtr: number;
  changeRatio: number;
  minDays: number;
}
export const defaultThresholds: OpportunityThresholds = {
  minImpressions: 100,
  maxCtr: 0.02,
  changeRatio: 0.2,
  minDays: 28,
};
export function aggregateSearch(rows: MetricRow[]): SearchMetrics | null {
  if (!rows.length) return null;
  const clicks = rows.reduce((total, row) => total + row.metrics.clicks, 0);
  const impressions = rows.reduce(
    (total, row) => total + row.metrics.impressions,
    0,
  );
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions
      ? rows.reduce(
          (total, row) =>
            total + row.metrics.position * row.metrics.impressions,
          0,
        ) / impressions
      : null,
  };
}
export function previousPeriod(period: Period) {
  return {
    from: addDays(period.from, -periodDays(period)),
    to: addDays(period.from, -1),
  };
}
function aggregatePages(rows: MetricRow[]): PageAnalytics {
  const sum = (metric: string) =>
    rows.reduce((total, row) => total + (row.metrics[metric] || 0), 0);
  return {
    pageViews: sum("screenPageViews"),
    sessions: sum("sessions"),
    engagedSessions: sum("engagedSessions"),
    engagementSeconds: sum("userEngagementDuration"),
    activeUserDays: sum("activeUsers"),
  };
}
function safePath(value: string) {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    /[\x00-\x1f\\]/.test(value)
  )
    return null;
  const path = value.split(/[?#]/)[0];
  return path.length <= 500 ? path : null;
}
export function analyticsReport(
  repo: AnalyticsRepository,
  inventory: SeoUrl[],
  properties: { gsc: string; ga4: string },
  period: Period,
  thresholds = defaultThresholds,
): AnalyticsReport {
  const previous = previousPeriod(period);
  const currentRows = repo.facts("gsc_page_daily", properties.gsc, period);
  const previousRows = repo.facts("gsc_page_daily", properties.gsc, previous);
  const gaRows = repo.facts("ga4_page_daily", properties.ga4, period);
  const summaryRows = repo.facts("ga4_summary_daily", properties.ga4, period);
  const eventRows = repo.facts("ga4_page_event_daily", properties.ga4, period);
  const dailyCoverage = [
    ...repo.coverage(properties.gsc, period),
    ...repo.coverage(properties.ga4, period),
  ];
  const previousCoverage = repo.coverage(properties.gsc, previous);
  const hasEvents = dailyCoverage.some(
    (day) => day.dataset === "ga4_page_event_daily",
  );
  const paths = [
    ...new Set(
      gaRows
        .map((row) => safePath(row.dimensions.pagePath))
        .filter((p): p is string => !!p),
    ),
  ];
  const visitedPages: VisitedPage[] = paths
    .map((path) => {
      const known = inventory.find((url) => url.path === path);
      const rows = eventRows.filter(
        (row) => safePath(row.dimensions.pagePath) === path,
      );
      const count = (names?: string[]) =>
        hasEvents
          ? rows
              .filter(
                (row) => !names || names.includes(row.dimensions.eventName),
              )
              .reduce((total, row) => total + row.metrics.eventCount, 0)
          : null;
      return {
        path,
        label: known?.label || "Página observada no GA4",
        categoryId: known?.categoryId || null,
        analytics: aggregatePages(
          gaRows.filter((row) => safePath(row.dimensions.pagePath) === path),
        ),
        clicks: count(["click", "affiliate_click", "blog_cta_click"]),
        affiliateClicks: count(["affiliate_click"]),
        ctaClicks: count(["blog_cta_click"]),
        searches: count(["product_search_submit"]),
        events: count(),
      };
    })
    .sort(
      (a, b) =>
        b.analytics.pageViews - a.analytics.pageViews ||
        a.path.localeCompare(b.path),
    );
  const fullPageCoverage = (coverage: typeof dailyCoverage) =>
    coverage.filter((day) => day.dataset === "gsc_page_daily" && day.complete)
      .length === periodDays(period);
  const urls: UrlReport[] = inventory.map((url) => {
    const ga = gaRows.filter((row) => row.dimensions.pagePath === url.path);
    const inspection = repo.latestSnapshot<InspectionSnapshot>(
      "gsc_inspection",
      properties.gsc,
      url.url,
    );
    return {
      ...url,
      search: aggregateSearch(
        currentRows.filter((row) => row.dimensions.page === url.url),
      ),
      previousSearch: aggregateSearch(
        previousRows.filter((row) => row.dimensions.page === url.url),
      ),
      analytics: ga.length
        ? {
            pageViews: ga.reduce(
              (total, row) => total + row.metrics.screenPageViews,
              0,
            ),
            sessions: ga.reduce(
              (total, row) => total + row.metrics.sessions,
              0,
            ),
            engagedSessions: ga.reduce(
              (total, row) => total + row.metrics.engagedSessions,
              0,
            ),
            engagementSeconds: ga.reduce(
              (total, row) => total + row.metrics.userEngagementDuration,
              0,
            ),
            activeUserDays: ga.reduce(
              (total, row) => total + row.metrics.activeUsers,
              0,
            ),
          }
        : null,
      inspection: inspection
        ? {
            verdict: inspection.payload.verdict,
            coverageState: inspection.payload.coverageState,
            inspectedAt: inspection.observedAt,
          }
        : null,
    };
  });
  const opportunities: AnalyticsReport["opportunities"] = [];
  for (const url of urls.filter((url) => url.indexable)) {
    if (!url.sitemap && !url.path.includes("?"))
      opportunities.push({
        code: "MISSING_SITEMAP",
        url: url.url,
        evidence: "URL indexável sem sitemap associado no inventário.",
        period,
      });
    if (
      url.search &&
      url.search.impressions >= thresholds.minImpressions &&
      url.search.ctr <= thresholds.maxCtr
    )
      opportunities.push({
        code: "LOW_CTR",
        url: url.url,
        evidence: `${url.search.impressions} impressões, ${url.search.clicks} cliques, CTR ${(url.search.ctr * 100).toFixed(2)}%. Sinal para revisão, sem diagnóstico causal.`,
        period,
      });
    if (
      url.search &&
      url.previousSearch &&
      fullPageCoverage(dailyCoverage) &&
      fullPageCoverage(previousCoverage) &&
      url.previousSearch.impressions >= thresholds.minImpressions
    ) {
      const change =
        url.search.impressions / url.previousSearch.impressions - 1;
      if (Math.abs(change) >= thresholds.changeRatio)
        opportunities.push({
          code: change > 0 ? "GROWING_VISIBILITY" : "FALLING_VISIBILITY",
          url: url.url,
          evidence: `Impressões: ${url.previousSearch.impressions} → ${url.search.impressions} (${(change * 100).toFixed(1)}%) em períodos iguais. Associação temporal, sem atribuição de causa.`,
          period,
        });
    }
    if (
      url.search &&
      url.search.clicks === 0 &&
      fullPageCoverage(dailyCoverage) &&
      periodDays(period) >= thresholds.minDays
    )
      opportunities.push({
        code: "NO_OBSERVED_CLICKS",
        url: url.url,
        evidence:
          "Nenhum clique nas linhas observadas da API neste período. Linhas ausentes e dados anonimizados não provam tráfego zero.",
        period,
      });
  }
  const categories = [
    ...new Set(
      inventory.map((url) => url.categoryId).filter((id): id is string => !!id),
    ),
  ].map((id) => {
    const group = urls.filter((url) => url.categoryId === id && url.indexable);
    const pages = new Set(group.map((url) => url.url));
    return {
      id,
      urls: group.length,
      search: aggregateSearch(
        currentRows.filter((row) => pages.has(row.dimensions.page)),
      ),
      postsWithTraffic: group.filter(
        (url) => url.type === "post" && url.search && url.search.clicks > 0,
      ).length,
      inspected: group.filter((url) => url.inspection).length,
      inspectionsPassed: group.filter(
        (url) => url.inspection?.verdict === "PASS",
      ).length,
    };
  });
  const coverage = [...new Set(dailyCoverage.map((day) => day.dataset))].map(
    (dataset) => {
      const group = dailyCoverage.filter((day) => day.dataset === dataset);
      return {
        dataset,
        days: group.length,
        completeDays: group.filter((day) => day.complete).length,
        warnings: [...new Set(group.flatMap((day) => day.warnings))],
      };
    },
  );
  const known = new Set(inventory.map((url) => url.url));
  const unmatched = new Set(
    currentRows
      .filter((row) => !known.has(row.dimensions.page))
      .map((row) => row.dimensions.page),
  ).size;
  return {
    visitedPages,
    analytics: summaryRows.length
      ? {
          ...aggregatePages(summaryRows),
          events: summaryRows.reduce((n, r) => n + r.metrics.eventCount, 0),
          newUsers: summaryRows.reduce((n, r) => n + r.metrics.newUsers, 0),
          keyEvents: summaryRows.reduce((n, r) => n + r.metrics.keyEvents, 0),
        }
      : null,
    period,
    previous,
    urls,
    categories,
    opportunities,
    coverage,
    search: aggregateSearch(
      repo.facts("gsc_search_daily", properties.gsc, period),
    ),
    previousSearch: aggregateSearch(
      repo.facts("gsc_search_daily", properties.gsc, previous),
    ),
    notes: [
      "A lista de páginas inclui caminhos observados fora do catálogo atual. Cliques GA4 somam click, affiliate_click e blog_cta_click; cliques orgânicos vêm do Search Console.",
      "Os dias mais recentes podem conter dados preliminares. Sessões do resumo vêm do relatório da propriedade; usuários-dia somam usuários ativos por dia e não são usuários únicos do período.",
      "Ausência de linhas é representada por null, nunca convertida em tráfego zero ou prova de indexação.",
      "CTR = soma de cliques / soma de impressões; posição ponderada pelas impressões. Totais da propriedade usam o dataset diário, não a soma de queries/páginas.",
      "Usuários, sessões e sessões engajadas por página/dia não são totais únicos do período. activeUserDays é a soma de usuários ativos diários, sem deduplicação. Não somar páginas para estimar usuários únicos.",
      "GSC usa America/Los_Angeles; GA4 usa o fuso retornado pela propriedade. As fontes podem ter períodos de processamento diferentes.",
      "URL Inspection é um snapshot do índice do Google na data indicada, sem teste ao vivo da URL.",
      `${unmatched} URLs observadas no Search Console não correspondem ao catálogo atual (por exemplo, histórico WordPress); os dados são preservados.`,
      ...(!fullPageCoverage(dailyCoverage)
        ? [
            "Cobertura diária de páginas insuficiente para afirmar perda/crescimento ou ausência de cliques no período completo.",
          ]
        : []),
    ],
  };
}
