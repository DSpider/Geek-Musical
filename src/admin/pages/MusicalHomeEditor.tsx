import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import {
  moveHomePost,
  moveHomeGrid,
  homeGridModes,
  type HomeGridMode,
  type HomeEditorData,
  type HomeGrid,
  type HomeLayout,
} from "../../../shared/home-editor.js";
import { api } from "../api.js";
import { usePermission } from "../context.js";
import {
  Confirm,
  Field,
  Loading,
  Notice,
  PageHeading,
  Panel,
  useLoad,
  useTask,
} from "../components.js";

export function HomeEditorPage() {
  const { data, loading, error, setData } = useLoad<HomeEditorData>("/home");
  const [layout, setLayout] = useState<HomeLayout>();
  const [query, setQuery] = useState("");
  const [newMode, setNewMode] = useState<HomeGridMode>("manual");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState<{ gridId: string; postId: string }>();
  const [removing, setRemoving] = useState<string>();
  const [message, setMessage] = useState("");
  const task = useTask();
  const create = usePermission("posts.create");
  const edit = usePermission("posts.update");
  useEffect(() => {
    if (data) setLayout(data.layout);
  }, [data?.layout]);
  const dirty =
    !!data &&
    !!layout &&
    JSON.stringify(data.layout) !== JSON.stringify(layout);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function changeGrid(id: string, patch: Partial<HomeGrid>) {
    if (!layout) return;
    const grid = layout.grids.find((g) => g.id === id)!;
    if (
      grid.postIds.length >
      (patch.columns ?? grid.columns) * (patch.rows ?? grid.rows)
    ) {
      setMessage(
        "Remova ou mova posts antes de diminuir a grade. Nenhum post foi removido.",
      );
      return;
    }
    setMessage("");
    setLayout({
      ...layout,
      grids: layout.grids.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    });
  }
  function move(from: string, postId: string, to: string, index: number) {
    if (!layout) return;
    const result = moveHomePost(layout, from, postId, to, index);
    if (result === layout)
      setMessage("A grade de destino está cheia ou já contém esse post.");
    else {
      setLayout(result);
      setMessage("Posição alterada. Salve a Home para aplicar.");
    }
    setDrag(undefined);
  }
  function moveGrid(index: number, direction: -1 | 1) {
    if (!layout) return;
    setLayout(moveHomeGrid(layout, index, direction));
    setMessage("Ordem das grades alterada. Salve a Home para aplicar.");
  }
  return (
    <>
      <PageHeading
        title="Editor da Home"
        description="Organize os artigos da página inicial. Arraste os posts ou use os controles de posição."
        action={
          <a
            className="admin-button secondary"
            href="/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver Home salva
          </a>
        }
      />
      <Notice error={error || task.error} success={task.success} />
      {loading ? (
        <Loading />
      ) : (
        data &&
        layout && (
          <>
            <Panel>
              <div className="admin-home-actions">
                <strong>
                  {(
                    {
                      development: "DEV",
                      production: "Produção",
                    } as Record<string, string>
                  )[data.environment] || data.environment}{" "}
                  · {dirty ? "Alterações não salvas" : "Home salva"}
                </strong>
                <button
                  className="admin-button"
                  disabled={!dirty || task.busy}
                  onClick={() =>
                    void task.run(async () => {
                      const updated = await api<HomeEditorData>("/home", {
                        method: "PUT",
                        body: { layout, revision: data.revision },
                      });
                      setData(updated);
                      setMessage("");
                    }, "Home salva. As grades já estão disponíveis na página inicial.")
                  }
                >
                  <Save size={18} />
                  {task.busy ? "Salvando…" : "Salvar Home"}
                </button>
                <button
                  className="admin-button secondary"
                  disabled={!dirty || task.busy}
                  onClick={() => {
                    setLayout(structuredClone(data.layout));
                    setMessage("");
                  }}
                >
                  Desfazer alterações
                </button>
              </div>
              <p className="admin-help">
                Cada grade aceita até 4 colunas e 6 linhas. Em telas menores, as
                colunas se adaptam ao espaço disponível. Apenas posts publicados
                em categorias ativas podem aparecer na Home.
              </p>
              <Field label="Pesquisar posts por título ou categoria">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={120}
                />
              </Field>
              <div className="admin-home-actions">
                {create && (
                  <a
                    className="admin-button secondary"
                    href="/gm-admin/posts?edit=new"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Plus size={18} />
                    Criar novo post
                  </a>
                )}
                <button
                  className="admin-button secondary"
                  disabled={task.busy}
                  onClick={() =>
                    void task.run(async () => {
                      const updated = await api<HomeEditorData>("/home");
                      setData(
                        (previous) =>
                          previous && {
                            ...previous,
                            posts: updated.posts,
                            categories: updated.categories,
                            popularity: updated.popularity,
                            resolvedGrids: updated.resolvedGrids,
                          },
                      );
                    }, "Lista de posts atualizada.")
                  }
                >
                  Atualizar lista de posts
                </button>
              </div>
            </Panel>
            <p role="status" aria-live="polite" className="admin-help">
              {message}
            </p>
            <fieldset className="admin-home-editor" disabled={task.busy}>
              <legend className="sr-only">Grades da Home</legend>
              {layout.grids.map((grid, gridIndex) => (
                <Panel key={grid.id}>
                  <div className="admin-home-actions">
                    <h2>Grade {gridIndex + 1}</h2>
                    <span>
                      {homeGridModes[grid.mode ?? "manual"]} ·{" "}
                      {grid.mode && grid.mode !== "manual"
                        ? `${grid.columns * grid.rows} posições automáticas`
                        : `${grid.postIds.length} de ${grid.columns * grid.rows} posições`}
                    </span>
                    <button
                      className="admin-button secondary"
                      aria-label={`Subir grade ${gridIndex + 1}`}
                      disabled={gridIndex === 0}
                      onClick={() => moveGrid(gridIndex, -1)}
                    >
                      <ArrowUp size={16} />
                      Subir
                    </button>
                    <button
                      className="admin-button secondary"
                      aria-label={`Descer grade ${gridIndex + 1}`}
                      disabled={gridIndex === layout.grids.length - 1}
                      onClick={() => moveGrid(gridIndex, 1)}
                    >
                      <ArrowDown size={16} />
                      Descer
                    </button>
                    <button
                      className="admin-button secondary"
                      onClick={() => setRemoving(grid.id)}
                    >
                      <Trash2 size={16} />
                      Remover grade
                    </button>
                  </div>
                  <div className="admin-home-fields">
                    <Field label={`Título da grade ${gridIndex + 1}`}>
                      <input
                        value={grid.title}
                        maxLength={120}
                        required
                        onChange={(e) =>
                          changeGrid(grid.id, { title: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={`Chamada da grade ${gridIndex + 1}`}>
                      <input
                        value={grid.eyebrow}
                        maxLength={80}
                        onChange={(e) =>
                          changeGrid(grid.id, { eyebrow: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={`Colunas da grade ${gridIndex + 1}`}>
                      <select
                        value={grid.columns}
                        onChange={(e) =>
                          changeGrid(grid.id, {
                            columns: Number(e.target.value),
                          })
                        }
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={`Linhas da grade ${gridIndex + 1}`}>
                      <select
                        value={grid.rows}
                        onChange={(e) =>
                          changeGrid(grid.id, { rows: Number(e.target.value) })
                        }
                      >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {grid.mode === "category" && (
                    <Field label={`Categoria da grade ${gridIndex + 1}`}>
                      <select
                        required
                        value={grid.categoryId || ""}
                        onChange={(e) =>
                          changeGrid(grid.id, {
                            categoryId: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">Selecionar categoria</option>
                        {grid.categoryId &&
                          !data.categories.some(
                            (c) => c.id === grid.categoryId,
                          ) && (
                            <option value={grid.categoryId}>
                              Categoria indisponível
                            </option>
                          )}
                        {data.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {grid.mode && grid.mode !== "manual" ? (
                    <p className="admin-help">
                      Os posts são selecionados automaticamente a cada acesso à
                      Home, até o limite da grade.
                      {grid.mode === "popular" &&
                        (!data.popularity.available
                          ? " Sem dados de visualizações para os artigos: mostrando os últimos posts temporariamente."
                          : ` Ranking dos últimos 30 dias (${data.popularity.from} a ${data.popularity.to}).${data.popularity.partial ? " Os dados disponíveis cobrem parte do período." : ""}`)}
                    </p>
                  ) : (
                    <div
                      className={`admin-home-grid admin-home-columns-${grid.columns}`}
                      aria-label={`Posts da grade ${gridIndex + 1}`}
                    >
                      {grid.postIds.map((id, index) => {
                        const post = data.posts.find((p) => p.id === id);
                        return (
                          <article
                            key={id}
                            className={
                              "admin-home-card" +
                              (drag?.postId === id && drag.gridId === grid.id
                                ? " is-dragging"
                                : "")
                            }
                            onDragOver={(e) => {
                              if (drag) e.preventDefault();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (drag)
                                move(drag.gridId, drag.postId, grid.id, index);
                            }}
                          >
                            <button
                              className="admin-home-drag"
                              draggable
                              aria-label={`Arrastar ${post?.title || id}`}
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", id);
                                setDrag({ gridId: grid.id, postId: id });
                              }}
                              onDragEnd={() => setDrag(undefined)}
                            >
                              <GripVertical size={18} />
                              Posição {index + 1}
                            </button>
                            {post?.image && (
                              <img
                                src={post.image.url}
                                alt={post.image.alt}
                                loading="lazy"
                                width={300}
                                height={180}
                              />
                            )}
                            <small>{post?.category}</small>
                            <h3>{post?.title || `Post indisponível: ${id}`}</h3>
                            {!post && (
                              <p className="admin-help">
                                Remova ou substitua este post para salvar.
                              </p>
                            )}
                            <Field
                              label={`Post da posição ${index + 1}, grade ${gridIndex + 1}`}
                            >
                              <select
                                value={id}
                                onChange={(e) =>
                                  changeGrid(grid.id, {
                                    postIds: grid.postIds.map((p) =>
                                      p === id ? e.target.value : p,
                                    ),
                                  })
                                }
                              >
                                <option value={id}>{post?.title || id}</option>
                                {data.posts
                                  .filter(
                                    (p) =>
                                      !grid.postIds.includes(p.id) &&
                                      `${p.title} ${p.category}`
                                        .toLocaleLowerCase("pt-BR")
                                        .includes(
                                          query.toLocaleLowerCase("pt-BR"),
                                        ),
                                  )
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.title}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                            <div className="admin-home-actions">
                              <button
                                className="admin-button secondary"
                                aria-label={`Subir ${post?.title || id}`}
                                disabled={index === 0}
                                onClick={() =>
                                  move(grid.id, id, grid.id, index - 1)
                                }
                              >
                                <ArrowUp size={16} />
                              </button>
                              <button
                                className="admin-button secondary"
                                aria-label={`Descer ${post?.title || id}`}
                                disabled={index === grid.postIds.length - 1}
                                onClick={() =>
                                  move(grid.id, id, grid.id, index + 1)
                                }
                              >
                                <ArrowDown size={16} />
                              </button>
                              <button
                                className="admin-button secondary"
                                aria-label={`Remover ${post?.title || id} da grade`}
                                onClick={() =>
                                  changeGrid(grid.id, {
                                    postIds: grid.postIds.filter(
                                      (p) => p !== id,
                                    ),
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            {layout.grids.length > 1 && (
                              <Field
                                label={`Mover ${post?.title || id} para outra grade`}
                              >
                                <select
                                  value=""
                                  onChange={(e) =>
                                    move(
                                      grid.id,
                                      id,
                                      e.target.value,
                                      layout.grids.find(
                                        (g) => g.id === e.target.value,
                                      )!.postIds.length,
                                    )
                                  }
                                >
                                  <option value="">Selecionar grade</option>
                                  {layout.grids
                                    .filter(
                                      (g) =>
                                        g.id !== grid.id &&
                                        (!g.mode || g.mode === "manual"),
                                    )
                                    .map((g) => (
                                      <option
                                        key={g.id}
                                        value={g.id}
                                        disabled={
                                          g.postIds.includes(id) ||
                                          g.postIds.length >= g.columns * g.rows
                                        }
                                      >
                                        {g.title}
                                      </option>
                                    ))}
                                </select>
                              </Field>
                            )}
                            {post && (
                              <div className="admin-home-actions">
                                <a
                                  href={post.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Ver artigo
                                </a>
                                {edit && (
                                  <a
                                    href={`/gm-admin/posts?edit=${encodeURIComponent(id)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Editar post
                                  </a>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                      {grid.postIds.length < grid.columns * grid.rows && (
                        <div
                          className="admin-home-add"
                          onDragOver={(e) => {
                            if (drag) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (drag)
                              move(
                                drag.gridId,
                                drag.postId,
                                grid.id,
                                grid.postIds.length,
                              );
                          }}
                        >
                          <Field
                            label={`Adicionar post à grade ${gridIndex + 1}`}
                          >
                            <select
                              value={selected[grid.id] || ""}
                              onChange={(e) =>
                                setSelected({
                                  ...selected,
                                  [grid.id]: e.target.value,
                                })
                              }
                            >
                              <option value="">
                                Selecionar post publicado
                              </option>
                              {data.posts
                                .filter(
                                  (p) =>
                                    !grid.postIds.includes(p.id) &&
                                    `${p.title} ${p.category}`
                                      .toLocaleLowerCase("pt-BR")
                                      .includes(
                                        query.toLocaleLowerCase("pt-BR"),
                                      ),
                                )
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.title}
                                  </option>
                                ))}
                            </select>
                          </Field>
                          <button
                            className="admin-button secondary"
                            disabled={
                              !selected[grid.id] ||
                              grid.postIds.includes(selected[grid.id])
                            }
                            onClick={() => {
                              changeGrid(grid.id, {
                                postIds: [...grid.postIds, selected[grid.id]],
                              });
                              setSelected({ ...selected, [grid.id]: "" });
                            }}
                          >
                            <Plus size={18} />
                            Adicionar post
                          </button>
                          <p className="admin-help">
                            Ou arraste um post de outra grade para cá.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </Panel>
              ))}
              <div className="admin-home-actions">
                <Field label="Tipo da nova grade">
                  <select
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as HomeGridMode)}
                    disabled={layout.grids.length >= 8}
                  >
                    {Object.entries(homeGridModes).map(([mode, label]) => (
                      <option key={mode} value={mode}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  className="admin-button secondary"
                  disabled={layout.grids.length >= 8}
                  onClick={() =>
                    setLayout({
                      ...layout,
                      grids: [
                        ...layout.grids,
                        {
                          columns: 3,
                          rows: 2,
                          postIds: [],
                          id: crypto.randomUUID(),
                          title: "Nova grade",
                          eyebrow: "",
                          mode: newMode,
                        },
                      ],
                    })
                  }
                >
                  <Plus size={18} />
                  Adicionar grade
                </button>
              </div>
              {!layout.grids.length && (
                <p className="admin-help">
                  A Home ficará sem grades de artigos. Adicione uma grade para
                  exibir posts.
                </p>
              )}
            </fieldset>
            {removing && (
              <Confirm
                title="Remover grade da Home?"
                confirmLabel="Remover grade"
                onClose={() => setRemoving(undefined)}
                onConfirm={() => {
                  setLayout({
                    ...layout,
                    grids: layout.grids.filter((g) => g.id !== removing),
                  });
                  setRemoving(undefined);
                }}
              >
                <p>
                  Os artigos continuarão no blog. A remoção será aplicada à Home
                  quando você salvar.
                </p>
              </Confirm>
            )}
          </>
        )
      )}
    </>
  );
}
