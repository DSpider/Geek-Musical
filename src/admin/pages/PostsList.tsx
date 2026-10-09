import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { Post, Category } from "../../../shared/content.js";
import type { PageResult } from "../../../shared/admin.js";
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
type PostList = PageResult<Omit<Post, "body" | "sources">> & {
  categories: Category[];
};
export function PostsList() {
  const [q, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [deleting, setDeleting] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"draft" | "archived" | "">("");
  const [confirmBulk, setConfirmBulk] = useState(false);
  const task = useTask();
  const create = usePermission("posts.create");
  const remove = usePermission("posts.delete");
  const update = usePermission("posts.update");
  const publish = usePermission("posts.publish");
  useEffect(() => setSelected([]), [q, status, category, page]);
  const query = new URLSearchParams({
    q,
    page: String(page),
    ...(status ? { status } : {}),
    ...(category ? { categoryId: category } : {}),
  });
  const { data, loading, error } = useLoad<PostList>(
    "/posts?" + query.toString(),
    refresh,
  );
  const editable =
    data?.items.filter((post) => publish || post.status !== "published") || [];
  return (
    <>
      <PageHeading
        title="Posts"
        description="Conteúdo editorial do blog, com os mesmos IDs e metadados do portal."
        action={
          create && (
            <a className="admin-button" href="/gm-admin/posts?edit=new">
              <Plus size={18} />
              Adicionar post
            </a>
          )
        }
      />
      <Notice error={error || task.error} success={task.success} />
      <Panel>
        <div className="admin-toolbar">
          <SearchBox
            placeholder="Pesquisar título ou ID"
            onSearch={(q) => {
              setQuery(q);
              setPage(1);
            }}
          />
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="draft">Rascunhos</option>
              <option value="review">Em revisão</option>
              <option value="published">Publicados</option>
              <option value="archived">Arquivados</option>
            </select>
          </Field>
          <Field label="Categoria">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {update && !loading && !!data?.items.length && (
          <div className="admin-toolbar">
            <label className="admin-check">
              <input
                type="checkbox"
                checked={
                  !!editable.length && selected.length === editable.length
                }
                disabled={task.busy || !editable.length}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? editable.map((post) => post.id) : [],
                  )
                }
              />
              Selecionar página
            </label>
            <Field label="Ação em massa">
              <select
                value={bulkAction}
                disabled={task.busy}
                onChange={(e) =>
                  setBulkAction(e.target.value as typeof bulkAction)
                }
              >
                <option value="">Escolha uma ação</option>
                <option value="draft">Mover para rascunho</option>
                <option value="archived">Arquivar</option>
              </select>
            </Field>
            <button
              className="admin-button secondary"
              disabled={task.busy || !selected.length || !bulkAction}
              onClick={() => setConfirmBulk(true)}
            >
              Aplicar a {selected.length}{" "}
              {selected.length === 1 ? "artigo" : "artigos"}
            </button>
          </div>
        )}
        {loading ? (
          <Loading />
        ) : (
          data && (
            <>
              <DataTable
                label="Artigos"
                headers={[
                  ...(update ? ["Seleção"] : []),
                  "Artigo",
                  "Categoria",
                  "Status",
                  "Atualização",
                  "Ações",
                ]}
              >
                {data.items.map((post) => (
                  <tr key={post.id}>
                    {update && (
                      <td className="admin-selection">
                        <label className="admin-selection-label">
                          <input
                            type="checkbox"
                            aria-label={"Selecionar " + post.id}
                            checked={selected.includes(post.id)}
                            disabled={
                              task.busy ||
                              (!publish && post.status === "published")
                            }
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, post.id]
                                  : selected.filter((id) => id !== post.id),
                              )
                            }
                          />
                        </label>
                      </td>
                    )}
                    <td className="admin-post-title">
                      <a
                        className="admin-table-title"
                        href={
                          "/gm-admin/posts?edit=" + encodeURIComponent(post.id)
                        }
                      >
                        {post.title}
                      </a>
                      <small>
                        {post.id} · {post.slug}
                      </small>
                    </td>
                    <td>
                      {
                        data.categories.find((c) => c.id === post.categoryId)
                          ?.name
                      }
                    </td>
                    <td>
                      <Status value={post.status} />
                    </td>
                    <td>{post.updatedAt}</td>
                    <td>
                      <div className="admin-row-actions">
                        <a
                          href={
                            "/gm-admin/posts?edit=" +
                            encodeURIComponent(post.id)
                          }
                        >
                          Editar
                        </a>
                        {remove && (
                          <button
                            className="admin-text-danger"
                            disabled={task.busy}
                            onClick={() => setDeleting(post.id)}
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>
              {!data.items.length && (
                <Empty>Nenhum artigo corresponde aos filtros.</Empty>
              )}
              <Pager
                page={page}
                pages={data.pages}
                total={data.total}
                onPage={setPage}
              />
            </>
          )
        )}
      </Panel>
      {confirmBulk && bulkAction && (
        <Confirm
          title="Alterar os artigos selecionados?"
          confirmLabel="Aplicar ação"
          busy={task.busy}
          onClose={() => setConfirmBulk(false)}
          onConfirm={() =>
            void task.run(async () => {
              await api("/posts/bulk", {
                method: "POST",
                body: {
                  revision: data!.revision,
                  ids: selected,
                  status: bulkAction,
                },
              });
              setConfirmBulk(false);
              setSelected([]);
              setRefresh((value) => value + 1);
            }, "Status dos artigos atualizado.")
          }
        >
          <p>
            {selected.length}{" "}
            {selected.length === 1 ? "artigo será" : "artigos serão"}{" "}
            {bulkAction === "draft"
              ? selected.length === 1
                ? "movido para rascunho"
                : "movidos para rascunho"
              : selected.length === 1
                ? "arquivado"
                : "arquivados"}
            . Artigos publicados deixarão de aparecer no portal. A operação
            preserva os textos e pode ser revertida no editor.
          </p>
          <Notice error={task.error} />
        </Confirm>
      )}
      {deleting && (
        <Confirm
          title="Excluir artigo?"
          confirmLabel="Excluir artigo"
          busy={task.busy}
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            void task.run(async () => {
              await api("/posts/" + encodeURIComponent(deleting), {
                method: "DELETE",
                body: { revision: data!.revision },
              });
              setDeleting(undefined);
              setRefresh((value) => value + 1);
            }, "Artigo excluído.")
          }
        >
          <p>
            O artigo será removido da fonte editorial. Links recebidos e guias
            centrais impedem a exclusão até serem tratados.
          </p>
          <Notice error={task.error} />
        </Confirm>
      )}
    </>
  );
}
