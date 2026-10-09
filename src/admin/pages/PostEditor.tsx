import { useEffect, useState, type FormEvent } from "react";
import { Save, ArrowLeft, Eye } from "lucide-react";
import type {
  Post,
  Registries,
  EditorialProduct,
} from "../../../shared/content.js";
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
import { PostCover, PostSources } from "./PostFields.js";
import { PostAffiliateLinks } from "./PostAffiliateLinks.js";
interface PostDetail {
  post: Post;
  registries: Registries;
  revision: string;
  publishedProductIds: string[];
}
export function PostEditor({ id }: { id: string }) {
  const creating = id === "new";
  const { data, error, loading } = useLoad<PostDetail>(
    creating ? "/posts/new" : "/posts/" + encodeURIComponent(id),
  );
  const [post, setPost] = useState<Post>();
  const [revision, setRevision] = useState("");
  const [approve, setApprove] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedId, setSavedId] = useState<string>();
  const [preview, setPreview] = useState<string>();
  const [products, setProducts] = useState<EditorialProduct[]>([]);
  const [changedProducts, setChangedProducts] = useState(new Set<string>());
  const task = useTask();
  const publish = usePermission("posts.publish");
  const update = usePermission(creating ? "posts.create" : "posts.update");
  useEffect(() => {
    if (data) {
      setPost(data.post);
      setRevision(data.revision);
      setProducts(data.registries.products || []);
      setChangedProducts(new Set());
    }
  }, [data]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (savedId && !dirty)
      window.location.replace(
        "/gm-admin/posts?edit=" + encodeURIComponent(savedId),
      );
  }, [savedId, dirty]);
  const change = <K extends keyof Post>(key: K, value: Post[K]) => {
    setPost((previous) => ({ ...previous!, [key]: value }));
    setDirty(true);
  };
  const save = (value: Post, approved = false) =>
    void task.run(
      async () => {
        const result = await api<{
          post: Post;
          revision: string;
          products: EditorialProduct[];
        }>(creating ? "/posts" : "/posts/" + encodeURIComponent(post!.id), {
          method: creating ? "POST" : "PUT",
          body: {
            post: value,
            revision,
            approvePublication: approved,
            products: products.filter((p) => changedProducts.has(p.id)),
          },
        });
        setDirty(false);
        setApprove(false);
        setPost(result.post);
        setProducts(result.products);
        setRevision(result.revision);
        setChangedProducts(new Set());
        if (creating) setSavedId(result.post.id);
      },
      value.status === "published"
        ? "Artigo publicado após confirmação editorial."
        : "Artigo salvo.",
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      post?.status === "published" ||
      data?.publishedProductIds.some((id) => changedProducts.has(id))
    )
      setApprove(true);
    else if (post) save(post);
  };
  if (loading || !post || !data)
    return (
      <>
        <Notice error={error} />
        {!error && <Loading />}
      </>
    );
  const category = data.registries.categories.find(
    (c) => c.id === post.categoryId,
  );
  return (
    <>
      <a className="admin-back" href="/gm-admin/posts">
        <ArrowLeft size={16} />
        Voltar aos posts
      </a>
      <PageHeading
        title={creating ? "Adicionar post" : "Editar post"}
        description={
          post.id +
          " · Criado em " +
          post.createdAt +
          " · Atualizado em " +
          post.updatedAt
        }
      />
      <Notice error={error || task.error} success={task.success} />
      <form onSubmit={submit}>
        <div className="admin-editor-grid">
          <div>
            <Panel title="Conteúdo">
              <Field label="Título">
                <input
                  value={post.title}
                  minLength={12}
                  maxLength={300}
                  required
                  onChange={(e) => change("title", e.target.value)}
                  disabled={!update}
                />
              </Field>
              <Field
                label="Resumo"
                help="Pelo menos 40 caracteres. Uma descrição clara da decisão de compra."
              >
                <textarea
                  value={post.excerpt}
                  minLength={40}
                  maxLength={1000}
                  required
                  rows={3}
                  onChange={(e) => change("excerpt", e.target.value)}
                  disabled={!update}
                />
              </Field>
              <Field
                label="Conteúdo em Markdown"
                help="Use títulos ## e ###. Links internos: [texto](post:ID); fontes: [texto](source:id); ofertas: [Onde encontrar](offers:ID). HTML e imagens inline não são aceitos."
              >
                <textarea
                  className="admin-body-editor"
                  value={post.body}
                  maxLength={200000}
                  rows={22}
                  onChange={(e) => change("body", e.target.value)}
                  disabled={!update}
                />
              </Field>
              <button
                type="button"
                className="admin-button secondary"
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    const result = await api<{ html: string }>(
                      "/posts/preview",
                      {
                        method: "POST",
                        body: {
                          products: products.filter((p) =>
                            changedProducts.has(p.id),
                          ),
                          post: {
                            ...post,
                            status: "draft",
                            publishedAt: undefined,
                          },
                        },
                      },
                    );
                    setPreview(result.html);
                  }, "Prévia gerada; nenhuma alteração salva.")
                }
              >
                <Eye size={18} />
                Prévia do conteúdo
              </button>
              {preview !== undefined && (
                <div
                  className="admin-content-preview"
                  dangerouslySetInnerHTML={{ __html: preview }}
                />
              )}
            </Panel>
            <Panel title="Metadata SEO">
              <Field label="Título SEO">
                <input
                  value={post.seoTitle}
                  minLength={12}
                  maxLength={300}
                  required
                  onChange={(e) => change("seoTitle", e.target.value)}
                  disabled={!update}
                />
              </Field>
              <Field
                label="Descrição SEO"
                help={`${post.seoDescription.length}/200 caracteres. Mínimo 50.`}
              >
                <textarea
                  value={post.seoDescription}
                  minLength={50}
                  maxLength={200}
                  required
                  onChange={(e) => change("seoDescription", e.target.value)}
                  disabled={!update}
                />
              </Field>
            </Panel>
            {!creating && (
              <PostAffiliateLinks
                post={post}
                products={products}
                update={update}
                dirty={dirty}
                changePost={change}
                changeProducts={(next) => {
                  setChangedProducts(
                    (previous) =>
                      new Set([
                        ...previous,
                        ...next
                          .filter(
                            (p) =>
                              JSON.stringify(p) !==
                              JSON.stringify(
                                products.find((old) => old.id === p.id),
                              ),
                          )
                          .map((p) => p.id),
                      ]),
                  );
                  setProducts(next);
                  setDirty(true);
                }}
              />
            )}
            <PostSources post={post} update={update} change={change} />
          </div>
          <aside>
            <Panel title="Publicação">
              <Field label="Template editorial">
                <select
                  value={post.editorialFormat || "guide"}
                  disabled={!update}
                  onChange={(e) =>
                    change(
                      "editorialFormat",
                      e.target.value as Post["editorialFormat"],
                    )
                  }
                >
                  <option value="guide">Guia</option>
                  <option value="review">Review</option>
                  <option value="ranking">Ranking</option>
                  <option value="tutorial">Tutorial</option>
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={post.status}
                  onChange={(e) =>
                    change("status", e.target.value as Post["status"])
                  }
                  disabled={!update}
                >
                  <option value="draft">Rascunho</option>
                  <option value="review">Em revisão</option>
                  <option value="archived">Arquivado</option>
                  {publish && <option value="published">Publicado</option>}
                </select>
              </Field>
              <p className="admin-help">
                Publicação valida texto completo, estrutura, fontes e vínculos.
                Rascunhos aceitam conteúdo em andamento.
              </p>
              <div className="admin-stack-actions">
                {update && (
                  <>
                    <button className="admin-button" disabled={task.busy}>
                      <Save size={18} />
                      {task.busy
                        ? "Salvando…"
                        : post.status === "published"
                          ? "Revisar e publicar"
                          : "Salvar"}
                    </button>
                    <button
                      type="button"
                      className="admin-button secondary"
                      disabled={
                        task.busy ||
                        (!publish && data.post.status === "published")
                      }
                      onClick={() =>
                        save({
                          ...post,
                          status: "draft",
                          publishedAt: undefined,
                        })
                      }
                    >
                      Salvar rascunho
                    </button>
                  </>
                )}
              </div>
            </Panel>
            <Panel title="Organização">
              <Field label="Categoria">
                <select
                  value={post.categoryId}
                  onChange={(e) => {
                    const c = data.registries.categories.find(
                      (c) => c.id === e.target.value,
                    )!;
                    setPost({
                      ...post,
                      categoryId: c.id,
                      ctaKey: c.ctaKey,
                      relatedPostIds: c.pillarPostId
                        ? [
                            ...new Set([
                              ...post.relatedPostIds,
                              c.pillarPostId,
                            ]),
                          ].filter((id) => id !== post.id)
                        : post.relatedPostIds,
                    });
                    setDirty(true);
                  }}
                  disabled={!update}
                >
                  {data.registries.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status === "inactive" ? " (inativa)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Slug"
                help="Alterar uma URL já publicada gera correspondência editorial para o destino novo."
              >
                <input
                  value={post.slug}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={160}
                  required
                  onChange={(e) => change("slug", e.target.value)}
                  disabled={!update}
                />
              </Field>
              <Field label="Tipo">
                <select
                  value={post.kind}
                  onChange={(e) =>
                    change("kind", e.target.value as Post["kind"])
                  }
                  disabled={!update}
                >
                  <option value="supporting">Artigo complementar</option>
                  <option value="pillar">Guia central</option>
                  {post.kind === "legacy" && (
                    <option value="legacy">
                      Artigo preservado do WordPress
                    </option>
                  )}
                </select>
              </Field>
              <Field label="Autor">
                <select
                  value={post.authorId}
                  onChange={(e) => change("authorId", e.target.value)}
                  disabled={!update}
                >
                  {data.registries.authors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="CTA">
                <select
                  value={post.ctaKey}
                  onChange={(e) => change("ctaKey", e.target.value)}
                  disabled={!update}
                >
                  {data.registries.ctas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="admin-help">
                Guia central: {category?.pillarPostId || "ainda não definido"}.
                Gerencie as relações no Link Building.
              </p>
            </Panel>
            <PostCover post={post} update={update} change={change} />
          </aside>
        </div>
      </form>
      {approve && (
        <Confirm
          title={
            post.status === "published"
              ? "Confirmar publicação editorial"
              : "Confirmar ofertas compartilhadas"
          }
          confirmLabel={
            post.status === "published"
              ? "Aprovar e publicar"
              : "Aprovar e salvar"
          }
          onClose={() => setApprove(false)}
          busy={task.busy}
          onConfirm={() => save(post, true)}
        >
          <p>
            {post.status === "published"
              ? "Confirme que revisou este artigo, suas fontes, metadados e informações. Esta ação torna o conteúdo publicado no ambiente atual."
              : "As ofertas alteradas também aparecem em artigos publicados. Confirme que revisou os produtos, suas variantes e os links. O estado editorial deste artigo será preservado."}
          </p>
          <Notice error={task.error} />
        </Confirm>
      )}
    </>
  );
}
