import { z } from "zod";
import {
  productImageSchema,
  productImageReferenceSchema,
} from "./product-image.js";

const id = z
  .string()
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9-]*$/);
const slug = z
  .string()
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const date = z.iso.date();
export const canonicalPathSchema = z
  .string()
  .max(300)
  .regex(/^\/[a-z0-9]+(?:[/-][a-z0-9]+)*\/$/)
  .refine(
    (value) =>
      !/^\/(?:api|gm-admin|wp-admin|wp-content|wp-json|\.well-known)(?:\/|-|$)/.test(
        value,
      ),
  );
export function safeMediaPath(value: string) {
  try {
    const url = new URL(value, "https://media.invalid");
    const decoded = decodeURIComponent(url.pathname);
    return (
      value.startsWith("/wp-content/uploads/") &&
      url.origin === "https://media.invalid" &&
      !url.search &&
      !url.hash &&
      url.pathname === value &&
      !/[\\\x00-\x1f]/.test(decoded) &&
      !/%(?:2f|5c)/i.test(value) &&
      !decoded.split("/").some((p) => p === "." || p === "..") &&
      /\.(?:png|jpg|jpeg|webp|avif|gif)$/i.test(decoded)
    );
  } catch {
    return false;
  }
}
export function safeContentLink(value: string) {
  if (value === "/") return true;
  if (/^\/[a-z0-9/-]+\/?(?:#[a-z0-9-]+)?$/.test(value))
    return (
      !value.startsWith("//") &&
      !/^\/(?:api|gm-admin|wp-admin|wp-json|wp-content)(?:\/|-|$)/.test(value)
    );
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !/[\x00-\x1f]/.test(value) &&
      !/^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[)/i.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}
export const mediaSchema = z
  .object({
    id,
    url: z
      .string()
      .max(2000)
      .refine(
        (v) =>
          safeMediaPath(v) || (safeContentLink(v) && v.startsWith("https:")),
      ),
    alt: z.string().max(1000),
    width: z.number().int().positive().max(20000).optional(),
    height: z.number().int().positive().max(20000).optional(),
  })
  .strict();
export const sourceSchema = z
  .object({
    id,
    title: z.string().min(5).max(300),
    url: z
      .url()
      .max(2000)
      .refine((s) => {
        const url = new URL(s);
        return url.protocol === "https:" && !url.username && !url.password;
      }),
    accessedAt: date,
  })
  .strict();
export const editorialOfferSchema = z
  .object({
    id,
    store: z.enum(["amazon", "mercado-livre", "magalu", "shopee", "awin"]),
    url: z.string().max(2000).refine(safeContentLink),
    productUrl: z.string().max(2000).refine(safeContentLink),
    title: z.string().min(3).max(500),
    checkedAt: z.iso.datetime(),
    tracking: z.string().min(1).max(100),
    method: z.enum([
      "amazon-api",
      "mercado-livre-browser",
      "magalu-api",
      "shopee-api",
      "awin-feed",
      "manual-review",
    ]),
    awin: z
      .object({
        publisherId: z.number().int().positive(),
        advertiserId: z.number().int().positive(),
        catalogId: z.string().regex(/^[a-f0-9]{32}$/),
        storeName: z.string().min(2).max(200),
      })
      .strict()
      .optional(),
  })
  .strict();
export const editorialProductSchema = z
  .object({
    id,
    name: z.string().min(3).max(300),
    offers: z.array(editorialOfferSchema).max(30),
    image: z
      .union([productImageSchema, productImageReferenceSchema])
      .nullable()
      .optional(),
  })
  .strict();
export type EditorialOffer = z.infer<typeof editorialOfferSchema>;
export interface OfferPublicState {
  status: string;
  stock: "in_stock" | "out_of_stock" | "unknown";
  checkedAt: string | null;
  url?: string;
  blocked?: boolean;
}
export type EditorialProduct = z.infer<typeof editorialProductSchema> & {
  offerStates?: Record<string, OfferPublicState>;
};
export const postSchema = z
  .object({
    id,
    title: z.string().min(12).max(300),
    slug,
    excerpt: z.string().min(40).max(1000),
    categoryId: id,
    categoryIds: z.array(id).max(100).optional(),
    tagIds: z.array(id).max(200).optional(),
    editorialFormat: z
      .enum(["review", "ranking", "guide", "tutorial"])
      .optional(),
    kind: z.enum(["pillar", "supporting", "legacy"]),
    canonicalPath: canonicalPathSchema.optional(),
    origin: z
      .object({
        system: z.literal("wordpress"),
        postId: z.number().int().positive(),
        sourcePath: canonicalPathSchema,
        sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
        importedAt: date,
        sourcePublishedAt: z.string().max(30).optional(),
        sourceUpdatedAt: z.string().max(30).optional(),
      })
      .strict()
      .optional(),
    media: z.array(mediaSchema).max(300).optional(),
    links: z
      .array(
        z
          .object({
            id,
            url: z.string().max(2000).refine(safeContentLink),
            sponsored: z.boolean(),
            productUrl: z.string().max(2000).refine(safeContentLink).optional(),
          })
          .strict(),
      )
      .max(1000)
      .optional(),
    status: z.enum(["draft", "review", "published", "archived"]),
    authorId: id,
    reviewerId: id.optional(),
    createdAt: date,
    publishedAt: date.optional(),
    updatedAt: date,
    seoTitle: z.string().min(12).max(300),
    seoDescription: z.string().min(50).max(200),
    coverImage: z
      .object({
        path: z
          .string()
          .max(300)
          .regex(/^\/[a-zA-Z0-9/_-]+\.(?:png|jpg|jpeg|webp|avif)$/),
        alt: z.string().min(10).max(300),
        width: z.number().int().positive().max(10000),
        height: z.number().int().positive().max(10000),
        credit: z.string().max(300).optional(),
        license: z.string().max(300).optional(),
      })
      .strict()
      .optional(),
    relatedPostIds: z.array(id).max(100),
    siloPillarPostId: id.optional(),
    productIds: z.array(id).max(500).optional(),
    ctaKey: id,
    ctaText: z.string().min(20).max(1000).optional(),
    sources: z.array(sourceSchema).max(50),
  })
  .strict()
  .superRefine((post, ctx) => {
    if (
      post.kind === "legacy"
        ? !post.origin || !post.canonicalPath
        : !!post.origin ||
          !!post.canonicalPath ||
          !!post.media?.length ||
          !!post.links?.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Origem, URL e referências de importação exigem artigo legacy; legacy exige origem e URL.",
      });
    if (
      (post.status === "published" || post.status === "review") &&
      !post.sources.length &&
      post.kind !== "legacy"
    )
      ctx.addIssue({
        code: "custom",
        message: "Artigo em revisão/publicado exige fontes.",
      });
    if ((post.status === "published") !== !!post.publishedAt)
      ctx.addIssue({
        code: "custom",
        message: "publishedAt existe somente em published.",
      });
    if (
      (post.kind !== "legacy" && post.updatedAt < post.createdAt) ||
      (post.publishedAt &&
        (post.publishedAt < post.createdAt ||
          (post.kind !== "legacy" && post.updatedAt < post.publishedAt)))
    )
      ctx.addIssue({
        code: "custom",
        message: "Datas editoriais fora de ordem.",
      });
    for (const value of [
      post.createdAt,
      post.updatedAt,
      post.publishedAt,
      ...post.sources.map((s) => s.accessedAt),
    ])
      if (
        value &&
        value >
          new Date().toLocaleDateString("en-CA", {
            timeZone: "America/Sao_Paulo",
          })
      )
        ctx.addIssue({ code: "custom", message: "Data editorial futura." });
  });
export const categorySchema = z
  .object({
    id,
    slug,
    name: z.string().min(2).max(100),
    description: z.string().min(50).max(5000),
    seoTitle: z.string().min(10).max(300),
    seoDescription: z.string().min(50).max(200),
    pillarPostId: id.optional(),
    ctaKey: id,
    order: z.number().int().min(0).max(10000).default(0),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .strict();
export const authorSchema = z
  .object({
    id,
    name: z.string().min(3),
    type: z.enum(["Person", "Organization"]),
    description: z.string().min(10),
  })
  .strict();
export const ctaSchema = z
  .object({ id, text: z.string().min(20), label: z.string().min(5) })
  .strict();
export const registriesSchema = z
  .object({
    categories: z.array(categorySchema),
    authors: z.array(authorSchema),
    ctas: z.array(ctaSchema),
    redirects: z.record(z.string(), z.string()),
    products: z.array(editorialProductSchema).optional(),
  })
  .strict();
export type PostMetadata = z.infer<typeof postSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Author = z.infer<typeof authorSchema>;
export type Cta = z.infer<typeof ctaSchema>;
export type Registries = z.infer<typeof registriesSchema>;
export interface Post extends PostMetadata {
  body: string;
  // Operational state is resolved at read time, never stored in post frontmatter.
  linkStates?: Record<string, OfferPublicState>;
}
export interface PostSummary extends Pick<
  PostMetadata,
  | "id"
  | "title"
  | "slug"
  | "excerpt"
  | "categoryId"
  | "kind"
  | "status"
  | "updatedAt"
> {
  url: string;
  readingMinutes: number;
}
export interface Heading {
  id: string;
  text: string;
  depth: number;
}
export interface Breadcrumb {
  label: string;
  url: string;
}
