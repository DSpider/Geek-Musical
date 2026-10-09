import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  postSchema,
  registriesSchema,
  type Post,
  type PostSummary,
  type Registries,
  type EditorialProduct,
} from "./schema.js";
import { references } from "./markdown.js";
import { affiliateStore } from "./affiliate.js";
import { localProductImage } from "../../shared/product-image.js";
import {
  assertConsumerArticle,
  assertConsumerText,
} from "./editorial-policy.js";

export const PAGE_SIZE = 12;
function specificProductUrl(value: string, store: string) {
  const url = new URL(value);
  if (store === "amazon")
    return /\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i.test(url.pathname);
  if (store === "mercado-livre")
    return /\/(?:p|up)\/MLB[U]?\d+(?:\/|$)|\/MLB-\d+.*_JM$/i.test(url.pathname);
  if (store === "magalu") return /\/p\/[a-z0-9]+(?:\/|$)/i.test(url.pathname);
  if (store === "shopee")
    return /\/product\/\d+\/\d+(?:\/|$)|-i\.\d+\.\d+$/i.test(url.pathname);
  return false;
}
export function parsePost(value: string): Post {
  const match = value
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/);
  if (!match)
    throw new Error("Frontmatter JSON entre delimitadores --- obrigatório.");
  return { ...postSchema.parse(JSON.parse(match[1])), body: match[2].trim() };
}
export function postUrl(
  post: Pick<Post, "slug" | "categoryId"> &
    Pick<Partial<Post>, "canonicalPath">,
  registries: Registries,
) {
  if (post.canonicalPath) return post.canonicalPath;
  const category = registries.categories.find((c) => c.id === post.categoryId);
  if (!category) throw new Error(`Categoria inexistente: ${post.categoryId}`);
  return `/blog/${category.slug}/${post.slug}/`;
}
export const categoryUrl = (slug: string) => `/blog/${slug}/`;
export function readingMinutes(body: string) {
  return Math.max(
    1,
    Math.ceil(
      body
        .replace(/\[[^\]]+\]\([^)]+\)/g, (text) =>
          text.slice(1, text.indexOf("]")),
        )
        .split(/\s+/).length / 220,
    ),
  );
}
export class ContentCatalog {
  offerResolver?: (product: EditorialProduct) => EditorialProduct;
  postResolver?: (post: Post) => Post;
  readonly summaries: PostSummary[];
  readonly warnings: string[] = [];
  private readonly posts: Map<string, Post>;
  constructor(
    readonly registries: Registries,
    entries: Post[],
    readonly preview: boolean,
    readonly pageSize: number = PAGE_SIZE,
  ) {
    this.posts = new Map(
      entries
        .filter(
          (p) =>
            p.status !== "archived" &&
            (preview ||
              (p.status === "published" &&
                registries.categories.some(
                  (c) => c.id === p.categoryId && c.status !== "inactive",
                ))),
        )
        .map((p) => [p.id, p]),
    );
    this.summaries = [...this.posts.values()]
      .map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        categoryId: post.categoryId,
        kind: post.kind,
        status: post.status,
        updatedAt: post.updatedAt,
        url: postUrl(post, registries),
        readingMinutes: readingMinutes(post.body),
      }))
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      );
    for (const post of this.posts.values())
      for (const id of new Set([
        ...post.relatedPostIds,
        ...references(post.body, post).posts,
      ]))
        if (!this.posts.has(id))
          this.warnings.push(
            `${post.id}: relação ${id} indisponível por status neste contexto.`,
          );
  }
  listPosts(categoryId?: string, page = 1, size = this.pageSize) {
    const all = this.summaries.filter(
      (p) =>
        !categoryId ||
        p.categoryId === categoryId ||
        this.posts.get(p.id)?.categoryIds?.includes(categoryId),
    );
    return {
      items: all.slice((page - 1) * size, page * size),
      total: all.length,
      pages: Math.max(1, Math.ceil(all.length / size)),
    };
  }
  getPost(id: string) {
    const post = this.posts.get(id);
    return post && this.postResolver ? this.postResolver(post) : post;
  }
  findPost(url: string) {
    const summary = this.summaries.find((p) => p.url === url);
    return summary && this.getPost(summary.id);
  }
  resolvePost(id: string) {
    return this.summaries.find((p) => p.id === id)?.url;
  }
  resolveProduct(id: string): EditorialProduct | undefined {
    const product = this.registries.products?.find(
      (product) => product.id === id,
    );
    return product && this.offerResolver
      ? this.offerResolver(product)
      : product;
  }
  listCategories() {
    return this.registries.categories
      .filter(
        (c) =>
          c.status !== "inactive" &&
          this.summaries.some(
            (p) =>
              p.categoryId === c.id ||
              this.posts.get(p.id)?.categoryIds?.includes(c.id),
          ),
      )
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  relatedPosts(post: Post) {
    const category = this.registries.categories.find(
      (c) => c.id === post.categoryId,
    )!;
    const ids = new Set([
      ...post.relatedPostIds,
      ...this.summaries
        .filter(
          (p) =>
            p.id !== post.id &&
            this.posts.get(p.id)?.relatedPostIds.includes(post.id),
        )
        .map((p) => p.id),
      ...(post.kind === "supporting" &&
      (post.siloPillarPostId || category.pillarPostId)
        ? [post.siloPillarPostId || category.pillarPostId!]
        : []),
    ]);
    return this.summaries.filter((p) => p.id !== post.id && ids.has(p.id));
  }
  breadcrumbs(url: string) {
    const post = this.findPost(url);
    const category = this.registries.categories.find((c) =>
      post ? c.id === post.categoryId : url.startsWith(categoryUrl(c.slug)),
    );
    return [
      { label: "Início", url: "/" },
      { label: "Blog", url: "/blog/" },
      ...(category
        ? [{ label: category.name, url: categoryUrl(category.slug) }]
        : []),
      ...(post ? [{ label: post.title, url }] : []),
    ];
  }
}
export function validateContent(
  registries: Registries,
  posts: Post[],
  contentRoot = "content",
) {
  const unique = (values: string[], name: string) => {
    if (new Set(values).size !== values.length)
      throw new Error(`${name} duplicado.`);
  };
  unique(
    posts.map((p) => p.id),
    "ID de post",
  );
  unique(
    posts.map((p) => postUrl(p, registries)),
    "URL",
  );
  unique(
    posts.map((p) => p.slug),
    "Slug de post",
  );
  for (const group of [
    registries.categories,
    registries.authors,
    registries.ctas,
    registries.products || [],
  ])
    unique(
      group.map((item) => item.id),
      "Cadastro",
    );
  unique(
    registries.categories.map((c) => c.slug),
    "Slug de categoria",
  );
  const offerIds = new Set<string>();
  for (const product of registries.products || []) {
    assertConsumerText(product.name, product.id);
    unique(
      product.offers.map((offer) =>
        offer.store === "awin"
          ? `awin:${offer.awin?.advertiserId}`
          : offer.store,
      ),
      `Loja em ${product.id}`,
    );
    for (const offer of product.offers) {
      if (offer.store === "awin") {
        const meta = offer.awin;
        const link = new URL(offer.url);
        const direct = new URL(offer.productUrl);
        if (
          offerIds.has(offer.id) ||
          !meta ||
          offer.method !== "awin-feed" ||
          !["awin1.com", "www.awin1.com"].includes(link.hostname) ||
          affiliateStore(offer.url) !== "awin" ||
          affiliateStore(offer.productUrl) === "awin" ||
          direct.pathname === "/" ||
          !(
            (link.pathname === "/pclick.php" &&
              link.searchParams.get("a") === String(meta.publisherId) &&
              link.searchParams.get("m") === String(meta.advertiserId) &&
              /^\d+$/.test(link.searchParams.get("p") || "")) ||
            (link.pathname === "/cread.php" &&
              link.searchParams.get("awinaffid") === String(meta.publisherId) &&
              link.searchParams.get("awinmid") === String(meta.advertiserId) &&
              link.searchParams.get("ued") === offer.productUrl)
          )
        )
          throw new Error(`Oferta Awin inválida: ${offer.id}`);
        offerIds.add(offer.id);
        continue;
      }
      if (offer.awin)
        throw new Error(`Metadados Awin em outra origem: ${offer.id}`);
      if (
        offerIds.has(offer.id) ||
        affiliateStore(offer.url) !== offer.store ||
        affiliateStore(offer.productUrl) !== offer.store ||
        !specificProductUrl(offer.productUrl, offer.store)
      )
        throw new Error(`Oferta inválida: ${product.id} → ${offer.id}`);
      offerIds.add(offer.id);
      if (
        (offer.store === "mercado-livre" || offer.store === "shopee") &&
        offer.tracking !== "geekmusical"
      )
        throw new Error(`Rastreamento inválido: ${offer.id}`);
      if (
        offer.method !== "manual-review" &&
        offer.method !==
          (
            {
              amazon: "amazon-api",
              "mercado-livre": "mercado-livre-browser",
              magalu: "magalu-api",
              shopee: "shopee-api",
              awin: "awin-feed",
            } as const
          )[offer.store]
      )
        throw new Error(`Método inválido: ${offer.id}`);
    }
  }
  for (const category of registries.categories) {
    const pillar = posts.find((p) => p.id === category.pillarPostId);
    if (
      category.pillarPostId &&
      (!pillar ||
        pillar.categoryId !== category.id ||
        !["pillar", "legacy"].includes(pillar.kind) ||
        pillar.status !== "published")
    )
      throw new Error(`Guia central inválido: ${category.id}`);
    if (!registries.ctas.some((c) => c.id === category.ctaKey))
      throw new Error(`CTA inválido: ${category.id}`);
    if (
      category.pillarPostId &&
      pillar?.kind !== "legacy" &&
      posts.filter((p) => p.categoryId === category.id && p.kind === "pillar")
        .length !== 1
    )
      throw new Error(`Categoria deve ter um guia central: ${category.id}`);
    if (
      !category.pillarPostId &&
      posts.some(
        (p) =>
          p.categoryId === category.id &&
          p.status === "published" &&
          p.kind !== "legacy",
      )
    )
      throw new Error(`Categoria publicada exige guia central: ${category.id}`);
  }
  for (const post of posts) {
    assertConsumerArticle(post);
    postSchema.parse(
      Object.fromEntries(
        Object.entries(post).filter(([key]) => key !== "body"),
      ),
    );
    const category = registries.categories.find(
      (c) => c.id === post.categoryId,
    );
    if (
      !category ||
      !registries.authors.some((a) => a.id === post.authorId) ||
      (post.reviewerId &&
        !registries.authors.some((a) => a.id === post.reviewerId))
    )
      throw new Error(`Autoria/categoria inválida: ${post.id}`);
    if (!registries.ctas.some((c) => c.id === post.ctaKey))
      throw new Error(`CTA inválido: ${post.id}`);
    if (
      post.kind === "supporting" &&
      !!(post.siloPillarPostId || category.pillarPostId) &&
      !post.relatedPostIds.includes(
        post.siloPillarPostId || category.pillarPostId!,
      )
    )
      throw new Error(`Complementar sem guia central: ${post.id}`);
    if (
      post.siloPillarPostId &&
      !posts.some(
        (p) =>
          p.id === post.siloPillarPostId &&
          p.id !== post.id &&
          p.status === "published" &&
          p.categoryId === post.categoryId,
      )
    )
      throw new Error(`Guia do SILO inválido: ${post.id}`);
    if (
      (post.status === "published" || post.status === "review") &&
      (post.body.split(/\s+/).length < (post.kind === "legacy" ? 30 : 350) ||
        /lorem ipsum|placeholder/i.test(post.body) ||
        /\b(?:TODO|TBD)\b/.test(post.body))
    )
      throw new Error(`Conteúdo incompleto: ${post.id}`);
    const refs = references(post.body, post);
    unique(post.productIds ?? [], `Produto em ${post.id}`);
    for (const id of [...refs.products, ...(post.productIds ?? [])])
      if (!registries.products?.some((product) => product.id === id))
        throw new Error(`Produto inexistente: ${post.id} → ${id}`);
    if (
      post.productIds &&
      refs.products.some((id) => !post.productIds!.includes(id))
    )
      throw new Error(
        `Tabela de produto sem identificação no artigo: ${post.id}`,
      );
    if (
      (post.status === "published" || post.status === "review") &&
      refs.headings.length < (post.kind === "legacy" ? 1 : 4)
    )
      throw new Error(`Estrutura insuficiente: ${post.id}`);
    for (const id of [...post.relatedPostIds, ...refs.posts])
      if (!posts.some((p) => p.id === id) || id === post.id)
        throw new Error(`Referência inválida: ${post.id} → ${id}`);
    unique(post.relatedPostIds, `Relação em ${post.id}`);
    unique(
      (post.editorialMedia || []).map((m) => m.id),
      `Imagem editorial em ${post.id}`,
    );
    for (const media of post.editorialMedia || [])
      if (
        !existsSync(
          path.join(contentRoot, "editorial-media", path.basename(media.url)),
        )
      )
        throw new Error(
          `Imagem editorial inexistente: ${post.id} → ${media.id}`,
        );
    unique(
      (post.media || []).map((m) => m.id),
      `Mídia em ${post.id}`,
    );
    unique(
      (post.links || []).map((m) => m.id),
      `Link em ${post.id}`,
    );
    unique(
      post.sources.map((s) => s.id),
      `Fonte em ${post.id}`,
    );
    for (const id of refs.sources)
      if (!post.sources.some((s) => s.id === id))
        throw new Error(`Fonte inexistente: ${post.id} → ${id}`);
    for (const source of post.sources)
      if (!refs.sources.includes(source.id))
        throw new Error(
          `Fonte sem citação no corpo: ${post.id} → ${source.id}`,
        );
    if (
      post.coverImage &&
      !(/^\/editorial-media\/[a-f0-9]{64}\.webp$/.test(post.coverImage.path)
        ? existsSync(
            path.resolve(
              contentRoot,
              "editorial-media",
              path.basename(post.coverImage.path),
            ),
          )
        : localProductImage.test(post.coverImage.path)
          ? existsSync(
              path.resolve(
                contentRoot,
                "product-images",
                path.basename(post.coverImage.path),
              ),
            )
          : existsSync(path.resolve("public", "." + post.coverImage.path)))
    )
      throw new Error(`Capa inexistente: ${post.id}`);
  }
  for (const [old, destination] of Object.entries(registries.redirects)) {
    if (
      !/^\/[a-z0-9/-]+\/$/.test(old) ||
      (!posts.some((p) => postUrl(p, registries) === destination) &&
        !registries.categories.some(
          (c) => categoryUrl(c.slug) === destination,
        )) ||
      posts.some((p) => postUrl(p, registries) === old) ||
      registries.categories.some((c) => categoryUrl(c.slug) === old)
    )
      throw new Error(`Redirect inválido: ${old}`);
  }
}
export function readSourceContent(root = "content") {
  const registries = registriesSchema.parse({
    categories: JSON.parse(
      readFileSync(path.join(root, "categories.json"), "utf8"),
    ),
    authors: JSON.parse(readFileSync(path.join(root, "authors.json"), "utf8")),
    ctas: JSON.parse(readFileSync(path.join(root, "ctas.json"), "utf8")),
    redirects: JSON.parse(
      readFileSync(path.join(root, "redirects.json"), "utf8"),
    ),
    ...(existsSync(path.join(root, "products.json"))
      ? {
          products: JSON.parse(
            readFileSync(path.join(root, "products.json"), "utf8"),
          ),
        }
      : {}),
  });
  const posts = readdirSync(path.join(root, "blog"))
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) =>
      parsePost(readFileSync(path.join(root, "blog", file), "utf8")),
    );
  validateContent(registries, posts, root);
  return { registries, posts };
}
