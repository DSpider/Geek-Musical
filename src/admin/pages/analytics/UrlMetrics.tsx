import type { UrlReport } from "../../../../shared/analytics.js";
import { DataTable, Empty, Pager, Panel, Status } from "../../components.js";
import { number, percent } from "./format.js";
export function UrlMetrics({
  filtered,
  page,
  onPage,
}: {
  filtered: UrlReport[];
  page: number;
  onPage: (page: number) => void;
}) {
  return (
    <Panel title="Inventário e métricas por URL">
      <DataTable
        label="URLs do catálogo"
        headers={[
          "URL / tipo",
          "Status",
          "Sitemap",
          "Cliques / impressões",
          "CTR / posição",
          "Visualizações GA4",
          "Inspeção",
        ]}
      >
        {filtered.slice((page - 1) * 20, page * 20).map((url) => (
          <tr key={url.url}>
            <td>
              <a href={url.path} target="_blank" rel="noopener noreferrer">
                {url.path}
              </a>
              <small className="admin-help">
                {url.type} · {url.label}
              </small>
            </td>
            <td>
              <Status value={url.status} />
            </td>
            <td>{url.sitemap || "Fora do sitemap"}</td>
            <td>
              {number(url.search?.clicks)} / {number(url.search?.impressions)}
            </td>
            <td>
              {percent(url.search?.ctr)} / {number(url.search?.position)}
            </td>
            <td>{number(url.analytics?.pageViews)}</td>
            <td>
              {url.inspection ? (
                <>
                  {url.inspection.coverageState ||
                    url.inspection.verdict ||
                    "Sem conclusão"}
                  <small className="admin-help">
                    {new Date(url.inspection.inspectedAt).toLocaleString(
                      "pt-BR",
                    )}
                  </small>
                </>
              ) : (
                "Não consultada"
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {!filtered.length && <Empty>Nenhuma URL encontrada.</Empty>}
      <Pager
        page={page}
        pages={Math.max(1, Math.ceil(filtered.length / 20))}
        total={filtered.length}
        onPage={onPage}
      />
    </Panel>
  );
}
