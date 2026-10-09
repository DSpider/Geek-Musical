import type { Request } from "express";
import { pages, site, notFoundPage, type PageInfo } from "../../shared/site.js";
import { institutional } from "../../shared/institutional.js";
import type { WebConfig } from "../config.js";
import { environmentOf } from "../content/environment.js";
import { escapeHtml, safeJson } from "./escape.js";
import type { EditorialPage } from "./blog.js";
export { escapeHtml } from "./escape.js";

export function isPublicRequest(req: Request, web: WebConfig) {
  return (
    web.production &&
    web.publicSite &&
    environmentOf(web) === "production" &&
    req.secure &&
    req.headers.host?.toLowerCase() === new URL(web.siteUrl).host
  );
}
export function robotsPolicy(req: Request, web: WebConfig) {
  return isPublicRequest(req, web) &&
    !!pages[req.path] &&
    !req.originalUrl.includes("?")
    ? "index, follow, max-image-preview:large"
    : "noindex, nofollow";
}
export function renderHead(
  pathname: string,
  robots: string,
  nonce: string,
  web: WebConfig,
  editorial?: EditorialPage,
  author?: { id: string; name: string; type: string },
  comparison?: PageInfo,
) {
  const page = comparison || editorial?.info || pages[pathname] || notFoundPage;
  const canonical = editorial
    ? web.siteUrl + editorial.canonicalPath
    : pages[pathname] || comparison
      ? `${web.siteUrl}${pathname}`
      : null;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const image = escapeHtml(
    web.siteUrl + (editorial?.post?.coverImage?.path || "/favicon.png"),
  );
  const graph: { "@context": string; "@graph": Record<string, unknown>[] } = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${web.siteUrl}/#organization`,
        name: site.name,
        url: `${web.siteUrl}/`,
        logo: `${web.siteUrl}/favicon.png`,
        email: site.email,
        ...(site.cnpj ? { taxID: site.cnpj } : {}),
        sameAs: site.social.map((item) => item.url),
      },
      {
        "@type": "WebSite",
        "@id": `${web.siteUrl}/#website`,
        name: site.name,
        url: `${web.siteUrl}/`,
        inLanguage: "pt-BR",
        publisher: { "@id": `${web.siteUrl}/#organization` },
      },
    ],
  };
  if (editorial) {
    graph["@graph"].push({
      "@type": "BreadcrumbList",
      itemListElement: editorial.breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.label,
        item: web.siteUrl + item.url,
      })),
    });
    if (editorial.post && author) {
      const post = editorial.post;
      graph["@graph"].push({
        "@type": "BlogPosting",
        "@id": canonical + "#article",
        headline: post.title,
        description: post.excerpt,
        mainEntityOfPage: canonical,
        url: canonical,
        inLanguage: "pt-BR",
        author: {
          "@type": author.type,
          "@id": `${web.siteUrl}/#author-${author.id}`,
          name: author.name,
        },
        publisher: { "@id": `${web.siteUrl}/#organization` },
        dateCreated: post.createdAt,
        dateModified:
          post.updatedAt === post.origin?.sourceUpdatedAt?.slice(0, 10)
            ? post.origin.sourceUpdatedAt
            : post.updatedAt,
        ...(post.publishedAt
          ? {
              datePublished: post.origin?.sourcePublishedAt || post.publishedAt,
            }
          : {}),
        ...(post.coverImage
          ? {
              image: {
                "@type": "ImageObject",
                url: web.siteUrl + post.coverImage.path,
                width: post.coverImage.width,
                height: post.coverImage.height,
              },
            }
          : {}),
      });
    }
  }
  return `<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="${robots}">
${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ""}
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : ""}
<meta property="og:type" content="${editorial?.post ? "article" : "website"}">
<meta property="og:site_name" content="Geek Musical">
<meta property="og:locale" content="pt_BR">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="${editorial?.post?.coverImage?.width || 300}">
<meta property="og:image:height" content="${editorial?.post?.coverImage?.height || 300}">
<meta property="og:image:alt" content="${escapeHtml(editorial?.post?.coverImage?.alt || "Símbolo oficial do Geek Musical")}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
${pathname === "/" || editorial ? `<script type="application/ld+json" nonce="${nonce}">${safeJson(graph)}</script>` : ""}`;
}
export function noScriptContent(pathname: string) {
  const content = institutional[pathname];
  const page = pages[pathname] || notFoundPage;
  return `<noscript><main class="document-page page-width"><a href="/">Geek Musical</a><h1>${escapeHtml(page.label)}</h1>${content ? `<p>${escapeHtml(content.intro)}</p>${content.sections.map((section) => `<section><h2>${escapeHtml(section.title)}</h2>${section.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}${section.bullets ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}${section.links?.map((link) => `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>`).join("") || ""}</section>`).join("")}` : `<p>${escapeHtml(page.description)}</p><p>Ative o JavaScript para pesquisar por texto ou voz, comparar as opções e acessar os produtos.</p>`}<nav aria-label="Páginas institucionais">${Object.entries(
    pages,
  )
    .map(
      ([url, info]) => `<p><a href="${url}">${escapeHtml(info.label)}</a></p>`,
    )
    .join("")}</nav></main></noscript>`;
}
