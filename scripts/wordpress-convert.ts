import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import {
  safeContentLink,
  safeMediaPath,
  type Post,
} from "../shared/content.js";

export interface WordpressPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  authorId: number;
  publishedAt: string;
  updatedAt: string;
  sourceHash: string;
}
interface Widget {
  widgetType?: string;
  templateID?: string | number;
  settings?: Record<string, unknown>;
  elements?: Widget[];
}
export interface WordpressExport {
  posts: WordpressPost[];
  inventory: { id: number; type: string; slug: string; title: string }[];
  metas: Record<string, Record<string, string>>;
  templates: Record<string, { id: number; body: string }>;
  offers: Record<string, { title?: string; url?: string; img?: string }[]>;
  attachments?: {
    id: number;
    file: string;
    alt?: string;
    metadata?: {
      width?: number;
      height?: number;
      sizes?: Record<string, { file: string; width: number; height: number }>;
    };
  }[];
  authors: { id: number; name: string }[];
  categories: { id: number; slug: string; name: string; description: string }[];
  relations: [number, number][];
  pretty: {
    path: string;
    target: string;
    status: number;
    forwardQuery: string;
  }[];
  rankMath: {
    sources: { pattern: string; comparison: string }[];
    target: string;
    status: number;
  }[];
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const ownHosts = new Set(["geekmusical.com.br", "www.geekmusical.com.br"]);
const text = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[\\`*_\[\]#!|]/g, "\\$&")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const strings = (value: unknown) => (typeof value === "string" ? value : "");
export function plainWordpressText(html: string) {
  const dom = JSDOM.fragment(html);
  dom
    .querySelectorAll("script,style,iframe,object,embed,form")
    .forEach((n) => n.remove());
  return (dom.textContent || "").replace(/\s+/g, " ").trim();
}
export function convertWordpressPost(
  post: WordpressPost,
  data: Pick<WordpressExport, "metas" | "templates" | "offers" | "attachments">,
  resolve: (url: string) => string | undefined,
  preferSavedHtml = false,
) {
  const media: NonNullable<Post["media"]> = [];
  const links: NonNullable<Post["links"]> = [];
  const warnings: string[] = [];
  const visited = new Set<string>();
  const attachments = new Map<
    string,
    { alt: string; width?: number; height?: number }
  >();
  for (const a of data.attachments || [])
    if (a.file) {
      const parent = a.file.slice(0, a.file.lastIndexOf("/") + 1);
      attachments.set("/wp-content/uploads/" + a.file, {
        alt: a.alt || "",
        width: a.metadata?.width,
        height: a.metadata?.height,
      });
      for (const s of Object.values(a.metadata?.sizes || {}))
        attachments.set("/wp-content/uploads/" + parent + s.file, {
          alt: a.alt || "",
          width: s.width,
          height: s.height,
        });
    }
  const mediaReference = (url: string, alt: string, w?: number, h?: number) => {
    try {
      const parsed = new URL(url, "https://www.geekmusical.com.br");
      const local =
        ownHosts.has(parsed.hostname) && safeMediaPath(parsed.pathname);
      const destination = local ? parsed.pathname : url;
      if (!/\.(?:png|jpg|jpeg|webp|avif|gif)$/i.test(parsed.pathname))
        return "";
      const attachment = local
        ? attachments.get(decodeURIComponent(parsed.pathname))
        : undefined;
      alt = alt || attachment?.alt || "";
      w = w || attachment?.width;
      h = h || attachment?.height;
      if (
        !safeMediaPath(destination) &&
        !(destination.startsWith("https:") && safeContentLink(destination))
      ) {
        warnings.push("Imagem descartada por URL inválida.");
        return "";
      }
      const id = "M-" + hash(destination).slice(0, 24);
      if (!media.some((m) => m.id === id))
        media.push({
          id,
          url: destination,
          alt: plainWordpressText(alt).slice(0, 1000),
          ...(w && w <= 20000 ? { width: w } : {}),
          ...(h && h <= 20000 ? { height: h } : {}),
        });
      return `![${text(alt)}](media:${id})`;
    } catch {
      warnings.push("Imagem descartada por URL inválida.");
      return "";
    }
  };
  const link = (url: string, label: string, sponsored = false) => {
    const destination = resolve(url);
    if (!destination) {
      warnings.push("Link sem destino público preservado convertido em texto.");
      return label;
    }
    if (destination.startsWith("post:")) return `[${label}](${destination})`;
    if (destination !== "/" && !safeContentLink(destination)) return label;
    const id = "L-" + hash(destination + ":" + sponsored).slice(0, 24);
    if (!links.some((l) => l.id === id))
      links.push({ id, url: destination, sponsored });
    return `[${label}](link:${id})`;
  };
  const htmlToMarkdown = (html: string) => {
    // JSDOM does not execute scripts or fetch resources. No source HTML is emitted.
    const body = JSDOM.fragment(
      html.replace(
        /\[(?:content-egg[^\]]*|su_[^\]]*|\/?elementor[^\]]*|\/?caption[^\]]*)\]/gi,
        "",
      ),
    );
    body
      .querySelectorAll(
        "script,style,iframe,object,embed,form,input,textarea,select,button,svg,noscript",
      )
      .forEach((n) => n.remove());
    const children = (n: Node): string => [...n.childNodes].map(walk).join("");
    const walk = (node: Node): string => {
      if (node.nodeType === 3)
        return text((node.textContent || "").replace(/\s+/g, " "));
      if (node.nodeType !== 1) return "";
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === "br") return "\n";
      if (tag === "img" && el.classList.contains("wp-smiley"))
        return text(el.getAttribute("alt") || "");
      if (tag === "img")
        return (
          "\n\n" +
          mediaReference(
            el.getAttribute("src") || "",
            el.getAttribute("alt") || "",
            Number(el.getAttribute("width")) || undefined,
            Number(el.getAttribute("height")) || undefined,
          ) +
          "\n\n"
        );
      if (tag === "table") {
        const rows = [...el.querySelectorAll("tr")].map((r) =>
          [...r.querySelectorAll("th,td")].map((c) =>
            children(c).replace(/\s+/g, " ").trim(),
          ),
        );
        if (!rows.length) return "";
        const width = Math.max(...rows.map((r) => r.length));
        const format = (r: string[]) =>
          "| " +
          Array.from({ length: width }, (_, i) => r[i] || "").join(" | ") +
          " |";
        return (
          "\n\n" +
          [
            format(rows[0]),
            format(Array(width).fill("---")),
            ...rows.slice(1).map(format),
          ].join("\n") +
          "\n\n"
        );
      }
      const value = children(el).trim();
      if (!value) return "";
      if (tag === "a")
        return link(
          el.getAttribute("href") || "",
          value,
          /sponsored|nofollow/.test(el.getAttribute("rel") || ""),
        );
      if (/^h[1-6]$/.test(tag))
        return `\n\n${tag === "h3" || Number(tag.slice(1)) > 3 ? "###" : "##"} ${value}\n\n`;
      if (tag === "strong" || tag === "b") return `**${value}**`;
      if (tag === "em" || tag === "i") return `*${value}*`;
      if (tag === "li")
        return el.querySelector("h1,h2,h3,h4,h5,h6")
          ? `\n\n${value}\n\n`
          : `\n- ${value.replace(/\n+/g, " ")}`;
      if (tag === "br") return "\n";
      if (
        ["p", "div", "section", "ul", "ol", "blockquote", "figure"].includes(
          tag,
        )
      )
        return `\n\n${value}\n\n`;
      return value;
    };
    const value = children(body)
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return value;
  };
  let total = 0;
  const widgetTree = (nodes: Widget[], depth = 0): string => {
    if (depth > 30) throw new Error("Elementor: profundidade excedida.");
    return nodes
      .map((node) => {
        if (++total > 20000)
          throw new Error("Elementor: limite de blocos excedido.");
        const settings = node.settings || {};
        if (node.widgetType === "global") {
          const id = String(node.templateID);
          if (visited.has(id))
            throw new Error("Elementor: ciclo em template global.");
          visited.add(id);
          const meta = data.metas[id]?.["_elementor_data"];
          const value = meta
            ? widgetTree(JSON.parse(meta), depth + 1)
            : htmlToMarkdown(data.templates[id]?.body || "");
          visited.delete(id);
          return value;
        }
        switch (node.widgetType) {
          case "heading": {
            const title = plainWordpressText(strings(settings.title));
            return title
              ? `${settings.header_size === "h3" ? "###" : "##"} ${text(title)}`
              : "";
          }
          case "text-editor":
            return htmlToMarkdown(strings(settings.editor));
          case "image": {
            const image = settings.image as
              { url?: string; alt?: string } | undefined;
            return image?.url ? mediaReference(image.url, image.alt || "") : "";
          }
          case "button": {
            const target = settings.link as { url?: string } | undefined;
            return target?.url
              ? link(
                  target.url,
                  text(plainWordpressText(strings(settings.text))),
                )
              : "";
          }
          case "saswp-faq-block": {
            const list = Array.isArray(settings.list)
              ? (settings.list as Record<string, unknown>[])
              : [];
            return list
              .map((q) => {
                const question = plainWordpressText(
                  strings(q.saswp_faq_question || q.faq_question),
                );
                const answer = htmlToMarkdown(
                  strings(q.saswp_faq_answer || q.faq_answer),
                );
                return question && answer
                  ? `### ${text(question)}\n\n${answer}`
                  : "";
              })
              .join("\n\n");
          }
          case "video": {
            const url = strings(
              settings.youtube_url ||
                settings.vimeo_url ||
                settings.dailymotion_url ||
                settings.videopress_url,
            );
            return url ? link(url, "Assistir ao vídeo citado no artigo") : "";
          }
          case "shortcode":
            return "";
          case "posts":
          case "divider":
            return "";
          default:
            return node.elements ? widgetTree(node.elements, depth + 1) : "";
        }
      })
      .filter(Boolean)
      .join("\n\n");
  };
  const elementor = data.metas[String(post.id)]?.["_elementor_data"];
  let body =
    preferSavedHtml && post.body.trim()
      ? htmlToMarkdown(post.body)
      : elementor
        ? widgetTree(JSON.parse(elementor))
        : htmlToMarkdown(post.body);
  const thumbnailId = Number(data.metas[String(post.id)]?.["_thumbnail_id"]);
  const thumbnail = data.attachments?.find((a) => a.id === thumbnailId);
  if (
    thumbnail?.file &&
    !media.some(
      (m) =>
        decodeURIComponent(m.url) === "/wp-content/uploads/" + thumbnail.file,
    )
  )
    body =
      mediaReference(
        "https://www.geekmusical.com.br/wp-content/uploads/" + thumbnail.file,
        thumbnail.alt || "",
      ) +
      "\n\n" +
      body;
  // Offers are a dated source inventory. Prices/stock were excluded from the export.
  const seenOffers = new Set<string>();
  const offers = (data.offers[String(post.id)] || []).flatMap((offer) => {
    if (
      !offer.title ||
      !offer.url ||
      !resolve(offer.url) ||
      seenOffers.has(offer.url)
    )
      return [];
    seenOffers.add(offer.url);
    return [
      (offer.img ? mediaReference(offer.img, offer.title) + "\n\n" : "") +
        link(offer.url, text(plainWordpressText(offer.title)), true),
    ];
  });
  if (offers.length)
    body +=
      "\n\n## Produtos e links citados na publicação\n\nOs links abaixo foram preservados da publicação original. Consulte a loja para confirmar preço, condições e disponibilidade.\n\n" +
      offers.join("\n\n");
  body = body
    .replace(/\[especificar\]/gi, "não confirmado na publicação original")
    .replace(/\\\[especificar\\\]/gi, "não confirmado na publicação original")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!/^## /m.test(body))
    body = "## Conteúdo da publicação original\n\n" + body;
  return { body, media, links, warnings, sourceHash: post.sourceHash };
}
