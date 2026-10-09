import { pages } from "../../shared/site.js";
import { categoryUrl, type ContentCatalog } from "../content/catalog.js";
export interface PublicRoute {
  path: string;
  label: string;
  type: string;
  indexable: boolean;
  lastmod?: string;
  categoryId?: string;
  postId?: string;
}
export const excludedRoutes = {
  "/blog/busca/":
    "Busca individual de produtos do blog; noindex e fora do sitemap.",
  "/api/*": "API e buscas individuais não são páginas editoriais.",
  "/robots.txt": "Arquivo técnico, não integra mapas de páginas.",
  "/sitemap.xml": "Arquivo técnico gerado a partir do manifesto.",
  "/sitemaps/*": "Sitemaps técnicos segmentados, fora do mapa de páginas.",
  "/index.html": "Redirect para a home.",
  "/blog.html": "Template interno, sem acesso HTTP direto.",
  "/admin.html": "Template administrativo interno.",
  "/gm-admin*": "Administração autenticada, nunca indexável.",
  "/:redirect-alias":
    "Aliases de redirecionamento não integram o catálogo de páginas.",
  "?relatedPage": "Paginação auxiliar de artigos relacionados, noindex.",
};
export function publicManifest(catalog: ContentCatalog): PublicRoute[] {
  const routes: PublicRoute[] = Object.entries(pages).map(([path, info]) => ({
    path,
    label: info.label,
    type: path === "/blog/" ? "blog" : "page",
    indexable:
      path !== "/blog/" ||
      catalog.summaries.some((p) => p.status === "published"),
  }));
  for (const category of catalog.listCategories())
    routes.push({
      path: categoryUrl(category.slug),
      label: category.name,
      type: "category",
      categoryId: category.id,
      indexable: catalog.summaries.some(
        (p) => p.categoryId === category.id && p.status === "published",
      ),
    });
  for (const post of catalog.summaries)
    routes.push({
      path: post.url,
      label: post.title,
      type: "post",
      categoryId: post.categoryId,
      postId: post.id,
      indexable:
        post.status === "published" &&
        catalog.registries.categories.find(
          (category) => category.id === post.categoryId,
        )?.status !== "inactive",
      lastmod: post.updatedAt,
    });
  for (const categoryId of [
    undefined,
    ...catalog.listCategories().map((c) => c.id),
  ]) {
    const listing = catalog.listPosts(categoryId);
    const base = categoryId
      ? categoryUrl(
          catalog.registries.categories.find((c) => c.id === categoryId)!.slug,
        )
      : "/blog/";
    for (
      let page = 2;
      page <= Math.ceil(listing.total / catalog.pageSize);
      page++
    )
      routes.push({
        path: `${base}?page=${page}`,
        label: `${categoryId ? catalog.registries.categories.find((c) => c.id === categoryId)!.name : "Blog"} — Página ${page}`,
        type: "pagination",
        categoryId,
        indexable: catalog
          .listPosts(categoryId, page)
          .items.every((p) => p.status === "published"),
      });
  }
  return routes;
}
