import { useState } from "react";
import type { AnalyticsOverview } from "../../../../shared/analytics.js";
import {
  DataTable,
  Empty,
  Field,
  Loading,
  Notice,
  Pager,
  Panel,
  useLoad,
} from "../../components.js";
import { number, percent } from "./format.js";
export function AnalyticsDetails({
  data,
  query,
  category,
}: {
  data: AnalyticsOverview;
  query: string;
  category: string;
}) {
  const [queryPage, setQueryPage] = useState(1);
  const [queryPath, setQueryPath] = useState("");
  const all = data.report.urls;
  const queryFilters = new URLSearchParams(query);
  queryFilters.set("page", String(queryPage));
  if (category) queryFilters.set("category", category);
  if (queryPath) queryFilters.set("path", queryPath);
  const queries = useLoad<{
    items: {
      query: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number | null;
    }[];
    page: number;
    pages: number;
    total: number;
  }>("/analytics/queries?" + queryFilters);
  const events = useLoad<{ events: { name: string; count: number }[] }>(
    "/analytics/events?" + query,
  );
  return (
    <>
      {" "}
      <Panel title="Sitemaps">
        <DataTable
          label="Sitemaps gerados pelo catálogo"
          headers={["Arquivo", "Quantidade"]}
        >
          {data.sitemapCounts.map((doc) => (
            <tr key={doc.path}>
              <td>
                <a href={doc.path}>{doc.path}</a>
              </td>
              <td>
                {doc.urls}
                {doc.path === "/sitemap.xml" ? " arquivos filhos" : " URLs"}
              </td>
            </tr>
          ))}
        </DataTable>
        <p className="admin-help">
          Quantidades potenciais do catálogo publicado. DEV/staging servem XML
          vazio; existência local não comprova submissão, leitura ou indexação
          pelo Google.
        </p>
      </Panel>
      <Panel title="Sinais para revisão">
        {data.report.opportunities.length ? (
          <DataTable
            label="Oportunidades SEO"
            headers={["Sinal", "URL", "Evidência"]}
          >
            {data.report.opportunities.map((signal) => (
              <tr key={signal.code + signal.url}>
                <td>{signal.code}</td>
                <td>{new URL(signal.url).pathname}</td>
                <td>{signal.evidence}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Empty>
            Sem sinais calculáveis para este período. Configure e sincronize as
            fontes para avaliar métricas.
          </Empty>
        )}
      </Panel>
      <Panel title="Queries orgânicas">
        <Field label="Filtrar queries por página">
          <select
            value={queryPath}
            onChange={(event) => {
              setQueryPath(event.target.value);
              setQueryPage(1);
            }}
          >
            <option value="">
              Todas as páginas{category ? " da categoria" : ""}
            </option>
            {all
              .filter((url) => !category || url.categoryId === category)
              .map((url) => (
                <option key={url.path} value={url.path}>
                  {url.path}
                </option>
              ))}
          </select>
        </Field>
        <Notice error={queries.error} />
        {queries.loading ? (
          <Loading />
        ) : queries.data?.items.length ? (
          <>
            <DataTable
              label="Queries fornecidas pelo Search Console"
              headers={["Query", "Cliques", "Impressões", "CTR", "Posição"]}
            >
              {queries.data.items.map((item) => (
                <tr key={item.query}>
                  <td>{item.query}</td>
                  <td>{number(item.clicks)}</td>
                  <td>{number(item.impressions)}</td>
                  <td>{percent(item.ctr)}</td>
                  <td>{number(item.position)}</td>
                </tr>
              ))}
            </DataTable>
            <Pager {...queries.data} onPage={setQueryPage} />
          </>
        ) : (
          <Empty>
            Nenhuma query armazenada. Dados anonimizados não estão disponíveis
            na API.
          </Empty>
        )}
      </Panel>
      <Panel title="Eventos GA4">
        <Notice error={events.error} />
        {events.data?.events.length ? (
          <DataTable label="Eventos GA4" headers={["Evento", "Quantidade"]}>
            {events.data.events.map((event) => (
              <tr key={event.name}>
                <td>{event.name}</td>
                <td>{number(event.count)}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Empty>Nenhum evento sincronizado.</Empty>
        )}
      </Panel>
      <Panel title="Sincronizações">
        {data.runs.length ? (
          <DataTable
            label="Histórico de sincronização"
            headers={[
              "Origem",
              "Período",
              "Resultado",
              "Recebidas / gravadas",
              "Conclusão",
            ]}
          >
            {data.runs.map((run) => (
              <tr key={run.id}>
                <td>{run.source.toUpperCase()}</td>
                <td>
                  {run.from} → {run.to}
                </td>
                <td>
                  {run.status}
                  {run.errorCode ? " · " + run.errorCode : ""}
                </td>
                <td>
                  {run.rowsReceived} / {run.rowsWritten}
                </td>
                <td>
                  {run.finishedAt
                    ? new Date(run.finishedAt).toLocaleString("pt-BR")
                    : "Em execução"}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Empty>Nenhuma sincronização executada.</Empty>
        )}
      </Panel>
      <Panel title="Cobertura e interpretação">
        <ul>
          {data.report.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        {data.report.coverage.map((coverage) => (
          <p key={coverage.dataset}>
            {coverage.dataset}: {coverage.days} dias consultados,{" "}
            {coverage.completeDays} concluídos sem truncamento/preliminares.{" "}
            {coverage.warnings.join(" ")}
          </p>
        ))}
      </Panel>
    </>
  );
}
