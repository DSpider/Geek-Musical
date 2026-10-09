import { useState } from "react";
import { Save, X } from "lucide-react";
import type {
  LinkGraphEntry,
  SettingsEnvelope,
} from "../../../shared/admin.js";
import { api } from "../api.js";
import { usePermission } from "../context.js";
import {
  DataTable,
  Empty,
  Loading,
  Notice,
  PageHeading,
  Pager,
  Panel,
  SearchBox,
  Status,
  useLoad,
  useTask,
} from "../components.js";
interface GraphData {
  entries: LinkGraphEntry[];
  revision: string;
  enabled: boolean;
}
export function LinkBuildingPage() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useLoad<GraphData>(
    "/link-building/graph",
    refresh,
  );
  const [q, setQuery] = useState("");
  const [orphanOnly, setOrphanOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LinkGraphEntry>();
  const [relations, setRelations] = useState<string[]>([]);
  const task = useTask();
  const manage = usePermission("linkbuilding.manage");
  const readPosts = usePermission("posts.read");
  const all = (data?.entries || []).filter(
    (entry) =>
      (!q ||
        (entry.title + " " + entry.id)
          .toLowerCase()
          .includes(q.toLowerCase())) &&
      (!orphanOnly || entry.orphan),
  );
  return (
    <>
      <PageHeading
        title="Link Building"
        description="Grafo editorial por IDs estáveis. Guias centrais também geram links automaticamente."
      />
      <Notice error={error || task.error} success={task.success} />
      {data && manage && (
        <Panel>
          <div className="admin-toolbar">
            <p>
              Gerenciamento de relações:{" "}
              <strong>{data.enabled ? "Habilitado" : "Desabilitado"}</strong>
            </p>
            <button
              className="admin-button secondary"
              disabled={task.busy}
              onClick={() =>
                void task.run(async () => {
                  const settings =
                    await api<SettingsEnvelope>("/link-building");
                  await api("/link-building", {
                    method: "PUT",
                    body: {
                      revision: settings.revision,
                      values: { "link-building.enabled": !data.enabled },
                    },
                  });
                  setRefresh((n) => n + 1);
                })
              }
            >
              {data.enabled ? "Desabilitar edição" : "Habilitar edição"}
            </button>
          </div>
        </Panel>
      )}
      <div className={editing ? "admin-split" : ""}>
        <Panel>
          <div className="admin-toolbar">
            <SearchBox
              placeholder="Pesquisar artigos e relações"
              onSearch={(q) => {
                setQuery(q);
                setPage(1);
              }}
            />
            <label className="admin-check">
              <input
                type="checkbox"
                checked={orphanOnly}
                onChange={(e) => {
                  setOrphanOnly(e.target.checked);
                  setPage(1);
                }}
              />
              Sem links de entrada
            </label>
          </div>
          {loading ? (
            <Loading />
          ) : (
            data && (
              <>
                <DataTable
                  label="Relações entre conteúdos"
                  headers={[
                    "Artigo",
                    "Status",
                    "Recebidos",
                    "Enviados",
                    "Ações",
                  ]}
                >
                  {all.slice((page - 1) * 15, page * 15).map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <strong>{entry.title}</strong>
                        <small>
                          {entry.id}
                          {entry.orphan ? " · Sem links de entrada" : ""}
                        </small>
                      </td>
                      <td>
                        <Status value={entry.status} />
                      </td>
                      <td>{entry.incoming.length}</td>
                      <td>{entry.outgoing.length}</td>
                      <td>
                        <button
                          onClick={() => {
                            setEditing(entry);
                            setRelations(entry.relatedPostIds);
                          }}
                        >
                          Ver relações
                        </button>
                      </td>
                    </tr>
                  ))}
                </DataTable>
                {!all.length && (
                  <Empty>Nenhum artigo corresponde à pesquisa.</Empty>
                )}
                <Pager
                  page={page}
                  pages={Math.max(1, Math.ceil(all.length / 15))}
                  total={all.length}
                  onPage={setPage}
                />
              </>
            )
          )}
        </Panel>
        {editing && data && (
          <Panel title={editing.title}>
            <button
              className="admin-icon-button"
              aria-label="Fechar relações"
              onClick={() => setEditing(undefined)}
            >
              <X size={20} />
            </button>
            <h3>Links recebidos</h3>
            <ul className="admin-link-list">
              {editing.incoming.map((id) => (
                <li key={id}>
                  {readPosts ? (
                    <a href={"/gm-admin/posts?edit=" + encodeURIComponent(id)}>
                      {data.entries.find((e) => e.id === id)?.title || id}
                    </a>
                  ) : (
                    id
                  )}
                </li>
              ))}
            </ul>
            {!editing.incoming.length && (
              <p className="admin-help">
                Este artigo não recebe links de outros artigos no grafo
                editorial.
              </p>
            )}
            <h3>Links no corpo</h3>
            <p className="admin-help">
              Edite o conteúdo do post para alterar os links escritos no texto.
            </p>
            <ul className="admin-link-list">
              {editing.bodyLinks.map((id) => (
                <li key={id}>
                  {data.entries.find((e) => e.id === id)?.title || id}
                </li>
              ))}
            </ul>
            <h3>Artigos relacionados</h3>
            <p className="admin-help">
              A relação obrigatória com o guia central e os links automáticos
              são validados no servidor.
            </p>
            <div className="admin-relations">
              {data.entries
                .filter((e) => e.id !== editing.id)
                .map((entry) => (
                  <label className="admin-check" key={entry.id}>
                    <input
                      type="checkbox"
                      disabled={!manage || !data.enabled}
                      checked={relations.includes(entry.id)}
                      onChange={(e) =>
                        setRelations(
                          e.target.checked
                            ? [...relations, entry.id]
                            : relations.filter((id) => id !== entry.id),
                        )
                      }
                    />
                    <span>
                      {entry.title}
                      <small>{entry.id}</small>
                    </span>
                  </label>
                ))}
            </div>
            {manage && (
              <button
                className="admin-button"
                disabled={task.busy || !data.enabled}
                onClick={() =>
                  void task.run(async () => {
                    await api(
                      "/link-building/relations/" +
                        encodeURIComponent(editing.id),
                      {
                        method: "PUT",
                        body: {
                          revision: data.revision,
                          relatedPostIds: relations,
                        },
                      },
                    );
                    setEditing(undefined);
                    setRefresh((n) => n + 1);
                  })
                }
              >
                <Save size={18} />
                Salvar relações
              </button>
            )}
          </Panel>
        )}
      </div>
      <Panel title="Leitura do grafo">
        <p className="admin-help">
          Os números incluem relações explícitas, links no Markdown e links
          automáticos entre guia central e artigos da categoria. O status de
          destino determina quais links podem aparecer publicamente. Sugestões
          semânticas por IA ficam para uma próxima etapa.
        </p>
      </Panel>
    </>
  );
}
