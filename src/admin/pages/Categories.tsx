import { useState } from "react";
import { Plus, Save } from "lucide-react";
import type { Category, Cta } from "../../../shared/content.js";
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
  Panel,
  SearchBox,
  Status,
  useLoad,
  useTask,
} from "../components.js";
interface CategoryData {
  categories: Category[];
  ctas: Cta[];
  posts: { id: string; title: string; categoryId: string }[];
  revision: string;
}
export function CategoriesPage() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useLoad<CategoryData>(
    "/categories",
    refresh,
  );
  const [editing, setEditing] = useState<Category>();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Category>();
  const [reassignTo, setReassign] = useState("");
  const [q, setQuery] = useState("");
  const task = useTask();
  const manage = usePermission("categories.manage");
  const change = <K extends keyof Category>(key: K, value: Category[K]) =>
    setEditing((previous) => ({ ...previous!, [key]: value }));
  const add = () => {
    setCreating(true);
    setEditing({
      id: "category-" + crypto.randomUUID(),
      name: "",
      slug: "",
      description: "",
      seoTitle: "",
      seoDescription: "",
      ctaKey: data!.ctas[0]?.id || "",
      order: data!.categories.length,
      status: "active",
    });
  };
  return (
    <>
      <PageHeading
        title="Categorias"
        description="Taxonomia única do blog. Categoria, guia central e CTA são validados em conjunto."
        action={
          manage &&
          data && (
            <button className="admin-button" onClick={add}>
              <Plus size={18} />
              Adicionar categoria
            </button>
          )
        }
      />
      <Notice error={error || task.error} success={task.success} />
      <div className={editing ? "admin-split" : ""}>
        <Panel>
          <SearchBox placeholder="Pesquisar categorias" onSearch={setQuery} />
          {loading ? (
            <Loading />
          ) : (
            data && (
              <>
                <DataTable
                  label="Categorias"
                  headers={[
                    "Categoria",
                    "Slug",
                    "Artigos",
                    "Ordem",
                    "Status",
                    "Ações",
                  ]}
                >
                  {data.categories
                    .filter((c) =>
                      c.name.toLowerCase().includes(q.toLowerCase()),
                    )
                    .sort((a, b) => a.order - b.order)
                    .map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                          <small>
                            {c.pillarPostId
                              ? "Guia: " + c.pillarPostId
                              : "Sem guia central"}
                          </small>
                        </td>
                        <td>{c.slug}</td>
                        <td>
                          {
                            data.posts.filter((p) => p.categoryId === c.id)
                              .length
                          }
                        </td>
                        <td>{c.order}</td>
                        <td>
                          <Status value={c.status} />
                        </td>
                        <td>
                          {manage && (
                            <div className="admin-row-actions">
                              <button
                                onClick={() => {
                                  setEditing(c);
                                  setCreating(false);
                                }}
                              >
                                Editar
                              </button>
                              <button
                                className="admin-text-danger"
                                onClick={() => {
                                  setDeleting(c);
                                  setReassign("");
                                }}
                              >
                                Excluir
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </DataTable>
                {!data.categories.length && (
                  <Empty>Adicione a primeira categoria.</Empty>
                )}
              </>
            )
          )}
        </Panel>
        {editing && data && (
          <Panel title={creating ? "Nova categoria" : "Editar categoria"}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void task.run(async () => {
                  await api(
                    creating
                      ? "/categories"
                      : "/categories/" + encodeURIComponent(editing.id),
                    {
                      method: creating ? "POST" : "PUT",
                      body: { category: editing, revision: data.revision },
                    },
                  );
                  setEditing(undefined);
                  setRefresh((n) => n + 1);
                });
              }}
            >
              {(
                [
                  "name",
                  "slug",
                  "description",
                  "seoTitle",
                  "seoDescription",
                ] as const
              ).map((key) => (
                <Field
                  key={key}
                  label={
                    {
                      name: "Nome",
                      slug: "Slug",
                      description: "Descrição",
                      seoTitle: "Título SEO",
                      seoDescription: "Descrição SEO",
                    }[key]
                  }
                >
                  {key === "description" || key === "seoDescription" ? (
                    <textarea
                      value={editing[key]}
                      minLength={50}
                      maxLength={key === "seoDescription" ? 200 : 2000}
                      rows={4}
                      onChange={(e) => change(key, e.target.value)}
                      required
                    />
                  ) : (
                    <input
                      value={editing[key]}
                      maxLength={200}
                      pattern={
                        key === "slug" ? "[a-z0-9]+(-[a-z0-9]+)*" : undefined
                      }
                      minLength={key === "seoTitle" ? 10 : 2}
                      onChange={(e) => change(key, e.target.value)}
                      required
                    />
                  )}
                </Field>
              ))}
              <Field
                label="Guia central"
                help="Pode ficar vazio enquanto a categoria não tiver artigos publicados."
              >
                <select
                  value={editing.pillarPostId || ""}
                  onChange={(e) =>
                    change("pillarPostId", e.target.value || undefined)
                  }
                >
                  <option value="">Sem guia central</option>
                  {data.posts
                    .filter((p) => p.categoryId === editing.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="CTA">
                <select
                  value={editing.ctaKey}
                  onChange={(e) => change("ctaKey", e.target.value)}
                >
                  {data.ctas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ordem">
                <input
                  type="number"
                  value={editing.order}
                  min={0}
                  max={10000}
                  onChange={(e) => change("order", Number(e.target.value))}
                />
              </Field>
              <Field label="Status">
                <select
                  value={editing.status}
                  onChange={(e) =>
                    change("status", e.target.value as Category["status"])
                  }
                >
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </select>
              </Field>
              <div className="admin-actions">
                <button className="admin-button" disabled={task.busy}>
                  <Save size={18} />
                  Salvar categoria
                </button>
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setEditing(undefined)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </Panel>
        )}
      </div>
      {deleting && data && (
        <Confirm
          title={"Excluir " + deleting.name + "?"}
          confirmLabel="Excluir categoria"
          busy={task.busy}
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            void task.run(async () => {
              await api("/categories/" + encodeURIComponent(deleting.id), {
                method: "DELETE",
                body: {
                  revision: data.revision,
                  ...(reassignTo ? { reassignTo } : {}),
                },
              });
              setDeleting(undefined);
              setEditing(undefined);
              setRefresh((n) => n + 1);
            }, "Categoria excluída; artigos preservados no destino.")
          }
        >
          <p>
            Os artigos precisam ser realocados antes da exclusão. URLs
            publicadas recebem correspondência editorial para o novo destino.
          </p>
          {data.posts.some((p) => p.categoryId === deleting.id) && (
            <Field label="Mover artigos para">
              <select
                value={reassignTo}
                onChange={(e) => setReassign(e.target.value)}
              >
                <option value="">Selecione uma categoria</option>
                {data.categories
                  .filter((c) => c.id !== deleting.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Notice error={task.error} />
        </Confirm>
      )}
    </>
  );
}
