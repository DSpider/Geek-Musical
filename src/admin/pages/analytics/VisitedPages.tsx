import { useState } from "react";
import type { VisitedPage } from "../../../../shared/analytics.js";
import { DataTable, Empty, Field, Pager, Panel } from "../../components.js";
import { number, percent } from "./format.js";
export function VisitedPages({
  rows,
  origin,
}: {
  rows: VisitedPage[];
  origin: string;
}) {
  const [sort, setSort] = useState("views"),
    [page, setPage] = useState(1);
  const sorted = [...rows].sort((a, b) =>
    sort === "clicks"
      ? (b.clicks || 0) - (a.clicks || 0)
      : sort === "sessions"
        ? b.analytics.sessions - a.analytics.sessions
        : b.analytics.pageViews - a.analytics.pageViews,
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
  return (
    <Panel title="Páginas mais visitadas · GA4">
      <Field label="Ordenar páginas">
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="views">Mais visualizações</option>
          <option value="sessions">Mais sessões</option>
          <option value="clicks">Mais cliques</option>
        </select>
      </Field>
      <DataTable
        label="Páginas mais visitadas no GA4"
        headers={[
          "Página",
          "Visualizações",
          "Sessões por dia",
          "Usuários-dia",
          "Cliques GA4",
          "Afiliados / CTAs",
          "Buscas",
          "Eventos",
          "Sessões engajadas",
          "Engajamento",
        ]}
      >
        {sorted.slice((currentPage - 1) * 20, currentPage * 20).map((row) => (
          <tr key={row.path}>
            <td>
              <a
                href={origin + row.path}
                target="_blank"
                rel="noopener noreferrer"
              >
                {row.path}
              </a>
              <small className="admin-help">{row.label}</small>
            </td>
            <td>{number(row.analytics.pageViews)}</td>
            <td>{number(row.analytics.sessions)}</td>
            <td>{number(row.analytics.activeUserDays)}</td>
            <td>{number(row.clicks)}</td>
            <td>
              {number(row.affiliateClicks)} / {number(row.ctaClicks)}
            </td>
            <td>{number(row.searches)}</td>
            <td>{number(row.events)}</td>
            <td>
              {number(row.analytics.engagedSessions)} ·{" "}
              {percent(
                row.analytics.sessions
                  ? row.analytics.engagedSessions / row.analytics.sessions
                  : 0,
              )}
            </td>
            <td>{number(row.analytics.engagementSeconds)} s</td>
          </tr>
        ))}
      </DataTable>
      {!rows.length && (
        <Empty>
          O GA4 ainda não retornou páginas neste período. Atualize os relatórios
          ou selecione outro período.
        </Empty>
      )}
      <Pager
        page={currentPage}
        pages={Math.max(1, Math.ceil(rows.length / 20))}
        total={rows.length}
        onPage={setPage}
      />
      <p className="admin-help">
        Cliques GA4 incluem cliques de saída, afiliados e CTAs registrados.
        Usuários-dia e sessões por página somam os relatórios diários e não
        representam usuários únicos do período. Dias recentes podem estar em
        processamento.
      </p>
    </Panel>
  );
}
