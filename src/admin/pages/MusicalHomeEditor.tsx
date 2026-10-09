import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Save } from "lucide-react";
import type {
  HomeEditorData,
  HomeLayout,
} from "../../../shared/home-editor.js";
import { api } from "../api.js";
import {
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
  const task = useTask();
  useEffect(() => {
    if (data) setLayout(data.layout);
  }, [data]);
  const featured = layout?.grids[0];
  const dirty =
    !!data && JSON.stringify(data.layout) !== JSON.stringify(layout);
  function change(index: number, id: string) {
    if (!layout || !featured) return;
    const ids = [...featured.postIds];
    ids[index] = id;
    setLayout({
      ...layout,
      grids: [{ ...featured, postIds: ids }, layout.grids[1]],
    });
  }
  function move(index: number, direction: -1 | 1) {
    if (
      !layout ||
      !featured ||
      index + direction < 0 ||
      index + direction >= featured.postIds.length
    )
      return;
    const ids = [...featured.postIds];
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    setLayout({
      ...layout,
      grids: [{ ...featured, postIds: ids }, layout.grids[1]],
    });
  }
  return (
    <>
      <PageHeading
        title="Destaques da Home"
        description="Selecione e ordene nove artigos. Os três recentes seguem a data original de publicação."
      />
      <Notice error={error || task.error} success={task.success} />
      {loading ? (
        <Loading />
      ) : (
        data &&
        featured && (
          <>
            {data.posts.length < 9 && (
              <p role="status">
                O acervo tem {data.posts.length} artigos elegíveis. A Home
                mostra somente publicações existentes.
              </p>
            )}
            <Panel title="Nove destaques manuais">
              <ol className="musical-featured-editor">
                {Array.from(
                  { length: Math.min(9, data.posts.length) },
                  (_, index) => (
                    <li key={index}>
                      <label htmlFor={`featured-${index}`}>
                        Posição {index + 1}
                      </label>
                      <select
                        id={`featured-${index}`}
                        value={featured.postIds[index] || ""}
                        onChange={(e) => change(index, e.target.value)}
                      >
                        <option value="">Selecione um artigo</option>
                        {data.posts.map((post) => (
                          <option
                            key={post.id}
                            value={post.id}
                            disabled={
                              featured.postIds.includes(post.id) &&
                              featured.postIds[index] !== post.id
                            }
                          >
                            {post.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="admin-button secondary"
                        aria-label={`Subir posição ${index + 1}`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        className="admin-button secondary"
                        aria-label={`Descer posição ${index + 1}`}
                        disabled={index === featured.postIds.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                    </li>
                  ),
                )}
              </ol>
              <button
                className="admin-button"
                disabled={
                  !dirty || task.busy || featured.postIds.some((id) => !id)
                }
                onClick={() =>
                  void task.run(
                    async () =>
                      setData(
                        await api<HomeEditorData>("/home", {
                          method: "PUT",
                          body: { layout, revision: data.revision },
                        }),
                      ),
                    "Destaques salvos.",
                  )
                }
              >
                <Save size={17} /> Salvar destaques
              </button>
            </Panel>
            <Panel title="Três artigos recentes">
              <p>
                A ordenação usa a data real de publicação; editar um texto não
                altera essa ordem.
              </p>
              <ol>
                {data.resolvedGrids[1]?.cards.map((post) => (
                  <li key={post.id}>{post.title}</li>
                ))}
              </ol>
            </Panel>
          </>
        )
      )}
    </>
  );
}
