import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createHash } from "node:crypto";
import {
  convertWordpressPost,
  plainWordpressText,
  type WordpressExport,
  type WordpressPost,
} from "./wordpress-convert.js";
import { postSchema, type Post, type Registries } from "../shared/content.js";
import {
  readSourceContent,
  ContentCatalog,
} from "../server/content/catalog.js";
import { validateLegacyTargets } from "../server/content/legacy.js";
import type { LegacyManifest } from "../shared/legacy.js";
import { pages } from "../shared/site.js";

type OriginalPost = WordpressPost & {
  status: string;
  url: string;
  tags: number[];
};
const data = JSON.parse(
  readFileSync("artifacts/wordpress/export.private.json", "utf8"),
) as Omit<WordpressExport, "posts"> & {
  posts: OriginalPost[];
  pages: OriginalPost[];
  tags: unknown[];
};
const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const reportRoot = process.env.GEEK_MIGRATION_REPORT_ROOT || "docs/migration";
mkdirSync(reportRoot, { recursive: true });
const root = path.resolve(process.env.GEEK_MIGRATION_CONTENT_ROOT || "content");
mkdirSync(path.join(root, "blog"), { recursive: true });
const authors = data.authors.map((a) => ({
  id: `WP-AUTHOR-${a.id}`,
  name: a.name,
  type: "Person" as const,
  description: "Autoria preservada da publicação original no Geek Musical.",
}));
const categories = data.categories.map((c, i) => ({
  id: `WP-CATEGORY-${c.id}`,
  slug: c.slug,
  name: c.name,
  description:
    c.description.length >= 50
      ? c.description
      : `Explore os artigos do Geek Musical sobre ${c.name.toLowerCase()}, com guias e informações sobre instrumentos, equipamentos e aprendizado musical.`,
  seoTitle: `${c.name} | Geek Musical`,
  seoDescription:
    `Explore os artigos do Geek Musical sobre ${c.name.toLowerCase()}, com guias, dicas e informações para facilitar suas escolhas musicais.`.slice(
      0,
      200,
    ),
  ctaKey: "HOME-SEARCH",
  order: i,
  status: "active" as const,
}));
const registries: Registries = {
  authors,
  categories,
  ctas: [
    {
      id: "HOME-SEARCH",
      text: "Continue aprendendo: explore outros artigos sobre instrumentos, equipamentos e música no Geek Musical.",
      label: "Explorar artigos musicais",
    },
  ],
  redirects: {},
  products: [],
};
const published = new Map(
  data.posts
    .filter((p) => p.status === "publish")
    .map((p) => [new URL(p.url).pathname, `WP-POST-${p.id}`]),
);
const knownPaths = new Set([
  ...published.keys(),
  ...Object.keys(pages),
  ...data.pages
    .filter((p) => p.status === "publish")
    .map((p) => new URL(p.url).pathname),
  ...data.categories.map(
    (c) => new URL((c as unknown as { url: string }).url).pathname,
  ),
]);
const affiliateAudit: {
  postId: number;
  original: string;
  destination: string;
  state: string;
}[] = [];
const resolve = (url: string) => {
  try {
    const u = new URL(url, "https://www.geekmusical.com.br");
    if (["geekmusical.com.br", "www.geekmusical.com.br"].includes(u.hostname)) {
      if (published.has(u.pathname)) return `post:${published.get(u.pathname)}`;
      if (knownPaths.has(u.pathname)) return u.pathname;
      // Preserve historical own-domain destinations rather than deleting links.
      return u.href;
    }
    if (u.protocol !== "https:" || u.username || u.password) return undefined;
    return u.href;
  } catch {
    return undefined;
  }
};
const audit: unknown[] = [];
for (const p of data.posts) {
  const conversion = convertWordpressPost(p, data, resolve, true);
  const categoryIds = [
    ...new Set(
      data.relations
        .filter(([pid]) => pid === p.id)
        .map(([, cid]) => `WP-CATEGORY-${cid}`),
    ),
  ];
  const categoryId = categoryIds[0] || categories[0].id;
  const sourcePath =
    p.status === "publish" ? new URL(p.url).pathname : `/rascunho-${p.id}/`;
  const meta = data.metas[String(p.id)] || {};
  const title = plainWordpressText(p.title);
  const excerpt =
    plainWordpressText(p.excerpt) ||
    `${title}. Confira as orientações e os detalhes apresentados neste artigo do Geek Musical.`;
  const seoDescription = plainWordpressText(
    meta.rank_math_description || meta._yoast_wpseo_metadesc || excerpt,
  )
    .replace(/%[^%]+%/g, "")
    .slice(0, 200);
  const post: Post = {
    id: `WP-POST-${p.id}`,
    slug: p.slug || `rascunho-${p.id}`,
    title,
    excerpt: excerpt.slice(0, 1000),
    categoryId,
    categoryIds,
    tagIds: p.tags.map((id) => `WP-TAG-${id}`),
    kind: "legacy",
    editorialFormat: /(?:e-bom|e-boa)$/.test(p.slug)
      ? "review"
      : /^(?:como-|aprenda-)/.test(p.slug)
        ? "tutorial"
        : /(?:melhor|melhores|ranking)/.test(p.slug)
          ? "ranking"
          : "guide",
    canonicalPath: sourcePath,
    origin: {
      system: "wordpress",
      postId: p.id,
      sourcePath,
      sourceHash: p.sourceHash,
      importedAt: "2026-10-08",
      sourcePublishedAt: p.publishedAt.replace(" ", "T") + "-03:00",
      sourceUpdatedAt: p.updatedAt.replace(" ", "T") + "-03:00",
    },
    status:
      p.status === "publish"
        ? "published"
        : p.status === "pending"
          ? "review"
          : "draft",
    authorId: `WP-AUTHOR-${p.authorId}`,
    createdAt: p.publishedAt.slice(0, 10),
    ...(p.status === "publish"
      ? { publishedAt: p.publishedAt.slice(0, 10) }
      : {}),
    updatedAt: p.updatedAt.slice(0, 10),
    seoTitle:
      (meta.rank_math_title || meta._yoast_wpseo_title || title)
        .replace(/%[^%]+%/g, "")
        .trim() || title,
    seoDescription:
      seoDescription.length >= 50 ? seoDescription : excerpt.slice(0, 200),
    relatedPostIds: [],
    ctaKey: "HOME-SEARCH",
    sources: [],
    media: conversion.media,
    links: conversion.links,
    body: conversion.body,
  };
  // Related links follow the actual taxonomy and are limited to nearby articles.
  post.relatedPostIds = data.posts
    .filter(
      (x) =>
        x.id !== p.id &&
        x.status === "publish" &&
        data.relations.some(
          ([pid, cid]) =>
            pid === x.id && categoryIds.includes(`WP-CATEGORY-${cid}`),
        ),
    )
    .slice(0, 4)
    .map((x) => `WP-POST-${x.id}`);
  const thumbnailId = Number(data.metas[String(p.id)]?.["_thumbnail_id"]);
  const thumbnail = data.attachments?.find((a) => a.id === thumbnailId);
  if (thumbnail?.file) {
    const source = path.resolve("artifacts/wordpress/uploads", thumbnail.file);
    const coverPath = `/images/covers/wp-${p.id}.webp`;
    const target = path.resolve(
      process.env.GEEK_MIGRATION_PUBLIC_ROOT || "public",
      "." + coverPath,
    );
    mkdirSync(path.dirname(target), { recursive: true });
    const info = await sharp(source)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(target);
    post.coverImage = {
      path: coverPath,
      alt: (thumbnail.alt || title).slice(0, 300).padEnd(10, " "),
      width: info.width,
      height: info.height,
    };
    post.media = post.media?.filter(
      (m) =>
        m.url !== "/wp-content/uploads/" + thumbnail.file ||
        post.body.includes(`media:${m.id}`),
    );
  }
  const { body, ...metadata } = post;
  postSchema.parse(metadata);
  writeFileSync(
    path.join(root, "blog", post.id + ".md"),
    "---\n" + JSON.stringify(metadata, null, 2) + "\n---\n\n" + body + "\n",
  );
  for (const offer of data.offers[String(p.id)] || [])
    if (offer.url)
      affiliateAudit.push({
        postId: p.id,
        original: offer.url,
        destination: resolve(offer.url) || offer.url,
        state:
          /amazon\.com\.br/.test(offer.url) && resolve(offer.url) !== offer.url
            ? "tracking-corrected-product-path-preserved"
            : "pending-live-product-verification",
      });
  audit.push({
    id: p.id,
    path: sourcePath,
    status: p.status,
    titlePreserved: title === plainWordpressText(p.title),
    sourceHash: p.sourceHash,
    bodyHash: hash(body),
    words: body.split(/\s+/).length,
    images: conversion.media.length,
    links: conversion.links.length,
    warnings: conversion.warnings,
  });
}
for (const key of [
  "authors",
  "categories",
  "ctas",
  "redirects",
  "products",
] as const)
  writeFileSync(
    path.join(root, key + ".json"),
    JSON.stringify(registries[key], null, 2) + "\n",
  );
