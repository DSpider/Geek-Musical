import { Marked } from "marked";
import type { HomePostCard, CategoryArtKind } from "../../shared/home.js";
import type { EditorialProduct } from "../../shared/content.js";
import { ContentCatalog } from "./catalog.js";
import { headingId } from "./markdown.js";
import {
  defaultHomeLayout,
  type HomeLayout,
  type HomeGridContent,
  type HomePopularity,
} from "../../shared/home-editor.js";

const artKinds: Record<string, CategoryArtKind> = {};
const featuredIds = [730, 634, 849, 670, 896, 2226, 2170, 708, 5691].map(
  (id) => "WP-POST-" + id,
);
const musicalFeaturedIndex = (id: string) => {
  const i = featuredIds.indexOf(id);
  return i < 0 ? 999 : i;
};
export function homePostCards(catalog: ContentCatalog): HomePostCard[] {
  const cards: HomePostCard[] = [];
  const posts = catalog.summaries
    .filter((p) => p.status === "published")
    .sort(
      (a, b) =>
        musicalFeaturedIndex(a.id) - musicalFeaturedIndex(b.id) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.id.localeCompare(b.id),
    );
  for (const summary of posts) {
    const category = catalog.registries.categories.find(
      (c) => c.id === summary.categoryId && c.status !== "inactive",
    );
    if (!category) continue;
    cards.push(homePostCard(catalog, summary.id)!);
    if (cards.length === 9) break;
  }
  return cards;
}
export function homePostCard(
  catalog: ContentCatalog,
  id: string,
): HomePostCard | undefined {
  const summary = catalog.summaries.find(
    (p) => p.id === id && p.status === "published",
  );
  if (!summary) return;
  const category = catalog.registries.categories.find(
    (c) => c.id === summary.categoryId && c.status !== "inactive",
  );
  if (!category) return;
  const post = catalog.getPost(summary.id)!;
  const mediaId = post.body.match(/!\[[^\]]*\]\(media:([A-Za-z0-9-]+)\)/)?.[1];
  const media = post.media?.find((m) => m.id === mediaId);
  const image = post.coverImage
    ? { url: post.coverImage.path, alt: post.coverImage.alt }
    : media
      ? { url: media.url, alt: media.alt || summary.title }
      : undefined;
  return {
    id: summary.id,
    url: summary.url,
    title: summary.title,
    readingMinutes: summary.readingMinutes,
    excerpt: summary.excerpt,
    category: category.name,
    art: artKinds[category.id] ?? "audio",
    ...(image ? { image } : {}),
  };
}
export function homeGrids(
  catalog: ContentCatalog,
  layout?: HomeLayout | null,
  popularity?: HomePopularity,
): HomeGridContent[] {
  const eligible = catalog.summaries.filter(
    (p) =>
      p.status === "published" &&
      catalog.registries.categories.some(
        (c) => c.id === p.categoryId && c.status !== "inactive",
      ),
  );
  const date = (id: string) => {
    const p = catalog.getPost(id)!;
    return Date.parse(
      p.origin?.sourcePublishedAt
        ? p.origin.sourcePublishedAt.includes("T")
          ? p.origin.sourcePublishedAt
          : p.origin.sourcePublishedAt.replace(" ", "T") + "-03:00"
        : p.publishedAt!,
    );
  };
  const newest = (a: (typeof eligible)[number], b: (typeof eligible)[number]) =>
    date(b.id) - date(a.id) || a.id.localeCompare(b.id);
  return (layout ?? defaultHomeLayout(homePostCards(catalog))).grids.map(
    ({ postIds, mode = "manual", categoryId, ...grid }) => {
      let ids = postIds;
      if (mode !== "manual") {
        let candidates = eligible.filter(
          (p) => mode !== "category" || p.categoryId === categoryId,
        );
        const ranked =
          mode === "popular"
            ? candidates.filter((p) => (popularity?.views[p.url] ?? 0) > 0)
            : [];
        if (mode === "popular" && ranked.length) {
          candidates = ranked.sort(
            (a, b) =>
              popularity!.views[b.url] - popularity!.views[a.url] ||
              newest(a, b),
          );
        } else
          candidates.sort(
            mode === "oldest"
              ? (a, b) => date(a.id) - date(b.id) || a.id.localeCompare(b.id)
              : newest,
          );
        ids = candidates.slice(0, grid.columns * grid.rows).map((p) => p.id);
      }
      return {
        ...grid,
        cards: ids
          .map((id) => homePostCard(catalog, id))
          .filter((p): p is HomePostCard => !!p),
      };
    },
  );
}
export interface BlogProductResult {
  product: EditorialProduct;
  category: string;
  art: CategoryArtKind;
  image?: { url: string; alt: string };
  articles: { title: string; url: string }[];
}
const indexes = new WeakMap<
  ContentCatalog,
  { result: BlogProductResult; text: string; name: string }[]
>();
export const normalizeProductQuery = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function productIndex(catalog: ContentCatalog) {
  const existing = indexes.get(catalog);
  if (existing) return existing;
  const results = new Map<string, BlogProductResult>();
  for (const summary of catalog.summaries) {
    const category = catalog.registries.categories.find(
      (c) => c.id === summary.categoryId && c.status !== "inactive",
    );
    if (summary.status !== "published" || !category) continue;
    const post = catalog.getPost(summary.id)!;
    const counts = new Map<string, number>();
    let anchor = "";
    let mediaId: string | undefined;
    const lexer = new Marked();
    lexer.walkTokens(lexer.lexer(post.body), (token) => {
      if (token.type === "heading") {
        const id = headingId(token.text, counts);
        if (token.depth === 2) {
          anchor = id;
          mediaId = undefined;
        }
      }
      if (token.type === "image" && token.href.startsWith("media:"))
        mediaId = token.href.slice(6);
      if (token.type === "link" && token.href.startsWith("offers:")) {
        const product = catalog.resolveProduct(token.href.slice(7));
        if (!product?.offers.length) return;
        const entry: BlogProductResult = results.get(product.id) ?? {
          product,
          category: category.name,
          art: artKinds[category.id] ?? "audio",
          articles: [],
        };
        const image = post.media?.find((m) => m.id === mediaId);
        if (image && !entry.image)
          entry.image = { url: image.url, alt: product.name };
        const url = summary.url + (anchor ? "#" + anchor : "");
        if (!entry.articles.some((a) => a.url === url))
          entry.articles.push({ title: summary.title, url });
        results.set(product.id, entry);
      }
    });
  }
  const index = [...results.values()].map((result) => ({
    result,
    name: normalizeProductQuery(result.product.name),
    text: normalizeProductQuery(result.product.name + " " + result.category),
  }));
  indexes.set(catalog, index);
  return index;
}
export function searchBlogProducts(
  catalog: ContentCatalog,
  query: string,
  page = 1,
) {
  const normalized = normalizeProductQuery(query);
  const terms = normalized.split(" ").filter(Boolean);
  const all = terms.length
    ? productIndex(catalog)
        .filter((p) => terms.every((term) => p.text.includes(term)))
        .sort(
          (a, b) =>
            Number(b.name === normalized) - Number(a.name === normalized) ||
            a.name.localeCompare(b.name, "pt-BR"),
        )
        .map((p) => p.result)
    : [];
  return {
    total: all.length,
    pages: Math.max(1, Math.ceil(all.length / 12)),
    items: all.slice((page - 1) * 12, page * 12),
  };
}
