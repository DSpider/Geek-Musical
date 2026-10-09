import { createHash } from "node:crypto";
import { mkdir, readFile, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Express } from "express";
import type { PluginContext } from "../admin/registry.js";
import { AdminError } from "../admin/errors.js";
import { AmazonProvider } from "../providers/amazon/index.js";
import { ShopeeProvider } from "../providers/shopee/index.js";
import { mercadoLivreConnection } from "./mercado-livre.js";
import { productIdentity } from "./offer-checks.js";
import {
  currentProductImage,
  productImageSchema,
  type ProductImage,
  type ProductImageReference,
} from "../../shared/product-image.js";
import type { EditorialProduct } from "../../shared/content.js";
import { readImageSource } from "../lib/remote-image.js";
import { config } from "../config.js";
import { BLOG_AMAZON_TAG } from "../../shared/home.js";

export const productImageMigration = {
  id: "posts:002-product-images",
  sql: "CREATE TABLE editorial_product_images (product_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, image TEXT NOT NULL, updated_at TEXT NOT NULL);",
};
const fingerprint = (product: EditorialProduct) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        product.id,
        product.name,
        product.offers.map((o) => [o.store, o.productUrl]).sort(),
      ]),
    )
    .digest("hex");
const instances = new WeakMap<PluginContext, ProductImages>();
export function assertProductImageMatches(
  product: EditorialProduct,
  image: ProductImage | ProductImageReference,
) {
  if (!image.source.endsWith("-api")) return;
  const store = (
    {
      "amazon-api": "amazon",
      "shopee-api": "shopee",
      "meli-api": "mercado-livre",
    } as Record<string, string>
  )[image.source];
  if (
    !image.sourceUrl ||
    !product.offers.some(
      (o) =>
        o.store === store &&
        (o.productUrl === image.sourceUrl ||
          (store !== "mercado-livre" &&
            productIdentity(store, o.productUrl) &&
            productIdentity(store, o.productUrl) ===
              productIdentity(store, image.sourceUrl!))),
    )
  )
    throw new AdminError(
      "VALIDATION_ERROR",
      "A imagem da API deve corresponder a uma oferta deste produto.",
    );
}
export function productImages(ctx: PluginContext) {
  let service = instances.get(ctx);
  if (!service) {
    service = new ProductImages(ctx);
    instances.set(ctx, service);
  }
  return service;
}

