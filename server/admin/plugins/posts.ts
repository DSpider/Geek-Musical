import {
  deleteSchema,
  listSchema,
  savePostSchema,
  postInputSchema,
  bulkPostSchema,
} from "../../../shared/admin.js";
import { editorialProductSchema } from "../../../shared/content.js";
import { productImageSchema } from "../../../shared/product-image.js";
import {
  productImages,
  productImageMigration,
} from "../../content/product-images.js";
import { z } from "zod";
import { references, renderMarkdown } from "../../content/markdown.js";
import { adminUser } from "../auth.js";
import { AdminError } from "../errors.js";
import {
  newPost,
  savePost,
  deletePost,
  changePostStatuses,
} from "../../content/admin-service.js";
import type { AdminPluginDefinition } from "../registry.js";
import {
  editorialOfferChecks,
  validateEditedProducts,
} from "../../content/offer-checks.js";
import { awinService } from "../../awin/service.js";
import { adminUser as authenticatedUser } from "../auth.js";
import { settingsUpdateSchema } from "../../../shared/admin.js";
import { stableListingId } from "../../products/catalog.js";
import { randomUUID } from "node:crypto";
import {
  mercadoLivreConnection,
  mercadoLivreCallback,
} from "../../content/mercado-livre.js";
const imageRegistries = (ctx: import("../registry.js").PluginContext) => ({
  ...ctx.content.snapshot().registries,
  products: (ctx.content.snapshot().registries.products || []).map((p) =>
    productImages(ctx).resolve(p),
  ),
});
async function validateImages(
  ctx: import("../registry.js").PluginContext,
  products: import("../../../shared/content.js").EditorialProduct[] = [],
) {
  for (const product of products) {
    if (
      product.image?.url &&
      Date.parse(productImageSchema.parse(product.image).checkedAt) >
        Date.now() + 60000
    )
      throw new AdminError("VALIDATION_ERROR", "Data da imagem inválida.");
    if (product.image && ["upload", "web"].includes(product.image.source))
      await productImages(ctx).validateFile(
        productImageSchema.parse(product.image),
      );
  }
}
function cacheSelectedImages(
  ctx: import("../registry.js").PluginContext,
  products: import("../../../shared/content.js").EditorialProduct[] = [],
) {
  for (const product of products)
    if (product.image?.source.endsWith("-api") && product.image.url) {
      const saved = ctx.content
        .snapshot()
        .registries.products?.find((p) => p.id === product.id);
      if (saved)
        productImages(ctx).cache(
          saved,
          productImageSchema.parse(product.image),
        );
    }
}
export const postsPlugin: AdminPluginDefinition = {
  migrations: [
    productImageMigration,
    {
      id: "posts:001-offer-checks",
      sql: `CREATE TABLE editorial_offer_checks (
    id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, observation TEXT, next_at INTEGER NOT NULL,
    lease_owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, manual INTEGER NOT NULL DEFAULT 0
  ); CREATE INDEX editorial_offer_checks_due ON editorial_offer_checks(next_at,lease_until);
  CREATE TABLE editorial_offer_check_history (id INTEGER PRIMARY KEY, offer_id TEXT NOT NULL, status TEXT NOT NULL, stock TEXT NOT NULL, checked_at TEXT NOT NULL);
  CREATE INDEX editorial_offer_check_history_offer ON editorial_offer_check_history(offer_id,id);`,
    },
  ],
  settings: [
    {
      key: "posts.weeklyOfferChecks",
      schema: z.boolean(),
      defaultValue: false,
    },
  ],
  tasks: [
    { id: "posts.checkOffers", run: (ctx) => editorialOfferChecks(ctx).tick() },
  ],
  close: (ctx) => {
    editorialOfferChecks(ctx).close();
    productImages(ctx).close();
  },
  publicMiddleware: (ctx) => {
    editorialOfferChecks(ctx).start();
    productImages(ctx).start();
    return (req, res, next) => {
      if (
        req.path !== mercadoLivreCallback &&
        req.path !== "/integracoes/mercado-livre/resultado"
      )
        return next();
      res
        .set("Cache-Control", "no-store")
        .set("X-Robots-Tag", "noindex, nofollow")
        .set("Referrer-Policy", "no-referrer");
      if (req.path.endsWith("/resultado")) {
        res
          .type("html")
          .send(
            `<!doctype html><html lang="pt-BR"><head><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexão Mercado Livre — Geek Musical</title></head><body><h1>${req.query.status === "connected" && mercadoLivreConnection(ctx).status().connected ? "Conta conectada ao Geek Musical" : "Não foi possível concluir a conexão"}</h1><p>Volte à Administração para consultar o estado e as verificações de produtos.</p><a href="/gm-admin/posts">Voltar aos posts</a></body></html>`,
          );
        return;
      }
      const input = z
        .object({
          state: z.string().min(32).max(100),
          code: z.string().min(1).max(2000),
        })
        .safeParse(req.query);
      if (!input.success || ctx.web.environment !== "production") {
        res.redirect(303, "/integracoes/mercado-livre/resultado?status=failed");
        return;
      }
      void mercadoLivreConnection(ctx)
        .complete(input.data.state, input.data.code)
        .then(() => {
          res.redirect(
            303,
            "/integracoes/mercado-livre/resultado?status=connected",
          );
        })
        .catch(() => {
          res.redirect(
            303,
            "/integracoes/mercado-livre/resultado?status=failed",
          );
        });
    };
  },
  id: "posts",
  name: "Posts",
  description: "Artigos do blog, revisão editorial e metadados SEO.",
  version: "1.1.0",
  required: true,
  permissions: ["read", "create", "update", "delete", "publish"].map(
    (action) => ({
      id: "posts." + action,
      roles:
        action === "publish" || action === "delete"
          ? ["admin"]
          : ["admin", "editor"],
    }),
  ),
  pages: [
    {
      label: "Posts",
      path: "/gm-admin/posts",
      page: "posts",
      permission: "posts.read",
      icon: "FileText",
      position: 20,
    },
  ],
  widgets: [
    {
      id: "posts.published",
      label: "Posts publicados",
      permission: "posts.read",
      read: (ctx) =>
        ctx.content.snapshot().posts.filter((p) => p.status === "published")
          .length,
    },
    {
      id: "posts.drafts",
      label: "Rascunhos",
      permission: "posts.read",
      read: (ctx) =>
        ctx.content.snapshot().posts.filter((p) => p.status === "draft").length,
    },
    {
      id: "posts.review",
      label: "Em revisão",
      permission: "posts.read",
      read: (ctx) =>
        ctx.content.snapshot().posts.filter((p) => p.status === "review")
          .length,
    },
  ],
  api: [
    {
      method: "get",
      path: "/posts/product-images",
      permission: "posts.read",
      handle: (ctx, _req, res) =>
        res.json({
          products: (ctx.content.snapshot().registries.products || []).map(
            (p) => productImages(ctx).resolve(p),
          ),
        }),
    },
    {
      method: "post",
      path: "/posts/product-images/lookup",
      permission: "posts.update",
      handle: async (ctx, req, res) => {
        const input = z
          .object({ product: editorialProductSchema })
          .strict()
          .parse(req.body);
        res.json(
          await productImages(ctx).lookup(
            input.product,
            AbortSignal.timeout(20000),
          ),
        );
      },
    },
    {
      method: "post",
      path: "/posts/product-images/resolve",
      permission: "posts.publish",
      handle: async (ctx, req, res) => {
        const input = z
          .object({ productId: z.string().max(100) })
          .strict()
          .parse(req.body);
        const product = ctx.content
          .snapshot()
          .registries.products?.find((p) => p.id === input.productId);
        if (!product)
          throw new AdminError("NOT_FOUND", "Produto não encontrado.");
        const current = productImages(ctx).resolve(product).image;
        if (current)
          return res.json({
            image: current,
            candidates: [current],
            notes: [],
            cached: true,
          });
        const result = await productImages(ctx).lookup(
          product,
          AbortSignal.timeout(20000),
        );
        const image = result.candidates[0];
        if (image) productImages(ctx).cache(product, image);
        res.json({ ...result, image: image || null, cached: false });
      },
    },
    {
      method: "post",
      path: "/posts/product-images/resolve-batch",
      permission: "posts.publish",
      handle: async (ctx, req, res) => {
        const input = z
          .object({
            productIds: z.array(z.string().min(1).max(100)).min(1).max(20),
          })
          .strict()
          .parse(req.body);
        res.json(
          await productImages(ctx).resolveBatch(
            input.productIds,
            AbortSignal.timeout(35000),
          ),
        );
      },
    },
    {
      method: "post",
      path: "/posts/product-images/upload",
      permission: "posts.update",
      handle: async (ctx, req, res) => {
        const input = z
          .object({
            data: z
              .string()
              .min(4)
              .max(4200000)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
            alt: z.string().min(3).max(300),
          })
          .strict()
          .parse(req.body);
        if (Buffer.from(input.data, "base64").length > 3 * 1024 * 1024)
          throw new AdminError(
            "VALIDATION_ERROR",
            "Envie uma imagem de até 3 MB.",
          );
        res.status(201).json({
          image: await productImages(ctx).store(
            Buffer.from(input.data, "base64"),
            input.alt,
            "upload",
          ),
        });
      },
    },
    {
      method: "post",
      path: "/posts/product-images/import",
      permission: "posts.update",
      handle: async (ctx, req, res) => {
        const input = z
          .object({ url: z.url().max(2000), alt: z.string().min(3).max(300) })
          .strict()
          .parse(req.body);
        res.status(201).json({
          image: await productImages(ctx).importUrl(
            input.url,
            input.alt,
            AbortSignal.timeout(20000),
          ),
        });
      },
    },
    {
      method: "post",
      path: "/posts/product-images/cache",
      permission: "posts.publish",
      handle: async (ctx, req, res) => {
        const input = z
          .object({
            productId: z.string().max(100),
            image: productImageSchema,
            approved: z.literal(true),
          })
          .strict()
          .parse(req.body);
        const product = ctx.content
          .snapshot()
          .registries.products?.find((p) => p.id === input.productId);
        if (!product)
          throw new AdminError("NOT_FOUND", "Produto não encontrado.");
        if (["upload", "web"].includes(input.image.source))
          await productImages(ctx).validateFile(input.image);
        res.json({ image: productImages(ctx).cache(product, input.image) });
      },
    },
    {
      method: "get",
      path: "/posts/mercado-livre",
      permission: "posts.read",
      handle: (ctx, _req, res) =>
        res.json(mercadoLivreConnection(ctx).status()),
    },
    {
      method: "post",
      path: "/posts/mercado-livre/connect",
      permission: "posts.publish",
      handle: (ctx, req, res) => {
        z.object({}).strict().parse(req.body);
        res.json({ url: mercadoLivreConnection(ctx).begin(adminUser(res).id) });
      },
    },
    {
      method: "get",
      path: "/posts/:id/affiliate-links",
      permission: "posts.read",
      handle: (ctx, req, res) => {
        if (!ctx.content.snapshot().posts.some((p) => p.id === req.params.id))
          throw new AdminError("NOT_FOUND", "Artigo não encontrado.");
        res.json(editorialOfferChecks(ctx).overview(String(req.params.id)));
      },
    },
    {
      method: "post",
      path: "/posts/:id/check-links",
      permission: "posts.update",
      handle: (ctx, req, res) => {
        if (!ctx.content.snapshot().posts.some((p) => p.id === req.params.id))
          throw new AdminError("NOT_FOUND", "Artigo não encontrado.");
        z.object({}).strict().parse(req.body);
        const count = editorialOfferChecks(ctx).queue(String(req.params.id));
        ctx.db.audit(
          authenticatedUser(res).id,
          "QUEUE_OFFER_CHECKS",
          "posts",
          String(req.params.id),
        );
        res.status(202).json({ count });
      },
    },
    {
      method: "put",
      path: "/posts/offer-settings",
      permission: "posts.publish",
      handle: (ctx, req, res) => {
        const input = settingsUpdateSchema.parse(req.body);
        res.json(
          ctx.settings.update(
            "posts",
            input.revision,
            input.values,
            authenticatedUser(res).id,
          ),
        );
      },
    },
    {
      method: "get",
      path: "/posts/awin-catalog",
      permission: "posts.read",
      handle: (ctx, req, res) => {
        const input = z
          .object({ q: z.string().min(2).max(150) })
          .strict()
          .parse(req.query);
        const s = awinService(ctx);
        const items = s.repository
          .records(input.q, 30, undefined, true)
          .filter((item) => s.canPublish(item.listingKey));
        res.json({
          items: items
            .map((item) => {
              const catalogId = stableListingId("awin", item.listingKey);
              return {
                variant: item.variant,
                model: item.model,
                brand: item.brand,
                offer: {
                  id: "O-" + randomUUID(),
                  store: "awin",
                  url: s.destination(catalogId),
                  productUrl: item.originalUrl,
                  title: item.name,
                  checkedAt:
                    item.sourceUpdatedAt ||
                    item.feedUpdatedAt ||
                    item.importedAt,
                  method: "awin-feed",
                  tracking: String(s.config.publisherId),
                  awin: {
                    catalogId,
                    publisherId: s.config.publisherId,
                    advertiserId: item.advertiserId,
                    storeName: s.repository.advertiser(item.advertiserId)!.name,
                  },
                },
              };
            })
            .filter((item) => item.offer.url),
        });
      },
    },
    {
      method: "get",
      path: "/posts",
      permission: "posts.read",
      handle: (ctx, req, res) => {
        const input = listSchema.parse(req.query);
        ctx.content.refresh();
        const all = ctx.content
          .snapshot()
          .posts.filter(
            (p) =>
              (!input.q ||
                (p.title + " " + p.id)
                  .toLocaleLowerCase("pt-BR")
                  .includes(input.q.toLocaleLowerCase("pt-BR"))) &&
              (!input.status || p.status === input.status) &&
              (!input.categoryId || p.categoryId === input.categoryId),
          );
        const items = all
          .slice((input.page - 1) * 15, input.page * 15)
          .map(({ body: _body, sources: _sources, ...post }) => post);
        res.json({
          items,
          total: all.length,
          page: input.page,
          pages: Math.max(1, Math.ceil(all.length / 15)),
          revision: ctx.content.revision,
          categories: ctx.content.snapshot().registries.categories,
        });
      },
    },
    {
      method: "get",
      path: "/posts/new",
      permission: "posts.create",
      handle: (ctx, _req, res) => {
        ctx.content.refresh();
        res.json({
          post: newPost(ctx.content),
          registries: imageRegistries(ctx),
          publishedProductIds: [
            ...new Set(
              ctx.content
                .snapshot()
                .posts.filter((p) => p.status === "published")
                .flatMap((p) => p.productIds || []),
            ),
          ],
          revision: ctx.content.revision,
        });
      },
    },
    {
      method: "get",
      path: "/posts/:id",
      permission: "posts.read",
      handle: (ctx, req, res) => {
        ctx.content.refresh();
        const post = ctx.content
          .snapshot()
          .posts.find((p) => p.id === req.params.id);
        if (!post) throw new AdminError("NOT_FOUND", "Artigo não encontrado.");
        res.json({
          post,
          registries: imageRegistries(ctx),
          publishedProductIds: [
            ...new Set(
              ctx.content
                .snapshot()
                .posts.filter((p) => p.status === "published")
                .flatMap((p) => p.productIds || []),
            ),
          ],
          revision: ctx.content.revision,
        });
      },
    },
    {
      method: "post",
      path: "/posts",
      permission: "posts.create",
      handle: async (ctx, req, res) => {
        const input = savePostSchema.parse(req.body);
        await validateImages(ctx, input.products);
        const post = savePost(
          ctx.content,
          adminUser(res),
          input.revision,
          input.post,
          input.approvePublication,
          true,
          validateEditedProducts(ctx, input.products),
        );
        cacheSelectedImages(ctx, input.products);
        res.status(201).json({
          post,
          revision: ctx.content.revision,
          products: imageRegistries(ctx).products,
        });
      },
    },
    {
      method: "post",
      path: "/posts/preview",
      permission: "posts.read",
      handle: (ctx, req, res) => {
        const input = z
          .object({
            post: postInputSchema,
            products: z.array(editorialProductSchema).max(100).optional(),
          })
          .strict()
          .parse(req.body);
        try {
          references(input.post.body, input.post);
        } catch {
          throw new AdminError(
            "VALIDATION_ERROR",
            "Markdown inválido. Use H2/H3 e links post:ID ou source:id, sem HTML ou imagens inline.",
          );
        }
        const edited = validateEditedProducts(ctx, input.products);
        if (edited.some((p) => !input.post.productIds?.includes(p.id)))
          throw new AdminError(
            "VALIDATION_ERROR",
            "A prévia aceita somente produtos associados a este artigo.",
          );
        res.json({
          html: renderMarkdown(
            input.post,
            (id) => ctx.content.catalog(true).resolvePost(id),
            (id) => {
              const product = edited.find((p) => p.id === id);
              const submitted = input.products?.find((p) => p.id === id);
              return product
                ? editorialOfferChecks(ctx).resolve({
                    ...product,
                    image:
                      submitted?.image === null
                        ? null
                        : submitted?.image?.url
                          ? submitted.image
                          : productImages(ctx).resolve(product).image,
                  })
                : ctx.content.catalog(true).resolveProduct(id);
            },
          ).html,
        });
      },
    },
    {
      method: "post",
      path: "/posts/bulk",
      permission: "posts.update",
      handle: (ctx, req, res) => {
        const input = bulkPostSchema.parse(req.body);
        changePostStatuses(
          ctx.content,
          adminUser(res),
          input.revision,
          input.ids,
          input.status,
        );
        res.json({ revision: ctx.content.revision });
      },
    },
    {
      method: "put",
      path: "/posts/:id",
      permission: "posts.update",
      handle: async (ctx, req, res) => {
        const input = savePostSchema.parse(req.body);
        await validateImages(ctx, input.products);
        if (req.params.id !== input.post.id)
          throw new AdminError("VALIDATION_ERROR", "O ID do artigo é estável.");
        const post = savePost(
          ctx.content,
          adminUser(res),
          input.revision,
          input.post,
          input.approvePublication,
          false,
          validateEditedProducts(ctx, input.products),
        );
        cacheSelectedImages(ctx, input.products);
        res.json({
          post,
          revision: ctx.content.revision,
          products: imageRegistries(ctx).products,
        });
      },
    },
    {
      method: "delete",
      path: "/posts/:id",
      permission: "posts.delete",
      handle: (ctx, req, res) => {
        const input = deleteSchema.parse(req.body);
        deletePost(
          ctx.content,
          adminUser(res),
          input.revision,
          String(req.params.id),
        );
        res.json({ revision: ctx.content.revision });
      },
    },
  ],
};
