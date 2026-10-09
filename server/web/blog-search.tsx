import { renderToStaticMarkup } from "react-dom/server";
import { Search, ArrowUpRight } from "lucide-react";
import { CategoryArt } from "../../src/components/CategoryArt.js";
import {
  BlogShell,
  Breadcrumbs,
  Pagination,
  PostCard,
} from "../../src/components/blog/BlogTemplates.js";
import { searchBlogProducts } from "../content/discovery.js";
import type { ContentCatalog } from "../content/catalog.js";
import type { EditorialPage } from "./blog.js";

export function blogSearchPage(
  originalUrl: string,
  catalog: ContentCatalog,
): EditorialPage | undefined {
  const params = new URL(originalUrl, "https://local.invalid").searchParams;
  if (
    [...params.keys()].some((key) => !["q", "page"].includes(key)) ||
    params.getAll("q").length > 1 ||
    params.getAll("page").length > 1
  )
    return undefined;
  const query = (params.get("q") || "").trim();
  const pageValue = params.get("page") || "1";
  if (
    query.length > 120 ||
    /[\x00-\x1f]/.test(query) ||
    !/^[1-9]\d{0,5}$/.test(pageValue)
  )
    return undefined;
  const page = Number(pageValue);
  const results = searchBlogProducts(catalog, query, page);
  const terms = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const articles = catalog.summaries.filter(
    (p) =>
      p.status === "published" &&
      terms.length &&
      terms.every((term) =>
        (p.title + " " + p.excerpt + " " + catalog.getPost(p.id)!.body)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(term),
      ),
  );
  const articlePages = Math.max(1, Math.ceil(articles.length / 12));
  const totalPages = Math.max(results.pages, articlePages);
  if (page > totalPages) return undefined;
  const breadcrumbs = [
    { label: "Início", url: "/" },
    { label: "Blog", url: "/blog/" },
    { label: "Buscar produtos", url: "/blog/busca/" },
  ];
  return {
    info: {
      title: "Buscar produtos no blog | Geek Musical",
      label: "Buscar produtos",
      description:
        "Encontre produtos nos artigos do Geek Musical e consulte os guias e as ofertas de cada modelo.",
    },
    canonicalPath: "/blog/busca/",
    breadcrumbs,
    indexable: false,
    html: renderToStaticMarkup(
      <BlogShell preview={false}>
        <Breadcrumbs items={breadcrumbs} />
        <header className="blog-heading">
          <span className="eyebrow">DO BLOG PARA A SUA ESCOLHA</span>
          <h1>Encontre produtos nos nossos artigos</h1>
          <p className="blog-intro">
            Busque por produto, modelo ou categoria e confira os detalhes no
            artigo.
          </p>
          <form
            className="blog-product-search"
            action="/blog/busca/"
            method="get"
            role="search"
          >
            <label className="sr-only" htmlFor="blog-product-query">
              Produto ou modelo
            </label>
            <input
              id="blog-product-query"
              type="search"
              name="q"
              defaultValue={query}
              maxLength={120}
              placeholder="Ex.: sofá, cama box, organização…"
            />
            <button type="submit">
              <Search size={18} />
              <span>Buscar</span>
            </button>
          </form>
        </header>
        {query ? (
          <>
            <p className="blog-search-count" role="status">
              {results.total}{" "}
              {results.total === 1
                ? "produto encontrado"
                : "produtos encontrados"}{" "}
              para <strong>“{query}”</strong>
            </p>
            {results.total ? (
              <div className="blog-product-grid">
                {results.items.map(
                  ({ product, category, art, image, articles }) => (
                    <article className="blog-product-card" key={product.id}>
                      <div className="blog-product-image">
                        {image ? (
                          <img
                            src={image.url}
                            alt={image.alt}
                            loading="lazy"
                            width="320"
                            height="220"
                          />
                        ) : (
                          <CategoryArt kind={art} />
                        )}
                      </div>
                      <span className="eyebrow">{category}</span>
                      <h2>{product.name}</h2>
                      <p>
                        {product.offers.length === 1
                          ? "Oferta em 1 loja"
                          : `Ofertas em ${product.offers.length} lojas`}
                      </p>
                      <a className="blog-product-link" href={articles[0].url}>
                        Ver produto no artigo <ArrowUpRight size={16} />
                      </a>
                      {articles.length > 1 && (
                        <details>
                          <summary>Outros artigos com este produto</summary>
                          <ul>
                            {articles.slice(1).map((article) => (
                              <li key={article.url}>
                                <a href={article.url}>{article.title}</a>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </article>
                  ),
                )}
              </div>
            ) : (
              <div className="blog-search-empty">
                <h2>
                  {articles.length
                    ? "Artigos para ajudar na sua escolha"
                    : "Nenhum produto com esse nome"}
                </h2>
                <p>
                  Tente o nome da marca, o modelo ou uma categoria, como “sofá”.
                </p>
                <a href="/blog/">Explorar os artigos</a>
              </div>
            )}
            {articles.length > 0 && (
              <section aria-label="Artigos encontrados">
                <p>{articles.length} artigos encontrados</p>
                <div className="blog-grid">
                  {articles.slice((page - 1) * 12, page * 12).map((p) => (
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
            <Pagination
              base={"/blog/busca/?q=" + encodeURIComponent(query)}
              page={page}
              pages={totalPages}
            />
          </>
        ) : (
          <div className="blog-search-empty">
            <h2>O que você quer conhecer melhor?</h2>
            <p>
              Digite acima para encontrar os produtos que aparecem nos nossos
              guias.
            </p>
            <a href="/blog/">Ver todos os artigos</a>
          </div>
        )}
      </BlogShell>,
    ),
  };
}
