import { useEffect, useState } from "react";
import type { AnalyticsOverview } from "../../../shared/analytics.js";
import {
  Field,
  Loading,
  Notice,
  PageHeading,
  Panel,
  useLoad,
  useTask,
} from "../components.js";
import { usePermission } from "../context.js";
import { AnalyticsParameters } from "./analytics/Parameters.js";
import { GoogleConnection } from "./analytics/Connection.js";
import { UrlMetrics } from "./analytics/UrlMetrics.js";
import { AnalyticsDetails } from "./analytics/Details.js";
import { number, percent } from "./analytics/format.js";
import { WeeklyAudit } from "./analytics/WeeklyAudit.js";
import { VisitedPages } from "./analytics/VisitedPages.js";
import { api } from "../api.js";

function defaultEnd() {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10);
}
export function AnalyticsPage() {
  const canManage = usePermission("analytics.manage");
  const [parameters, setParameters] = useState(false);
  const [connection, setConnection] = useState(false);
  const [period, setPeriod] = useState("28");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(defaultEnd);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0),
    task = useTask();
  const end = period === "custom" ? to : defaultEnd();
  const start =
    period === "custom"
      ? from
      : new Date(Date.parse(end) - (Number(period) - 1) * 86400000)
          .toISOString()
          .slice(0, 10);
  const query = new URLSearchParams({ from: start || end, to: end });
  const { data, setData, error, loading } = useLoad<AnalyticsOverview>(
    "/analytics/overview?" + query,
    refresh,
  );
  useEffect(() => {
    const timer = window.setInterval(
      () => setRefresh((n) => n + 1),
      data?.syncState?.running ? 3000 : 60000,
    );
    return () => window.clearInterval(timer);
  }, [data?.syncState?.running]);
  const update = () =>
    void task.run(async () => {
      await api("/analytics/sync", {
        method: "POST",
        body: { source: "all", period: { from: start || end, to: end } },
      });
      setRefresh((n) => n + 1);
      for (let attempt = 0; attempt < 150; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const current = await api<AnalyticsOverview>(
          "/analytics/overview?" + query,
        );
        setData(current);
        if (!current.syncState.running) {
          if (current.syncState.errors.length)
            throw new Error(
              current.syncState.errors.map((e) => e.message).join(" "),
            );
          return;
        }
      }
      throw new Error(
        "A atualização continua em segundo plano. Acompanhe o histórico de sincronizações.",
      );
    }, "Relatórios atualizados.");
  if (parameters)
    return <AnalyticsParameters onBack={() => setParameters(false)} />;
  if (connection)
    return (
      <GoogleConnection
        data={data}
        error={error}
        onBack={() => setConnection(false)}
      />
    );
  const all = data?.report.urls || [];
  const filtered = all.filter(
    (url) =>
      (!category || url.categoryId === category) &&
      (!filter ||
        (url.path + " " + url.label)
          .toLowerCase()
          .includes(filter.toLowerCase())),
  );
  const categories = [
    ...new Set(
      all.map((url) => url.categoryId).filter((id): id is string => !!id),
    ),
  ];
  return (
    <>
      <PageHeading
        title="Analytics e SEO"
        description="Dados observados, inventário de URLs e sinais para revisão editorial."
        action={
          <div className="admin-toolbar">
            {canManage && (
              <button
                className="admin-button"
                disabled={
                  task.busy ||
                  data?.syncState?.running ||
                  !data?.configured.sync
                }
                onClick={update}
              >
                {task.busy || data?.syncState?.running
                  ? "Atualizando relatórios…"
                  : "Atualizar relatórios"}
              </button>
            )}
            <button
              className="admin-button secondary"
              onClick={() => setConnection(true)}
            >
              Conectar Google
            </button>
            {canManage && (
              <button
                className="admin-button secondary"
                onClick={() => setParameters(true)}
              >
                Parâmetros
              </button>
            )}
          </div>
        }
      />
      <Notice error={error || task.error} success={task.success} />
      <WeeklyAudit />
      <div className="admin-toolbar">
        <Field label="Período">
          <select
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              setPage(1);
            }}
          >
            <option value="7">7 dias</option>
            <option value="28">28 dias</option>
            <option value="90">90 dias</option>
            <option value="custom">Personalizado</option>
          </select>
        </Field>
        {period === "custom" && (
          <>
            <Field label="De">
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field label="Até">
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
          </>
        )}
        <Field label="Categoria">
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {categories.map((id) => (
              <option key={id} value={id}>
                {all.find(
                  (url) => url.type === "category" && url.categoryId === id,
                )?.label || id}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pesquisar URL ou título">
          <input
            value={filter}
            maxLength={200}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <Panel title="Integrações">
              <p>
                Search Console:{" "}
                <strong>
                  {data.configured.gsc
                    ? data.runs.some(
                        (r) =>
                          r.source === "gsc" &&
                          ["success", "partial"].includes(r.status),
                      )
                      ? "Relatórios importados"
                      : "Aguardando primeira importação"
                    : "Não configurado"}
                </strong>{" "}
                · GA4:{" "}
                <strong>
                  {data.configured.ga4
                    ? data.runs.some(
                        (r) =>
                          r.source === "ga4" &&
                          ["success", "partial"].includes(r.status),
                      )
                      ? "Relatórios importados"
                      : "Aguardando primeira importação"
                    : "Não configurado"}
                </strong>
              </p>
              <p>
                Coleta:{" "}
                {data.configured.collection
                  ? "Habilitada, condicionada ao consentimento"
                  : "Desativada"}{" "}
                · Sincronização:{" "}
                {data.configured.sync
                  ? "Permitida por configuração"
                  : "Desativada"}{" "}
                · Ambiente: {data.environment}
              </p>
              <p className="admin-help">
                Origem dos relatórios: {data.reportSiteUrl}. Atualizações
                consultam o Google no servidor e preservam os dados anteriores
                em caso de falha. O período padrão termina ontem; dados recentes
                podem estar em processamento. A coleta de visitantes permanece
                condicionada ao consentimento em produção.
              </p>
              {data.syncState?.errors.map((e) => (
                <Notice
                  key={e.source}
                  error={e.source.toUpperCase() + ": " + e.message}
                />
              ))}
              <p className="admin-help">
                Última importação:{" "}
                {data.runs.find(
                  (r) =>
                    r.finishedAt && ["success", "partial"].includes(r.status),
                )?.finishedAt
                  ? new Date(
                      data.runs.find(
                        (r) =>
                          r.finishedAt &&
                          ["success", "partial"].includes(r.status),
                      )!.finishedAt!,
                    ).toLocaleString("pt-BR")
                  : "Ainda não concluída"}
                .
              </p>
            </Panel>
            <div className="admin-widgets">
              <Panel title="Visualizações GA4">
                <strong>{number(data.report.analytics?.pageViews)}</strong>
              </Panel>
              <Panel title="Sessões GA4">
                <strong>{number(data.report.analytics?.sessions)}</strong>
              </Panel>
              <Panel title="Usuários-dia">
                <strong>{number(data.report.analytics?.activeUserDays)}</strong>
              </Panel>
              <Panel title="Novos usuários por dia">
                <strong>{number(data.report.analytics?.newUsers)}</strong>
              </Panel>
              <Panel title="Sessões engajadas">
                <strong>
                  {number(data.report.analytics?.engagedSessions)}
                </strong>
              </Panel>
              <Panel title="Eventos GA4">
                <strong>{number(data.report.analytics?.events)}</strong>
              </Panel>
              <Panel title="Eventos principais">
                <strong>{number(data.report.analytics?.keyEvents)}</strong>
              </Panel>
              <Panel title="Tempo de engajamento">
                <strong>
                  {number(data.report.analytics?.engagementSeconds)} s
                </strong>
              </Panel>
            </div>
            <VisitedPages
              rows={(data.report.visitedPages || []).filter(
                (row) =>
                  (!category || row.categoryId === category) &&
                  (!filter ||
                    (row.path + " " + row.label)
                      .toLowerCase()
                      .includes(filter.toLowerCase())),
              )}
              origin={data.reportSiteUrl}
            />
            <div className="admin-widgets">
              <Panel title="Cliques orgânicos">
                <strong>{number(data.report.search?.clicks)}</strong>
              </Panel>
              <Panel title="Impressões">
                <strong>{number(data.report.search?.impressions)}</strong>
              </Panel>
              <Panel title="CTR">
                <strong>{percent(data.report.search?.ctr)}</strong>
              </Panel>
              <Panel title="Posição ponderada">
                <strong>{number(data.report.search?.position)}</strong>
              </Panel>
            </div>
            <UrlMetrics filtered={filtered} page={page} onPage={setPage} />
            <AnalyticsDetails
              key={query.toString() + category}
              data={data}
              query={query.toString()}
              category={category}
            />
          </>
        )
      )}
    </>
  );
}
