import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { EditorialHome } from "../../src/components/EditorialHome.js";
import InstitutionalPage from "../../src/pages/InstitutionalPage.js";
import type { Express } from "express";
import { pages } from "../../shared/site.js";
import { config, type WebConfig } from "../config.js";
import {
  isPublicRequest,
  noScriptContent,
  renderHead,
  robotsPolicy,
} from "./seo.js";
import { editorialPage, removedPage } from "./blog.js";
import type { LegacyManifest } from "../../shared/legacy.js";
import { ContentCatalog, readSourceContent } from "../content/catalog.js";
import { previewAllowed, previewEnabled } from "../content/environment.js";
import { sitemapDocuments, sitemapPaths } from "./sitemaps.js";
import { analyticsConfig, collectionEnabled } from "../analytics/config.js";
import { homeGrids } from "../content/discovery.js";
import type { HomeLayout, HomePopularity } from "../../shared/home-editor.js";

export function mountPages(
  app: Express,
  getTemplate: () => Promise<string>,
  web: WebConfig = config.web,
  transform?: (url: string, html: string) => Promise<string>,
  content?: ContentCatalog | (() => ContentCatalog),
  getEditorialTemplate?: () => Promise<string>,
  themeCss = false,
  legacy: LegacyManifest = { version: 1, routes: [], media: [] },
  comparisonExists?: (id: string) => boolean,
  getHomeLayout?: () => HomeLayout | null,
  getHomePopularity?: () => HomePopularity,
) {
  const analytics = analyticsConfig();
  const initial =
    content ||
    (() => {
      const data = readSourceContent();
      return new ContentCatalog(
        data.registries,
        data.posts,
        previewEnabled(web),
      );
    })();
  let previous: ContentCatalog | undefined;
  let publicContent: ContentCatalog;
  const catalogs = () => {
    const source = typeof initial === "function" ? initial() : initial;
    if (source !== previous) {
      publicContent = new ContentCatalog(
        source.registries,
        source.summaries.map((p) => source.getPost(p.id)!),
        false,
        source.pageSize,
      );
      previous = source;
    }
    publicContent.offerResolver = source.offerResolver;
    return { source, publicContent };
  };
  const catalogFor = (req: Parameters<typeof previewAllowed>[0]) => {
    const pair = catalogs();
    return previewAllowed(req, web) &&
      !!req.res?.locals.adminPreviewAuthenticated
      ? pair.source
      : pair.publicContent;
  };
  app.get("/blog.html", (_req, res) =>
    res.status(404).type("text/plain").send("Página não encontrada."),
  );
  app.get("/robots.txt", (req, res) => {
    res
      .type("text/plain")
      .set("Cache-Control", "no-store")
      .send(
        `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /gm-admin\nDisallow: /gm-admin-login\n${isPublicRequest(req, web) ? `Sitemap: ${web.siteUrl}/sitemap.xml\n` : ""}`,
      );
  });
  app.get(
    [
      "/sitemap.xml",
      "/sitemap_index.xml",
      "/post-sitemap.xml",
      "/page-sitemap.xml",
      "/category-sitemap.xml",
      ...sitemapPaths,
    ],
    (req, res) => {
      res
        .type("application/xml")
        .set("Cache-Control", "no-store")
        .set("X-Robots-Tag", "noindex")
        .send(
          sitemapDocuments(
            catalogs().publicContent,
            web.siteUrl,
            isPublicRequest(req, web),
          ).find(
            (document) =>
              document.path ===
                (
                  {
                    "/sitemap_index.xml": "/sitemap.xml",
                    "/post-sitemap.xml": "/sitemaps/posts.xml",
                    "/page-sitemap.xml": "/sitemaps/pages.xml",
                    "/category-sitemap.xml": "/sitemaps/categories.xml",
                  } as Record<string, string>
                )[req.path] || document.path === req.path,
          )!.xml,
        );
    },
  );
  app.get("/{*path}", async (req, res, next) => {
    try {
      const catalog = catalogFor(req);
      const comparisonId = /^\/comparativos\/([a-f0-9]{64})\/?$/.exec(
        req.path,
      )?.[1];
      const comparison = !!comparisonId && !!comparisonExists?.(comparisonId);
      const { source, publicContent } = catalogs();
      const legacyRoute = legacy.routes.find(
        (r) => r.path.replace(/\/+$/, "") === req.path.replace(/\/+$/, ""),
      );
      if (legacyRoute?.destination) {
        const query =
          legacyRoute.forwardQuery && req.originalUrl.includes("?")
            ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
            : "";
        res
          .set("Cache-Control", "no-store")
          .redirect(
            legacyRoute.status,
            legacyRoute.destination +
              (query
                ? legacyRoute.destination.includes("?")
                  ? "&" + query.slice(1)
                  : query
                : ""),
          );
        return;
      }
      const retired = legacyRoute?.status === 410;
      const editorialRoute =
        req.path === "/mapa-do-site/" ||
        req.path.startsWith("/blog/") ||
        !!catalog.findPost(req.path);
      const normalized = req.path.replace(/\/+$/, "") + "/";
      const query = req.originalUrl.includes("?")
        ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
        : "";
      const redirect = source.registries.redirects[req.path];
      if (
        redirect &&
        (publicContent.findPost(redirect) ||
          publicContent
            .listCategories()
            .some((category) => `/blog/${category.slug}/` === redirect))
      ) {
        res.redirect(308, redirect + query);
        return;
      }
      if (
        req.path !== "/" &&
        !req.path.endsWith("/") &&
        (pages[normalized] ||
          editorialPage(
            { path: normalized, originalUrl: normalized + query },
            catalog,
          ))
      ) {
        res.redirect(308, normalized + query);
        return;
      }
      const editorial = retired
        ? removedPage()
        : editorialRoute
          ? editorialPage(req, catalog)
          : undefined;
      const exists =
        !retired &&
        (comparison || (editorialRoute ? !!editorial : !!pages[req.path]));
      const parameters = new URL(req.originalUrl, "https://local.invalid")
        .searchParams;
      const validParameters =
        [...parameters.keys()].every((key) => key === "page") &&
        parameters.getAll("page").length <= 1;
      const robots = comparison
        ? "noindex, nofollow"
        : editorial
          ? isPublicRequest(req, web) && editorial.indexable && validParameters
            ? "index, follow, max-image-preview:large"
            : "noindex, follow"
          : exists
            ? robotsPolicy(req, web)
            : "noindex, nofollow";
      const base =
        editorial && getEditorialTemplate
          ? await getEditorialTemplate()
          : await getTemplate();
      let html = base.replace(
        /<!--seo:start-->[\s\S]*?<!--seo:end-->/,
        renderHead(
          exists ? req.path : "/__not-found/",
          robots,
          res.locals.nonce,
          web,
          editorial,
          editorial?.post
            ? catalog.registries.authors.find(
                (a) => a.id === editorial.post!.authorId,
              )
            : undefined,
          comparison
            ? {
                title: "Comparativo de produtos | Geek Musical",
                description:
                  "Compare características, fontes e ofertas dos produtos selecionados no Geek Musical.",
                label: "Comparativo de produtos",
              }
            : undefined,
        ),
      );
      if (editorial) {
        html = html.includes("<!--editorial-->")
          ? html.replace("<!--editorial-->", editorial.html)
          : html
              .replace('<div id="root"></div>', editorial.html)
              .replace("/main.tsx", "/editorial.tsx");
        html = html.replace("<!--noscript-->", "");
      } else
        html = html.replace(
          "<!--noscript-->",
          comparison
            ? '<noscript><main><h1>Comparativo de produtos</h1><p>Ative o JavaScript para consultar características, fontes e ofertas. Nenhuma análise paga é disparada ao abrir esta página.</p><a href="/">Geek Musical</a></main></noscript>'
            : noScriptContent(exists ? req.path : "/__not-found/"),
        );
      if (!editorial) {
        const rendered =
          req.path === "/" && exists
            ? renderToStaticMarkup(
                createElement(EditorialHome, {
                  catalog: publicContent,
                  grids: homeGrids(publicContent, getHomeLayout?.()),
                }),
              )
            : renderToStaticMarkup(
                createElement(InstitutionalPage, {
                  pathname: exists ? req.path : "/__not-found/",
                }),
              );
        html = html
          .replace("<!--editorial-->", rendered)
          .replace("<!--noscript-->", "");
      }
      if (transform) html = await transform(req.originalUrl, html);
      if (req.path === "/" && exists) {
        const layout = getHomeLayout?.();
        const grids = homeGrids(
          publicContent,
          layout,
          layout?.grids.some((g) => g.mode === "popular")
            ? getHomePopularity?.()
            : undefined,
        );
        const cards = JSON.stringify(
          grids.flatMap((g) => g.cards).slice(0, 6),
        ).replaceAll("<", "\\u003c");
        html = html.replace(
          "</head>",
          `<script type="application/json" id="gm-home-content" nonce="${res.locals.nonce}">${cards}</script><script type="application/json" id="gm-home-layout" nonce="${res.locals.nonce}">${JSON.stringify(grids).replaceAll("<", "\\u003c")}</script></head>`,
        );
      }
      if (themeCss)
        html = html.replace(
          "</head>",
          '<link rel="stylesheet" href="/portal-theme.css"></head>',
        );
      if (exists) {
        const path = req.path;
        const category =
          editorial?.post?.categoryId ||
          catalog.registries.categories.find(
            (category) => path === `/blog/${category.slug}/`,
          )?.id;
        const publicConfig = JSON.stringify({
          enabled:
            collectionEnabled(web, analytics) &&
            isPublicRequest(req, web) &&
            validParameters &&
            !parameters.size &&
            !comparison,
          measurementId: analytics.measurementId,
          canonical: web.siteUrl + path,
          path,
          type: editorial?.post
            ? "post"
            : category
              ? "category"
              : path === "/"
                ? "home"
                : path === "/blog/"
                  ? "blog"
                  : "page",
          ...(category ? { category } : {}),
          ...(editorial?.post ? { postId: editorial.post.id } : {}),
        }).replaceAll("<", "\\u003c");
        html = html.replace(
          "</head>",
          `<script type="application/json" id="gm-analytics-config" nonce="${res.locals.nonce}">${publicConfig}</script></head>`,
        );
      }
      res
        .status(retired ? 410 : exists ? 200 : 404)
        .set("Cache-Control", "no-store")
        .set("X-Robots-Tag", robots)
        .type("html")
        .send(html);
    } catch (error) {
      next(error);
    }
  });
}