export class ProductImages {
  private amazon = new AmazonProvider();
  private shopee = new ShopeeProvider();
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private lastMirror = 0;
  private controller = new AbortController();
  constructor(
    readonly ctx: PluginContext,
    readonly now = () => Date.now(),
  ) {}
  cache(product: EditorialProduct, image: ProductImage) {
    const parsed = productImageSchema.parse(image);
    assertProductImageMatches(product, parsed);
    if (Date.parse(parsed.checkedAt) > this.now() + 60000)
      throw new AdminError("VALIDATION_ERROR", "Data da imagem inválida.");
    this.ctx.db.sql
      .prepare(
        "INSERT INTO editorial_product_images VALUES(?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET fingerprint=excluded.fingerprint,image=excluded.image,updated_at=excluded.updated_at",
      )
      .run(
        product.id,
        fingerprint(product),
        JSON.stringify(parsed),
        new Date(this.now()).toISOString(),
      );
    return parsed;
  }
  resolve(product: EditorialProduct) {
    if (product.image === null) return product;
    if (product.image && ["upload", "web"].includes(product.image.source))
      return product;
    const row = this.ctx.db.sql
      .prepare(
        "SELECT image FROM editorial_product_images WHERE product_id=? AND fingerprint=?",
      )
      .get(product.id, fingerprint(product)) as { image: string } | undefined;
    const result = row && productImageSchema.safeParse(JSON.parse(row.image));
    const image = currentProductImage(
      result && result.success ? result.data : product.image,
      this.now(),
    );
    return { ...product, image };
  }
  async lookup(product: EditorialProduct, signal: AbortSignal) {
    const candidates: ProductImage[] = [],
      notes: string[] = [];
    for (const offer of product.offers) {
      try {
        let url: string | null | undefined;
        let source: ProductImage["source"];
        if (offer.store === "amazon") {
          const id = productIdentity("amazon", offer.productUrl);
          if (!id) continue;
          url = (await this.amazon.getItems([id], signal, BLOG_AMAZON_TAG))[0]
            ?.product.image;
          source = "amazon-api";
        } else if (offer.store === "shopee") {
          const id = productIdentity("shopee", offer.productUrl);
          if (!id) continue;
          const [shop, item] = id.split(":");
          url = (await this.shopee.lookup(shop, item, signal))?.image;
          source = "shopee-api";
        } else if (offer.store === "mercado-livre") {
          url = await mercadoLivreConnection(this.ctx).productImage(
            offer.productUrl,
            signal,
          );
          source = "meli-api";
        } else continue;
        if (url)
          candidates.push(
            productImageSchema.parse({
              url,
              source,
              alt: product.name,
              sourceUrl: offer.productUrl,
              checkedAt: new Date(this.now()).toISOString(),
            }),
          );
        else
          notes.push(
            `${offer.store}: a API não retornou imagem para este anúncio.`,
          );
      } catch {
        notes.push(
          `${offer.store}: imagem indisponível na API. Pesquise na web ou envie um arquivo.`,
        );
      }
      if (signal.aborted) break;
    }
    return { candidates, notes };
  }
  async resolveBatch(ids: string[], signal: AbortSignal) {
    const products = (
      this.ctx.content.snapshot().registries.products || []
    ).filter((p) => ids.includes(p.id));
    const pending = products.filter(
      (p) =>
        p.image !== null &&
        !currentProductImage(this.resolve(p).image, this.now()),
    );
    const asins = [
      ...new Set(
        pending.flatMap((p) =>
          p.offers
            .filter((o) => o.store === "amazon")
            .map((o) => productIdentity("amazon", o.productUrl))
            .filter((id): id is string => !!id),
        ),
      ),
    ];
    const notes: string[] = [];
    for (
      let offset = 0;
      offset < asins.length && !signal.aborted;
      offset += 10
    ) {
      try {
        const found = await this.amazon.getItems(
          asins.slice(offset, offset + 10),
          signal,
          BLOG_AMAZON_TAG,
        );
        for (const item of found)
          for (const product of pending) {
            const offer = product.offers.find(
              (o) =>
                o.store === "amazon" &&
                productIdentity("amazon", o.productUrl) === item.sourceId,
            );
            if (offer && item.product.image)
              this.cache(product, {
                url: item.product.image,
                source: "amazon-api",
                sourceUrl: offer.productUrl,
                alt: product.name,
                checkedAt: new Date(this.now()).toISOString(),
              });
          }
      } catch {
        notes.push("Amazon: parte das imagens não foi retornada pela API.");
      }
    }
    for (const product of pending) {
      if (signal.aborted) break;
      if (currentProductImage(this.resolve(product).image, this.now()))
        continue;
      const result = await this.lookup(
        {
          ...product,
          offers: product.offers.filter((o) => o.store !== "amazon"),
        },
        signal,
      );
      notes.push(...result.notes);
      if (result.candidates[0]) this.cache(product, result.candidates[0]);
    }
    return { products: products.map((p) => this.resolve(p)), notes };
  }
  async store(
    data: Buffer,
    alt: string,
    source: "upload" | "web",
    sourceUrl?: string,
  ) {
    if (!data.length || data.length > 4 * 1024 * 1024)
      throw new AdminError("VALIDATION_ERROR", "Envie uma imagem de até 4 MB.");
    try {
      const decoder = sharp(data, {
        limitInputPixels: 20000000,
        animated: false,
        failOn: "warning",
      });
      const meta = await decoder.metadata();
      if (
        !["jpeg", "png", "webp"].includes(meta.format || "") ||
        (meta.pages || 1) > 1
      )
        throw new Error("format");
      const { data: bytes, info } = await decoder
        .rotate()
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 90 })
        .toBuffer({ resolveWithObject: true });
      const hash = createHash("sha256").update(bytes).digest("hex");
      const directory = path.join(this.ctx.content.root, "product-images");
      await mkdir(directory, { recursive: true, mode: 0o755 });
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error("storage");
      try {
        await writeFile(path.join(directory, hash + ".webp"), bytes, {
          flag: "wx",
          mode: 0o644,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      return productImageSchema.parse({
        url: `/images/products/${hash}.webp`,
        alt,
        width: info.width,
        height: info.height,
        source,
        ...(sourceUrl ? { sourceUrl } : {}),
        checkedAt: new Date(this.now()).toISOString(),
      });
    } catch {
      throw new AdminError(
        "VALIDATION_ERROR",
        "Não foi possível ler a imagem. Use PNG, JPEG ou WebP válido, sem animação.",
      );
    }
  }
  async importUrl(url: string, alt: string, signal: AbortSignal) {
    const host = new URL(url).hostname;
    if (
      /(?:^|\.)(?:media-amazon\.com|ssl-images-amazon\.com|amazon\.com\.br)$/.test(
        host,
      )
    )
      throw new AdminError(
        "VALIDATION_ERROR",
        "Use a consulta à API para imagens da Amazon ou envie uma foto própria/do fabricante.",
      );
    try {
      const image = await readImageSource(url, signal);
      return await this.store(image.data, alt, "web", image.url);
    } catch {
      throw new AdminError(
        "VALIDATION_ERROR",
        "Não foi possível importar a imagem. Use uma URL HTTPS pública de PNG, JPEG ou WebP, ou envie o arquivo.",
      );
    }
  }
  async validateFile(image: ProductImage) {
    const hash = image.url.match(
      /^\/images\/products\/([a-f0-9]{64})\.webp$/,
    )?.[1];
    if (!hash)
      throw new AdminError("VALIDATION_ERROR", "Arquivo de imagem inválido.");
    const file = path.join(
      this.ctx.content.root,
      "product-images",
      hash + ".webp",
    );
    try {
      const stat = await lstat(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 4 * 1024 * 1024
      )
        throw new Error("file");
      const bytes = await readFile(file);
      if (createHash("sha256").update(bytes).digest("hex") !== hash)
        throw new Error("hash");
    } catch {
      throw new AdminError(
        "VALIDATION_ERROR",
        "Envie a imagem antes de associá-la ao produto.",
      );
    }
  }
  manifest() {
    const ids = new Set(
      this.ctx.content
        .snapshot()
        .posts.filter((p) => p.status === "published")
        .flatMap((p) => p.productIds || []),
    );
    return (this.ctx.content.snapshot().registries.products || [])
      .filter((p) => ids.has(p.id))
      .flatMap((p) => {
        const image = currentProductImage(this.resolve(p).image, this.now());
        return image
          ? [{ id: p.id, name: p.name, fingerprint: fingerprint(p), image }]
          : [];
      });
  }
  async tick() {
    if (this.busy || this.controller.signal.aborted) return;
    this.busy = true;
    try {
      this.ctx.db.sql
        .prepare(
          "UPDATE editorial_product_images SET image=json_remove(image,'$.url','$.checkedAt','$.width','$.height') WHERE json_extract(image,'$.source')='amazon-api' AND json_extract(image,'$.checkedAt')<=?",
        )
        .run(new Date(this.now() - 86400000).toISOString());
      if (this.ctx.web.environment !== "production") {
        if (this.now() - this.lastMirror < 15 * 60000) return;
        this.lastMirror = this.now();
        // Public image metadata only: credentials, unpublished products and bodies never travel.
        const response = await fetch(
          "https://www.geekmusical.com.br/images/products/manifest.json",
          {
            signal: AbortSignal.any([
              this.controller.signal,
              AbortSignal.timeout(8000),
            ]),
            redirect: "error",
          },
        );
        if (
          !response.ok ||
          Number(response.headers.get("content-length")) > 400000
        )
          return;
        const text = await response.text();
        if (text.length > 400000) return;
        const manifest = JSON.parse(text) as Array<{
          id: string;
          name: string;
          fingerprint: string;
          image: unknown;
        }>;
        if (!Array.isArray(manifest) || manifest.length > 2000) return;
        const products = this.ctx.content.snapshot().registries.products || [];
        for (const record of manifest) {
          const product = products.find(
            (p) => p.id === record.id && p.name === record.name,
          );
          const image = productImageSchema.safeParse(record.image);
          if (product && image.success) {
            try {
              if (["web", "upload"].includes(image.data.source)) {
                try {
                  await this.validateFile(image.data);
                } catch {
                  const downloaded = await readImageSource(
                    "https://www.geekmusical.com.br" + image.data.url,
                    AbortSignal.any([
                      this.controller.signal,
                      AbortSignal.timeout(10000),
                    ]),
                  );
                  const hash = createHash("sha256")
                    .update(downloaded.data)
                    .digest("hex");
                  if (image.data.url !== `/images/products/${hash}.webp`)
                    continue;
                  const directory = path.join(
                    this.ctx.content.root,
                    "product-images",
                  );
                  await mkdir(directory, { recursive: true, mode: 0o755 });
                  if ((await lstat(directory)).isSymbolicLink()) continue;
                  await writeFile(
                    path.join(directory, hash + ".webp"),
                    downloaded.data,
                    { flag: "wx", mode: 0o644 },
                  ).catch((error) => {
                    if (error.code !== "EEXIST") throw error;
                  });
                }
              }
              this.cache(product, image.data);
            } catch {
              /* A different offer needs its own image review. */
            }
          }
        }
        return;
      }
      if (!this.amazon.configured() || config.fixtures) return;
      const products = (this.ctx.content.snapshot().registries.products || [])
        .filter((p) => {
          if (p.image === null) return false;
          const image = currentProductImage(this.resolve(p).image, this.now());
          const stored =
            p.image?.source === "amazon-api" ||
            this.ctx.db.sql
              .prepare(
                "SELECT image FROM editorial_product_images WHERE product_id=?",
              )
              .get(p.id);
          return (
            stored &&
            (!image ||
              (image.source === "amazon-api" &&
                this.now() - Date.parse(image.checkedAt) > 12 * 3600000)) &&
            !["web", "upload"].includes(p.image?.source || "")
          );
        })
        .slice(0, 10);
      const ids = [
        ...new Set(
          products.flatMap((p) =>
            p.offers
              .filter((o) => o.store === "amazon")
              .map((o) => productIdentity("amazon", o.productUrl))
              .filter((id): id is string => !!id),
          ),
        ),
      ].slice(0, 10);
      if (!ids.length) return;
      const found = await this.amazon.getItems(
        ids,
        AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]),
        BLOG_AMAZON_TAG,
      );
      for (const item of found)
        for (const product of products) {
          const offer = product.offers.find(
            (o) =>
              o.store === "amazon" &&
              productIdentity("amazon", o.productUrl) === item.sourceId,
          );
          if (offer && item.product.image)
            this.cache(product, {
              url: item.product.image,
              alt: product.name,
              source: "amazon-api",
              sourceUrl: offer.productUrl,
              checkedAt: new Date(this.now()).toISOString(),
            });
        }
    } finally {
      this.busy = false;
    }
  }
  start() {
    if (!this.timer) {
      if (
        process.env.NODE_ENV !== "test" &&
        this.ctx.web.environment !== "production"
      )
        void this.tick().catch(() => {});
      this.timer = setInterval(() => {
        void this.tick().catch(() => {});
      }, 60000);
      this.timer.unref();
    }
  }
  close() {
    clearInterval(this.timer);
    this.controller.abort();
  }
}

export function mountProductImages(
  app: Express,
  root: string,
  images?: ProductImages,
) {
  app.get("/images/products/manifest.json", (_req, res) =>
    res
      .set("Cache-Control", "public, max-age=300")
      .set("X-Robots-Tag", "noindex")
      .json(images?.manifest() || []),
  );
  app.get(/^\/images\/products\/([a-f0-9]{64})\.webp$/, async (req, res) => {
    const file = path.join(root, "product-images", req.params[0] + ".webp");
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) return res.sendStatus(404);
      const bytes = await readFile(file);
      res
        .set("Cache-Control", "public, max-age=31536000, immutable")
        .type("image/webp")
        .send(bytes);
    } catch {
      res.sendStatus(404);
    }
  });
}
