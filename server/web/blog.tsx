import { blogSearchPage } from "./blog-search.js";
import { renderToStaticMarkup } from "react-dom/server";
import type { Request } from "express";
import { pages, type PageInfo } from "../../shared/site.js";
import {
  BlogShell,
  BlogCTA,
  Breadcrumbs,
  CategoryNavigation,
  Pagination,
  PostCard,
} from "../../src/components/blog/BlogTemplates.js";
import { categoryUrl, ContentCatalog } from "../content/catalog.js";
import { renderMarkdown } from "../content/markdown.js";
import type { Breadcrumb, Post } from "../content/schema.js";
import { publicManifest } from "./manifest.js";
import type { ReactNode } from "react";
import { BlogOfferAlert } from "../../src/components/blog/BlogOfferAlert.js";

export interface EditorialPage {
  info: PageInfo;
  canonicalPath: string;
  breadcrumbs: Breadcrumb[];
  html: string;
  indexable: boolean;
  post?: Post;
}
export function removedPage(): EditorialPage {
  return {
    info: {
      title: "Conteúdo retirado | Geek Musical",
      description:
        "Esta publicação foi retirada do acervo público do Geek Musical. Explore os guias disponíveis ou descreva o produto que procura.",
      label: "Conteúdo retirado",
    },
    canonicalPath: "/__removed/",
    breadcrumbs: [],
    indexable: false,
    html: renderToStaticMarkup(
      <BlogShell preview={false}>
        <header className="blog-heading">
          <span className="eyebrow">GEEK MUSICAL</span>
          <h1>Esta publicação foi retirada</h1>
          <p className="blog-intro">
            O conteúdo deste endereço não está mais disponível.
          </p>
          <a href="/blog/">Explorar os guias disponíveis</a>
          <p>
            <a href="/blog/">Explorar artigos musicais</a>
          </p>
        </header>
      </BlogShell>,
    ),
  };
}
const formattedDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
export function editorialPage(
  req: Pick<Request, "path" | "originalUrl">,
  catalog: ContentCatalog,
): EditorialPage | undefined {
  if (req.path === "/blog/busca/")
    return blogSearchPage(req.originalUrl, catalog);
  const PAGE_SIZE = catalog.pageSize;
  const parameters = new URL(req.originalUrl, "https://local.invalid")
    .searchParams;
  const pageValue = parameters.get("page") || "1";
  const relatedValue = parameters.get("relatedPage") || "1";
  if (!/^[1-9]\d{0,5}$/.test(pageValue) || !/^[1-9]\d{0,5}$/.test(relatedValue))
    return undefined;
  const page = Number(pageValue);
  const relatedPage = Number(relatedValue);
  const category = catalog
    .listCategories()
    .find((c) => categoryUrl(c.slug) === req.path);
  const post = catalog.findPost(req.path);
  const map = req.path === "/mapa-do-site/";
  const blog = req.path === "/blog/";
  if (!category && !post && !map && !blog) return undefined;
  if ((!blog && !category && page !== 1) || (!post && relatedPage !== 1))
    return undefined;
  const crumbs = map
    ? [
        { label: "Início", url: "/" },
        { label: "Mapa do Site", url: req.path },
      ]
    : catalog.breadcrumbs(req.path);
  let info = pages[req.path];
  let content: ReactNode;
  let indexable = false;
  if (post) {
    const category = catalog.registries.categories.find(
      (c) => c.id === post.categoryId,
    )!;
    const author = catalog.registries.authors.find(
      (a) => a.id === post.authorId,
    )!;
    const reviewer =
      post.reviewerId &&
      catalog.registries.authors.find((a) => a.id === post.reviewerId);
    const markdown = renderMarkdown(
      post,
      (id) => catalog.resolvePost(id),
      (id) => catalog.resolveProduct(id),
    );
    const alert = post.id.startsWith("AUTO-")
      ? ""
      : renderToStaticMarkup(<BlogOfferAlert />);
    const firstHeading = markdown.html.search(/<h2\b/);
    const articleHtml =
      firstHeading < 0
        ? alert + markdown.html
        : markdown.html.slice(0, firstHeading) +
          alert +
          markdown.html.slice(firstHeading);
    const summary = catalog.summaries.find((p) => p.id === post.id)!;
    const otherPosts = catalog.summaries.filter(
      (p) => p.categoryId === category.id && p.id !== post.id,
    );
    const categoryPosts = {
      items: otherPosts.slice(
        (relatedPage - 1) * PAGE_SIZE,
        relatedPage * PAGE_SIZE,
      ),
      pages: Math.max(1, Math.ceil(otherPosts.length / PAGE_SIZE)),
    };
    if (
      (post.kind !== "pillar" && relatedPage !== 1) ||
      relatedPage > categoryPosts.pages
    )
      return undefined;
    info = {
      title: `${post.seoTitle} | Geek Musical`,
      description: post.seoDescription,
      label: post.title,
    };
    indexable = post.status === "published" && relatedPage === 1;
    content = (
      <>
        <header className="blog-heading">
          <span className="eyebrow">
            {category.name} ·{" "}
            {
              (
                {
                  review: "Review",
                  ranking: "Ranking",
                  guide: "Guia",
                  tutorial: "Tutorial",
                } as const
              )[post.editorialFormat || "guide"]
            }
          </span>
          <h1>{post.title}</h1>
          <p className="blog-intro">{post.excerpt}</p>
          <div className="blog-byline">
            <span>
              Por <strong>{author.name}</strong>
            </span>
            <span>{summary.readingMinutes} min de leitura</span>
            <span>
              {post.publishedAt ? (
                <>
                  Publicado em{" "}
                  <time dateTime={post.publishedAt}>
                    {formattedDate(post.publishedAt)}
                  </time>
                </>
              ) : (
                <>
                  Criado em{" "}
                  <time dateTime={post.createdAt}>
                    {formattedDate(post.createdAt)}
                  </time>{" "}
                  · {post.status === "draft" ? "rascunho" : "em revisão"}
                </>
              )}
            </span>
            {post.updatedAt > (post.publishedAt || post.createdAt) && (
              <span>
                Atualizado em{" "}
                <time dateTime={post.updatedAt}>
                  {formattedDate(post.updatedAt)}
                </time>
              </span>
            )}
            {reviewer && <span>Revisão: {reviewer.name}</span>}
          </div>
        </header>
        {post.coverImage && (
          <figure className="blog-cover">
            <img
              src={post.coverImage.path}
              alt={post.coverImage.alt}
              width={post.coverImage.width}
              height={post.coverImage.height}
            />
            {post.coverImage.credit && (
              <figcaption>
                {post.coverImage.credit}
                {post.coverImage.license && ` · ${post.coverImage.license}`}
              </figcaption>
            )}
          </figure>
        )}
        <div className="blog-reading-layout">
          <nav className="document-toc blog-toc" aria-label="Sumário do artigo">
            <strong>Neste guia</strong>
            {markdown.headings
              .filter((h) => h.depth === 2)
              .map((h) => (
                <a key={h.id} href={`#${h.id}`}>
                  {h.text}
                </a>
              ))}
            {post.sources.length > 0 && (
              <a href="#fontes">Fontes consultadas</a>
            )}
          </nav>
          <div>
            <article
              className="editorial-body"
              dangerouslySetInnerHTML={{ __html: articleHtml }}
            />
            {post.sources.length > 0 && (
              <section className="blog-sources" id="fontes">
                <h2>Fontes consultadas</h2>
                <ul>
                  {post.sources.map((s) => (
                    <li key={s.id}>
                      <a href={s.url}>{s.title}</a>
                      <span>
                        {" "}
                        · consulta em{" "}
                        <time dateTime={s.accessedAt}>
                          {formattedDate(s.accessedAt)}
                        </time>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
        {post.kind === "pillar" && (
          <section className="blog-section" id="artigos-da-categoria">
            <h2>Continue pelos guias de {category.name.toLowerCase()}</h2>
            <p>Explore as decisões específicas desta categoria.</p>
            <div className="blog-grid">
              {categoryPosts.items
                .filter((p) => p.id !== post.id)
                .map((p) => (
                  <PostCard key={p.id} post={p} category={category} />
                ))}
            </div>
            <Pagination
              base={summary.url}
              page={relatedPage}
              pages={categoryPosts.pages}
              parameter="relatedPage"
              anchor="#artigos-da-categoria"
            />
          </section>
        )}
        {catalog.relatedPosts(post).length > 0 && (
          <section className="blog-section">
            <h2>Leituras relacionadas</h2>
            <ul className="blog-related">
              {catalog.relatedPosts(post).map((p) => (
                <li key={p.id}>
                  <a href={p.url}>{p.title}</a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <BlogCTA
          cta={catalog.registries.ctas.find((c) => c.id === post.ctaKey)!}
          text={post.ctaText}
        />
      </>
    );
  } else if (map) {
    const routes = publicManifest(catalog);
    content = (
      <>
        <header className="blog-heading">
          <span className="eyebrow">ENCONTRE SEU CAMINHO</span>
          <h1>Mapa do Site</h1>
          <p className="blog-intro">
            Acesse a busca, conheça o Geek Musical e explore os guias por
            categoria.
          </p>
        </header>
        <section className="blog-section">
          <h2>Busca e informações do Geek Musical</h2>
          <ul className="blog-related">
            {routes
              .filter(
                (r) =>
                  r.type === "page" ||
                  r.type === "blog" ||
                  (r.type === "pagination" && !r.categoryId),
              )
              .map((r) => (
                <li key={r.path}>
                  <a href={r.path}>{r.label}</a>
                </li>
              ))}
          </ul>
        </section>
        {catalog.listCategories().map((c) => (
          <section className="blog-section" key={c.id}>
            <h2>
              <a href={categoryUrl(c.slug)}>{c.name}</a>
            </h2>
            <p>{c.description}</p>
            <ul className="blog-related">
              {routes
                .filter(
                  (r) =>
                    (r.type === "post" || r.type === "pagination") &&
                    r.categoryId === c.id,
                )
                .map((r) => (
                  <li key={r.path}>
                    <a href={r.path}>{r.label}</a>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </>
    );
    indexable = true;
  } else {
    const listing = catalog.listPosts(category?.id, page);
    if (page > listing.pages) return undefined;
    const pillar =
      category && catalog.summaries.find((p) => p.id === category.pillarPostId);
    info = category
      ? {
          title: `${category.seoTitle} | Geek Musical`,
          description: category.seoDescription,
          label: category.name,
        }
      : pages["/blog/"];
    if (page > 1) info = { ...info, title: `${info.title} — Página ${page}` };
    indexable =
      listing.items.length > 0 &&
      listing.items.every((p) => p.status === "published");
    content = (
      <>
        <header className="blog-heading">
          <span className="eyebrow">ESCOLHAS COM MAIS CLAREZA</span>
          <h1>
            {category
              ? `Guias de ${category.name.toLowerCase()}`
              : "Entenda antes de comprar"}
          </h1>
          <p className="blog-intro">
            {category?.description ||
              "Da primeira dúvida aos detalhes que fazem diferença: guias para entender recursos, avaliar limites e escolher produtos de acordo com sua rotina e seu orçamento."}
          </p>
          <CategoryNavigation categories={catalog.listCategories()} />
        </header>
        {pillar && page === 1 && (
          <section className="blog-section">
            <h2>Comece pelo guia completo</h2>
            <PostCard post={pillar} category={category!} featured />
          </section>
        )}
        {!category && page === 1 && catalog.summaries.length > 0 && (
          <section className="blog-section">
            <h2>Um ponto de partida para cada escolha</h2>
            <div className="blog-grid">
              {catalog.summaries
                .filter((p) => p.kind === "pillar")
                .map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    category={catalog.registries.categories.find(
                      (c) => c.id === p.categoryId,
                    )!}
                  />
                ))}
            </div>
          </section>
        )}
        <section className="blog-section">
          <h2>
            {category
              ? "Todos os artigos da categoria"
              : `Explore os artigos${page > 1 ? ` — página ${page}` : ""}`}
          </h2>
          {listing.total ? (
            <>
              <p>
                {listing.total} artigos para consultar
                {catalog.preview ? " nesta prévia editorial" : ""}.
              </p>
              <div className="blog-grid">
                {listing.items.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    category={catalog.registries.categories.find(
                      (c) => c.id === p.categoryId,
                    )!}
                  />
                ))}
              </div>
              <Pagination base={req.path} page={page} pages={listing.pages} />
            </>
          ) : (
            <p>
              Os guias estão em preparação editorial. Enquanto isso, descreva
              sua necessidade na busca de produtos.
            </p>
          )}
        </section>
        {category ? (
          <BlogCTA
            cta={catalog.registries.ctas.find((c) => c.id === category.ctaKey)!}
          />
        ) : (
          <aside className="blog-editorial-note">
            <h2>Como produzimos nossos guias</h2>
            <p>
              Daniel Lima é autor e criador do Geek Musical. Esta coleção foi
              preparada com nossa curadoria especializada e consulta à
              documentação técnica.
            </p>
            <a href="/blog/">Explorar artigos musicais →</a>
          </aside>
        )}
      </>
    );
  }
  return {
    info,
    canonicalPath: `${req.path}${page > 1 ? `?page=${page}` : ""}${relatedPage > 1 ? `?relatedPage=${relatedPage}` : ""}`,
    breadcrumbs: crumbs,
    html: renderToStaticMarkup(
      <BlogShell preview={catalog.preview}>
        <Breadcrumbs items={crumbs} />
        {content}
      </BlogShell>,
    ),
    indexable,
    post,
  };
}
