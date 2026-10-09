import { useState } from "react";
import { Plus } from "lucide-react";
import type { PageResult } from "../../../shared/admin.js";
import type { RedirectRecord } from "../../../shared/redirect.js";
import { api } from "../api.js";
import { usePermission } from "../context.js";
import {
  Confirm,
  DataTable,
  Empty,
  Field,
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
import { RedirectEditor } from "./RedirectEditor.js";

export function RedirectPage() {
  const [refresh, setRefresh] = useState(0);
  const [q, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ record?: RedirectRecord }>();
  const [deleting, setDeleting] = useState<RedirectRecord>();
  const [savedMessage, setSavedMessage] = useState("");
  const query = new URLSearchParams({
    q,
    page: String(page),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
  });
  const { data, error, loading } = useLoad<PageResult<RedirectRecord>>(
    "/redirect?" + query,
    refresh,
  );
  const manage = usePermission("redirect.manage");
  const task = useTask();
  const reload = () => setRefresh((n) => n + 1);
  return (
    <>
      <PageHeading
        title="Redirect"
        description="Endereços curtos com destinos controlados. As URLs do blog continuam usando o mapa editorial existente."
        action={
          manage && (
            <button className="admin-button" onClick={() => setEditor({})}>
              <Plus size={18} />
              Adicionar redirect
            </button>
          )
        }
      />
      <Notice
        error={error || task.error}
        success={task.success || savedMessage}
      />
      <div className={editor ? "admin-split" : ""}>
        <Panel>
          <div className="admin-toolbar admin-redirect-toolbar">
            <SearchBox
              placeholder="Pesquisar redirects"
              onSearch={(value) => {
                setQuery(value);
                setPage(1);
              }}
            />
            <Field label="Filtrar por status">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </Field>
            <Field label="Filtrar por tipo">
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos os tipos</option>
                <option value="301">301 — Permanente</option>
                <option value="302">302 — Temporário</option>
              </select>
            </Field>
          </div>
          {loading ? (
            <Loading />
          ) : (
            data && (
              <>
                <DataTable
                  label="Redirects cadastrados"
                  headers={[
                    "Nome / Alias",
                    "Destino",
                    "Tipo",
                    "Status",
                    "Ações",
                  ]}
                >
                  {data.items.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.name}</strong>
                        <small>/{record.alias}</small>
                      </td>
                      <td className="admin-redirect-destination">
                        {record.destination}
                      </td>
                      <td>{record.redirectType}</td>
                      <td>
                        <Status value={record.status} />
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          {record.status === "active" && (
                            <a
                              href={"/" + record.alias}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Abrir
                            </a>
                          )}
                          {manage && (
                            <>
                              <button onClick={() => setEditor({ record })}>
                                Editar
                              </button>
                              <button
                                disabled={task.busy}
                                onClick={() =>
                                  void task.run(
                                    async () => {
                                      await api("/redirect/" + record.id, {
                                        method: "PUT",
                                        body: {
                                          revision: record.revision,
                                          redirect: {
                                            name: record.name,
                                            alias: record.alias,
                                            destination: record.destination,
                                            redirectType: record.redirectType,
                                            status:
                                              record.status === "active"
                                                ? "inactive"
                                                : "active",
                                          },
                                        },
                                      });
                                      reload();
                                    },
                                    record.status === "active"
                                      ? "Redirect desativado."
                                      : "Redirect ativado.",
                                  )
                                }
                              >
                                {record.status === "active"
                                  ? "Desativar"
                                  : "Ativar"}
                              </button>
                              <button
                                className="admin-text-danger"
                                onClick={() => setDeleting(record)}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </DataTable>
                {!data.items.length && (
                  <Empty>
                    Nenhum redirect corresponde aos filtros. Adicione um alias
                    para começar.
                  </Empty>
                )}
                <Pager
                  page={data.page}
                  pages={data.pages}
                  total={data.total}
                  onPage={setPage}
                />
              </>
            )
          )}
        </Panel>
        {editor && (
          <RedirectEditor
            key={editor.record?.id || "new"}
            record={editor.record}
            onClose={() => setEditor(undefined)}
            onSaved={() => {
              setSavedMessage(
                editor.record ? "Redirect atualizado." : "Redirect criado.",
              );
              setEditor(undefined);
              reload();
            }}
          />
        )}
      </div>
      {deleting && (
        <Confirm
          title="Excluir redirect?"
          confirmLabel="Excluir redirect"
          busy={task.busy}
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            void task.run(async () => {
              await api("/redirect/" + deleting.id, {
                method: "DELETE",
                body: { revision: deleting.revision },
              });
              setDeleting(undefined);
              reload();
            }, "Redirect excluído.")
          }
        >
          <p>
            O endereço /{deleting.alias} deixará de redirecionar. Relações com
            outros redirects precisam ser removidas antes da exclusão.
          </p>
        </Confirm>
      )}
    </>
  );
}
