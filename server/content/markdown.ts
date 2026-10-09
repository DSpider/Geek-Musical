import { Marked, Renderer, type Token, type Tokens } from "marked";
import type { Heading, Post, EditorialProduct } from "./schema.js";
import { escapeHtml } from "../web/escape.js";
import { safeContentLink, safeMediaPath } from "./schema.js";
import { createHash } from "node:crypto";
import { editorialSearchHref } from "../../shared/site.js";
import {
  affiliateButton,
  affiliateStore,
  productOffersTable,
  legacyOffersTable,
  type AffiliateStore,
} from "./affiliate.js";
const referenceCache = new Map<
  string,
  {
    posts: string[];
    sources: string[];
    products: string[];
    headings: Heading[];
  }
>();

// Labels are plain text in the table of contents and accessible link names.
function inlineText(tokens: Token[]): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return tokens
    .map((token) => {
      if ("tokens" in token && Array.isArray(token.tokens))
        return inlineText(token.tokens);
      if (token.type === "br") return " ";
      return "text" in token && typeof token.text === "string"
        ? token.text
        : "";
    })
    .join("")
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (entity, key: string) => {
        if (!key.startsWith("#")) return entities[key.toLowerCase()] || entity;
        const code =
          key[1].toLowerCase() === "x"
            ? parseInt(key.slice(2), 16)
            : parseInt(key.slice(1), 10);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      },
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function headingId(text: string, counts: Map<string, number>) {
  const base =
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "secao";
  const count = (counts.get(base) || 0) + 1;
  counts.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}