const media: LegacyManifest["media"] = [];
const uploads = path.resolve("artifacts/wordpress/uploads");
function copy(dir: string) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) {
      copy(file);
      continue;
    }
    if (!/\.(?:png|jpe?g|webp|avif|gif)$/i.test(item.name)) continue;
    const rel = path.relative(uploads, file).replaceAll("\\", "/");
    const digest = hash(readFileSync(file));
    const name = digest + path.extname(file).toLowerCase();
    const target = path.join(root, "legacy-media", name);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file, target);
    media.push({
      path:
        "/wp-content/uploads/" +
        rel.split("/").map(encodeURIComponent).join("/"),
      file: name,
      bytes: statSync(file).size,
      sha256: digest,
    });
  }
}
copy(uploads);
const activeCategoryIds = new Set(
  data.relations
    .filter(([pid]) =>
      data.posts.some((p) => p.id === pid && p.status === "publish"),
    )
    .map(([, cid]) => cid),
);
const legacy: LegacyManifest = {
  version: 1,
  routes: data.categories
    .filter((c) => activeCategoryIds.has(c.id))
    .map((c) => ({
      path: new URL((c as unknown as { url: string }).url).pathname,
      destination: "/blog/" + c.slug + "/",
      status: 301,
      source: "wordpress",
      forwardQuery: false,
    })),
  media,
};
writeFileSync(
  path.join(root, "legacy-routes.json"),
  JSON.stringify(legacy, null, 2) + "\n",
);
for (const c of registries.categories) {
  if (
    !data.relations.some(
      ([pid, cid]) =>
        cid === Number(c.id.replace("WP-CATEGORY-", "")) &&
        data.posts.some((p) => p.id === pid && p.status === "publish"),
    )
  )
    c.status = "inactive" as never;
}
writeFileSync(
  path.join(root, "categories.json"),
  JSON.stringify(registries.categories, null, 2),
);
writeFileSync(
  path.join(reportRoot, "tags.json"),
  JSON.stringify(data.tags, null, 2),
);
const restored = readSourceContent(root);
const catalog = new ContentCatalog(restored.registries, restored.posts, false);
validateLegacyTargets(legacy, catalog);
mkdirSync(reportRoot, { recursive: true });
writeFileSync(
  path.join(reportRoot, "content-audit.json"),
  JSON.stringify(
    {
      posts: data.posts.length,
      publishedPosts: catalog.summaries.length,
      drafts: data.posts.filter((p) => p.status !== "publish").length,
      categories: categories.length,
      tags: data.tags.length,
      media: media.length,
      records: audit,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  path.join(reportRoot, "affiliate-audit.json"),
  JSON.stringify(affiliateAudit, null, 2) + "\n",
);
writeFileSync(
  path.join(reportRoot, "url-inventory.json"),
  JSON.stringify(
    {
      posts: data.posts
        .filter((p) => p.status === "publish")
        .map((p) => ({ id: p.id, url: p.url, action: "preserved" })),
      pages: data.pages.map((p) => ({
        url: p.url,
        action: [
          "blog",
          "mapa-do-site",
          "sobre",
          "politica-de-privacidade",
          "termos-de-uso",
        ].includes(p.slug)
          ? "preserved-modern-template"
          : "preserved-wordpress",
      })),
      categories: legacy.routes,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    posts: restored.posts.length,
    published: catalog.summaries.length,
    media: media.length,
    categories: categories.length,
    affiliateLinks: affiliateAudit.length,
  }),
);
