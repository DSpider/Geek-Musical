import type {
  AnalyticsSource,
  AnalyticsSyncState,
  Period,
} from "../../shared/analytics.js";
import { periodSchema } from "../../shared/analytics.js";
import type { PluginContext } from "../admin/registry.js";
import { analyticsConfig, type AnalyticsConfig } from "./config.js";
import { AnalyticsError, safeAnalyticsError } from "./errors.js";
import { OfficialGoogleTransport } from "./google.js";
import { Ga4Client } from "./ga4.js";
import { SearchConsoleClient } from "./gsc.js";
import { AnalyticsRepository } from "./repository.js";
import {
  dateInZone,
  incrementalPeriod,
  periodDays,
  synchronize,
  type MetricsClient,
} from "./sync.js";

export class AnalyticsService {
  readonly state: AnalyticsSyncState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    errors: [],
  };
  private timer?: ReturnType<typeof setInterval>;
  private initial?: ReturnType<typeof setTimeout>;
  private closed = false;
  private pending?: Promise<void>;
  private lastAutomaticAttempt = 0;
  constructor(
    private readonly ctx: PluginContext,
    private readonly options: () => AnalyticsConfig = analyticsConfig,
    private readonly client?: (
      source: AnalyticsSource,
      options: AnalyticsConfig,
    ) => MetricsClient,
  ) {}
  private enabled() {
    const plugin = this.ctx.registry.get("analytics");
    return (
      !this.closed && !!plugin && this.ctx.registry.enabled(this.ctx.db, plugin)
    );
  }
  private sources(source: "all" | AnalyticsSource, options: AnalyticsConfig) {
    return (source === "all" ? (["ga4", "gsc"] as const) : [source]).filter(
      (id) =>
        id === "ga4"
          ? options.ga4Sync && !!options.ga4Property
          : options.gscSync && !!options.gscSite,
    );
  }
  request(source: "all" | AnalyticsSource, period?: Period) {
    const options = this.options();
    if (!this.enabled() || !options.sync)
      throw new AnalyticsError(
        "SYNC_DISABLED",
        "Sincronização desativada neste ambiente.",
      );
    const sources = this.sources(source, options);
    if (!sources.length)
      throw new AnalyticsError(
        "NOT_CONFIGURED",
        "Nenhuma origem de relatórios está habilitada.",
      );
    if (period) {
      periodSchema.parse(period);
      if (periodDays(period) > options.maxDays)
        throw new AnalyticsError(
          "SYNC_LIMIT",
          "Período acima do limite de sincronização configurado.",
        );
      if (period.to > dateInZone("America/Sao_Paulo"))
        throw new AnalyticsError(
          "INVALID_PERIOD",
          "O período não pode terminar no futuro.",
        );
    }
    if (this.pending) return { ...this.state, accepted: false };
    this.state.running = true;
    this.state.startedAt = new Date().toISOString();
    this.state.finishedAt = null;
    this.state.errors = [];
    this.ctx.db.audit(null, "ANALYTICS_REFRESH_REQUEST", "analytics");
    this.pending = this.execute(sources, options, period).finally(() => {
      this.state.running = false;
      this.state.finishedAt = new Date().toISOString();
      this.pending = undefined;
    });
    return { ...this.state, accepted: true };
  }
  async wait() {
    await this.pending;
  }
  private async execute(
    sources: AnalyticsSource[],
    options: AnalyticsConfig,
    period?: Period,
  ) {
    const repo = new AnalyticsRepository(this.ctx.db),
      transport = new OfficialGoogleTransport(options);
    for (const source of sources) {
      if (this.closed) break;
      try {
        const client =
          this.client?.(source, options) ||
          (source === "ga4"
            ? new Ga4Client(
                transport,
                options.ga4Property,
                options.reportSiteUrl,
              )
            : new SearchConsoleClient(transport, options));
        const property =
          source === "ga4" ? options.ga4Property : options.gscSite;
        await synchronize(
          repo,
          client,
          source,
          property,
          period || incrementalPeriod(repo, source, property, options),
          options,
        );
      } catch (error) {
        this.state.errors.push({ source, ...safeAnalyticsError(error) });
      }
    }
  }
  private tick() {
    if (
      !this.enabled() ||
      !this.ctx.settings.get<boolean>("analytics.autoSync") ||
      this.state.running
    )
      return;
    const options = this.options();
    if (!options.sync || !this.sources("all", options).length) return;
    const interval =
      this.ctx.settings.get<number>("analytics.syncIntervalHours") * 3600000;
    if (Date.now() - this.lastAutomaticAttempt < interval) return;
    const runs = new AnalyticsRepository(this.ctx.db).runs(200);
    if (
      this.sources("all", options).every((source) =>
        runs.some(
          (run) =>
            run.source === source &&
            run.property ===
              (source === "ga4" ? options.ga4Property : options.gscSite) &&
            ["success", "partial"].includes(run.status) &&
            run.finishedAt &&
            Date.parse(run.finishedAt) > Date.now() - interval,
        ),
      )
    )
      return;
    this.lastAutomaticAttempt = Date.now();
    try {
      this.request("all");
    } catch {
      /* Status/configuration is available to the Admin; never log credentials. */
    }
  }
  start() {
    if (this.timer || this.closed) return;
    this.initial = setTimeout(() => this.tick(), 10000);
    this.initial.unref();
    this.timer = setInterval(() => this.tick(), 60000);
    this.timer.unref();
  }
  close() {
    this.closed = true;
    clearTimeout(this.initial);
    clearInterval(this.timer);
  }
}
const services = new WeakMap<object, AnalyticsService>();
export function analyticsService(ctx: PluginContext) {
  let service = services.get(ctx.db);
  if (!service) {
    service = new AnalyticsService(ctx);
    services.set(ctx.db, service);
  }
  return service;
}