export function references(
  body: string,
  post?: Pick<Post, "kind" | "media" | "links" | "editorialMedia">,
) {
  const cacheKey = createHash("sha256")
    .update(body)
    .update(
      JSON.stringify([
        post?.kind,
        post?.media?.map((m) => m.id),
        post?.editorialMedia?.map((m) => m.id),
        post?.links?.map((l) => l.id),
      ]),
    )
    .digest("hex");
  const cached = referenceCache.get(cacheKey);
  if (cached) return structuredClone(cached);
  const posts = new Set<string>();
  const sources = new Set<string>();
  const products = new Set<string>();
  const anchors = new Set<string>();
  const headings: Heading[] = [];
  const counts = new Map<string, number>();
  const lexer = new Marked({
    tokenizer: {
      url() {
        return undefined;
      },
    },
  });
  const tokens = lexer.lexer(body);
  const offerBlocks = new Set(
    tokens.flatMap((token) =>
      token.type === "paragraph" &&
      token.tokens?.length === 1 &&
      token.tokens[0].type === "link" &&
      token.tokens[0].href.startsWith("offers:")
        ? [token.tokens[0]]
        : [],
    ),
  );
  lexer.walkTokens(tokens, (token) => {
    if (token.type === "html")
      throw new Error(
        "HTML e imagens inline não são permitidos. Use coverImage validada.",
      );
    if (
      token.type === "image" &&
      !(
        post?.kind === "legacy" &&
        post.media?.some((m) => token.href === `media:${m.id}`)
      ) &&
      !post?.editorialMedia?.some((m) => token.href === `media:${m.id}`)
    )
      throw new Error(
        "Imagem inline exige referência de mídia validada da importação.",
      );
    if (token.type === "heading") {
      if (token.depth < 2 || token.depth > 3)
        throw new Error("Use apenas H2/H3 no corpo.");
      headings.push({
        id: headingId(token.text, counts),
        text: inlineText((token as Tokens.Heading).tokens),
        depth: token.depth,
      });
    }
    if (token.type === "link") {
      const href = token.href;
      if (/^post:[A-Za-z][A-Za-z0-9-]*$/.test(href)) posts.add(href.slice(5));
      else if (/^source:[A-Za-z][A-Za-z0-9-]*$/.test(href))
        sources.add(href.slice(7));
      else if (/^offers:[A-Za-z][A-Za-z0-9-]*$/.test(href)) {
        if (!offerBlocks.has(token))
          throw new Error("Tabela de ofertas exige um parágrafo independente.");
        products.add(href.slice(7));
      } else if (/^#[a-z0-9-]+$/.test(href)) anchors.add(href.slice(1));
      else if (href === "search:main") {
        /* Fixed editorial destination: the main product search. */
      } else if (
        post?.kind === "legacy" &&
        post.links?.some((m) => href === `link:${m.id}`)
      ) {
        /* Registered, schema-validated link. */
      } else
        throw new Error(
          `Link editorial inválido: ${href}. Use post:ID ou source:id.`,
        );
    }
  });
  for (const anchor of anchors)
    if (!headings.some((h) => h.id === anchor))
      throw new Error(`Âncora inexistente: ${anchor}`);
  const result = {
    posts: [...posts],
    sources: [...sources],
    products: [...products],
    headings,
  };
  if (referenceCache.size >= 256)
    referenceCache.delete(referenceCache.keys().next().value!);
  referenceCache.set(cacheKey, structuredClone(result));
  return result;
}
export function renderMarkdown(
  post: Post,
  resolvePost: (id: string) => string | undefined,
  resolveProduct: (id: string) => EditorialProduct | undefined = () =>
    undefined,
) {
  const headings: Heading[] = [];
  const counts = new Map<string, number>();
  const renderer = new Renderer();
  const legacyTables = new Map<Token, (context: Renderer) => string>();
  const grouped = new Set<Token>();
  const groupedOfferLinks = new Set<Token>();
  const affiliateStores = new Set<AffiliateStore>();
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.image = ({ href, text }) => {
    const editorial = post.editorialMedia?.find(
      (m) => href === `media:${m.id}`,
    );
    if (editorial)
      return `<img src="${escapeHtml(editorial.url)}" alt="${escapeHtml(editorial.alt)}" width="${editorial.width}" height="${editorial.height}" loading="lazy" decoding="async"><small>${escapeHtml(editorial.credit)}</small>`;
    const media =
      post.kind === "legacy" &&
      post.media?.find((m) => href === `media:${m.id}`);
    return media &&
      (safeMediaPath(media.url) ||
        (safeContentLink(media.url) && media.url.startsWith("https:")))
      ? `<img src="${escapeHtml(media.url)}" alt="${escapeHtml(media.alt)}" loading="lazy" decoding="async"${media.width ? ` width="${media.width}"` : ""}${media.height ? ` height="${media.height}"` : ""}>`
      : escapeHtml(text);
  };
  renderer.heading = function ({ text, tokens, depth }: Tokens.Heading) {
    const id = headingId(text, counts);
    headings.push({ id, text: inlineText(tokens), depth });
    return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  };
  renderer.link = function (token: Tokens.Link) {
    const { href, tokens } = token;
    const label = this.parser.parseInline(tokens);
    if (href.startsWith("offers:")) {
      return label;
    }
    const registered =
      post.kind === "legacy"
        ? post.links?.find(
            (m) => href === `link:${m.id}` && safeContentLink(m.url),
          )
        : undefined;
    const destination = registered
      ? registered.url
      : href.startsWith("post:")
        ? resolvePost(href.slice(5))
        : href.startsWith("source:")
          ? post.sources.find((s) => s.id === href.slice(7))?.url
          : href === "search:main"
            ? editorialSearchHref
            : /^#[a-z0-9-]+$/.test(href)
              ? href
              : undefined;
    const store = registered && affiliateStore(registered.url);
    if (store) {
      affiliateStores.add(store);
      const state = post.linkStates?.[registered.id];
      const href = state?.url || registered.url;
      if (state?.blocked || state?.stock === "out_of_stock")
        return `<span class="editorial-offers-empty">${label} — ${state.status === "product_incorrect" ? "link em revisão" : "oferta indisponível"}</span>`;
      return safeContentLink(href) && affiliateStore(href) === store
        ? affiliateButton(
            href,
            label,
            inlineText(tokens),
            store,
            groupedOfferLinks.has(token),
          )
        : label;
    }
    return destination
      ? `<a href="${escapeHtml(destination)}"${registered?.sponsored ? ' rel="sponsored nofollow noopener noreferrer"' : ""}>${label}</a>`
      : label;
  };
  renderer.paragraph = function (token: Tokens.Paragraph) {
    if (grouped.has(token)) return "";
    const legacyTable = legacyTables.get(token);
    if (legacyTable) return legacyTable(this) + "\n";
    if (
      token.tokens?.length === 1 &&
      token.tokens[0].type === "link" &&
      token.tokens[0].href.startsWith("offers:")
    ) {
      const product = resolveProduct(token.tokens[0].href.slice(7));
      if (product) {
        for (const offer of product.offers)
          if (
            safeContentLink(offer.url) &&
            affiliateStore(offer.url) === offer.store
          )
            affiliateStores.add(offer.store);
        return productOffersTable(product) + "\n";
      }
    }
    return Renderer.prototype.paragraph.call(this, token);
  };
  renderer.table = function (token) {
    return `<div class="editorial-table" role="region" aria-label="Tabela comparativa" tabindex="0">${Renderer.prototype.table.call(this, token)}</div>`;
  };
  const markdown = new Marked({
    gfm: true,
    renderer,
    tokenizer: {
      url() {
        return undefined;
      },
    },
  });
  const tokens = markdown.lexer(post.body);
  if (post.kind === "legacy") {
    const blocks = tokens.filter((token) => token.type !== "space");
    const single = (token: Token | undefined, kind: string) => {
      if (token?.type !== "paragraph") return undefined;
      const inline = token.tokens?.filter(
        (t) => !(t.type === "text" && !t.text.trim()),
      );
      return inline?.length === 1 && inline[0].type === kind
        ? inline[0]
        : undefined;
    };
    const offerRow = (index: number) => {
      const logo = single(blocks[index], "image") as Tokens.Image | undefined;
      const link = single(blocks[index + 1], "link") as Tokens.Link | undefined;
      const media =
        logo && post.media?.find((m) => logo.href === `media:${m.id}`);
      const registered =
        link && post.links?.find((l) => link.href === `link:${l.id}`);
      const store = registered && affiliateStore(registered.url);
      if (
        !logo ||
        !link ||
        !media ||
        !store ||
        store === "awin" ||
        !{
          amazon: /(?:amazon)/i,
          "mercado-livre": /(?:mercado|^ML(?:[-_.]|$))/i,
          magalu: /(?:magalu|magazine)/i,
          shopee: /(?:shopee)/i,
        }[store].test(media.url.split("/").at(-1) || "") ||
        !/^(?:ver pre[cç]os?|comprar(?: agora)?)$/i.test(
          inlineText(link.tokens),
        )
      )
        return undefined;
      return { store, link };
    };
    for (let i = 1; i < blocks.length; i++) {
      const heading = blocks[i - 1],
        image = single(blocks[i], "image") as Tokens.Image | undefined;
      if (heading.type !== "heading" || !image) continue;
      const firstIsOffer = !!offerRow(i);
      const photo = firstIsOffer ? "" : renderer.image.call(renderer, image);
      if (!firstIsOffer && !photo.startsWith("<img ")) continue;
      const rows: { store: AffiliateStore; link: Tokens.Link }[] = [];
      let end = firstIsOffer ? i : i + 1;
      while (end + 1 < blocks.length) {
        const row = offerRow(end);
        if (!row) break;
        rows.push(row);
        groupedOfferLinks.add(row.link);
        end += 2;
      }
      if (!rows.length) continue;
      legacyTables.set(blocks[i], (context) =>
        legacyOffersTable(
          inlineText(heading.tokens || []),
          photo,
          rows.map(({ store, link }) => ({
            store,
            action: renderer.link.call(context, link),
          })),
        ),
      );
      for (let j = i + 1; j < end; j++) grouped.add(blocks[j]);
      i = end - 1;
    }
  }
  const html = markdown.parser(tokens);
  return { html, headings, affiliateStores: [...affiliateStores] };
}
