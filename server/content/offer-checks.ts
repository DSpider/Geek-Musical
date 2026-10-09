import { randomUUID } from "node:crypto";
import type {
  EditorialOffer,
  EditorialProduct,
  OfferPublicState,
  Post,
} from "../../shared/content.js";
import type {
  EditorialCheck,
  PostAffiliateStatus,
} from "../../shared/affiliate.js";
import type { PluginContext } from "../admin/registry.js";
import { digest } from "../admin/database.js";
import { config } from "../config.js";
import { BLOG_AMAZON_TAG } from "../../shared/home.js";
import { AmazonProvider } from "../providers/amazon/index.js";
import { ShopeeProvider } from "../providers/shopee/index.js";
import { ProviderError } from "../lib/http.js";
import { safeUrl } from "../products/normalize.js";
import { awinService } from "../awin/service.js";
import { affiliateStore } from "./affiliate.js";
import { mercadoLivreConnection } from "./mercado-livre.js";
import { AdminError } from "../admin/errors.js";
import { productImages, assertProductImageMatches } from "./product-images.js";
import { currentProductImage } from "../../shared/product-image.js";
import { editorialProductDestination } from "./affiliate-destination.js";

const week = 7 * 86400000;
export type CheckOffer = Pick<
  EditorialOffer,
  "id" | "store" | "url" | "productUrl" | "awin"
>;
export interface Observation {
  status: string;
  stock: "in_stock" | "out_of_stock" | "unknown";
  checkedAt: string;
  validUntil: string | null;
  url?: string;
}
export const offerFingerprint = (offer: CheckOffer) =>
  digest(
    JSON.stringify({
      id: offer.id,
      store: offer.store,
      url: offer.url,
      productUrl: offer.productUrl,
      awin: offer.awin || null,
    }),
  );
export function productIdentity(store: string, value: string) {
  try {
    const url = new URL(value);
    if (affiliateStore(value) !== store) return null;
    if (store === "amazon")
      return (
        url.pathname
          .match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]
          .toUpperCase() || null
      );
    if (store === "shopee") {
      const match = url.pathname.match(
        /\/product\/(\d+)\/(\d+)(?:\/|$)|-i\.(\d+)\.(\d+)$/,
      );
      return match ? `${match[1] || match[3]}:${match[2] || match[4]}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
export function validateEditedProducts(
  ctx: PluginContext,
  products: EditorialProduct[] = [],
) {
  for (const product of products)
    if (product.image) assertProductImageMatches(product, product.image);
  const saved = new Map(
    (ctx.content.snapshot().registries.products || []).flatMap((p) =>
      p.offers.map((o) => [o.id, o] as const),
    ),
  );
  return products.map((product) => ({
    ...product,
    ...(product.image?.source.endsWith("-api") && product.image.url
      ? {
          image: (() => {
            if (!currentProductImage(product.image))
              throw new AdminError(
                "VALIDATION_ERROR",
                "Consulte novamente a imagem da loja antes de salvar.",
              );
            return {
              source: product.image.source as
                "amazon-api" | "shopee-api" | "meli-api",
              sourceUrl: product.image.sourceUrl!,
              alt: product.image.alt,
            };
          })(),
        }
      : {}),
    offers: product.offers.map((offer) => {
      if (JSON.stringify(saved.get(offer.id)) === JSON.stringify(offer))
        return offer;
      if (offer.store === "awin") {
        const service = awinService(ctx),
          meta = offer.awin;
        const record =
          meta?.publisherId === service.config.publisherId &&
          service.repository
            .byCatalogId([meta.catalogId])
            .find(
              (r) =>
                r.advertiserId === meta.advertiserId &&
                r.originalUrl === offer.productUrl &&
                service.canPublish(r.listingKey),
            );
        if (
          !record ||
          service.destination(meta!.catalogId) !== offer.url ||
          service.repository.advertiser(meta!.advertiserId)?.name !==
            meta!.storeName
        )
          throw new AdminError(
            "VALIDATION_ERROR",
            "Selecione uma oferta elegível do catálogo Awin, com a conta e a loja configuradas.",
          );
      }
      if (offer.store === "amazon") {
        const id = productIdentity("amazon", offer.productUrl);
        const affiliateId = productIdentity("amazon", offer.url);
        if (
          !config.amazon.tag ||
          !id ||
          id !== affiliateId ||
          ![BLOG_AMAZON_TAG, config.amazon.tag].includes(
            new URL(offer.url).searchParams.get("tag") || "",
          )
        )
          throw new AdminError(
            "VALIDATION_ERROR",
            "Use o link Amazon do mesmo anúncio, com a identificação de afiliado configurada no backend.",
          );
        return {
          ...offer,
          tracking: new URL(offer.url).searchParams.get("tag")!,
        };
      }
      return offer;
    }),
  }));
}

export class EditorialOfferChecks {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private draining = false;
  private closed = false;
  private controller = new AbortController();
  private amazon = new AmazonProvider();
  private shopee = new ShopeeProvider();
  constructor(
    readonly ctx: PluginContext,
    readonly check = (offer: CheckOffer, signal: AbortSignal) =>
      this.observe(offer, signal),
    readonly now = () => Date.now(),
  ) {}
  offers(postId?: string, includeUnpublished = false): CheckOffer[] {
    const state = this.ctx.content.snapshot();
    const posts = state.posts.filter((post) =>
      postId
        ? post.id === postId
        : includeUnpublished
          ? post.status !== "archived"
          : post.status === "published",
    );
    const ids = new Set(posts.flatMap((post) => post.productIds || []));
    const result: CheckOffer[] = (state.registries.products || [])
      .filter((p) => ids.has(p.id))
      .flatMap((p) =>
        p.offers.map(({ id, store, url, productUrl, awin }) => ({
          id,
          store,
          url,
          productUrl,
          ...(awin ? { awin } : {}),
        })),
      );
    for (const post of posts)
      for (const link of post.links || []) {
        const store = affiliateStore(link.url);
        if (store && store !== "awin")
          result.push({
            id: `${post.id}:${link.id}`,
            store,
            url: link.url,
            productUrl: link.productUrl || link.url,
          });
      }
    return result;
  }
  seed(offers = this.offers()) {
    const insert = this.ctx.db.sql.prepare(
      `INSERT INTO editorial_offer_checks(id,fingerprint,next_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint,next_at=excluded.next_at,observation=NULL,attempts=0 WHERE editorial_offer_checks.fingerprint<>excluded.fingerprint`,
    );
    this.ctx.db.transaction(() => {
      for (const offer of offers)
        insert.run(offer.id, offerFingerprint(offer), this.now());
    });
  }
  queue(postId: string) {
    const offers = this.offers(postId);
    this.seed(offers);
    this.ctx.db.transaction(() => {
      for (const offer of offers)
        this.ctx.db.sql
          .prepare(
            "UPDATE editorial_offer_checks SET next_at=?,attempts=0,manual=1 WHERE id=? AND lease_until<?",
          )
          .run(this.now(), offer.id, this.now());
    });
    if (this.timer) void this.drainManual().catch(() => {});
    return offers.length;
  }
  private async drainManual() {
    if (this.draining || this.busy || this.closed) return;
    this.draining = true;
    try {
      while (
        !this.closed &&
        !this.busy &&
        this.ctx.db.sql
          .prepare(
            "SELECT 1 FROM editorial_offer_checks WHERE manual=1 AND next_at<=? AND lease_until<? LIMIT 1",
          )
          .get(this.now(), this.now())
      ) {
        await this.tick();
        if (!this.closed)
          await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      this.draining = false;
    }
  }
  state(offer: CheckOffer): Observation | undefined {
    const row = this.ctx.db.sql
      .prepare(
        "SELECT observation FROM editorial_offer_checks WHERE id=? AND fingerprint=?",
      )
      .get(offer.id, offerFingerprint(offer));
    return row?.observation
      ? (JSON.parse(String(row.observation)) as Observation)
      : undefined;
  }
  overview(postId: string): PostAffiliateStatus {
    const offers = this.offers(postId);
    this.seed(offers);
    const checks: EditorialCheck[] = offers.map((offer) => {
      const row = this.ctx.db.sql
        .prepare(
          "SELECT next_at,lease_until FROM editorial_offer_checks WHERE id=?",
        )
        .get(offer.id)!;
      const observed = this.state(offer);
      const expired =
        !!observed?.validUntil && Date.parse(observed.validUntil) <= this.now();
      const history = this.ctx.db.sql
        .prepare(
          "SELECT status,stock,checked_at FROM editorial_offer_check_history WHERE offer_id=? ORDER BY id DESC LIMIT 3",
        )
        .all(offer.id)
        .map((h) => ({
          status: String(h.status),
          stock: String(h.stock) as EditorialCheck["stock"],
          checkedAt: String(h.checked_at),
        }));
      return {
        id: offer.id,
        status:
          Number(row.lease_until) > this.now()
            ? "checking"
            : expired
              ? "expired"
              : observed?.status || "pending",
        stock: expired ? "unknown" : observed?.stock || "unknown",
        checkedAt: observed?.checkedAt || null,
        validUntil: observed?.validUntil || null,
        nextAt: new Date(Number(row.next_at)).toISOString(),
        updatedLink: !!observed?.url && observed.url !== offer.url,
        ...(observed?.url ? { currentUrl: observed.url } : {}),
        history,
      };
    });
    return {
      checks,
      weeklyEnabled: this.ctx.settings.get<boolean>("posts.weeklyOfferChecks"),
      settingsRevision: this.ctx.settings.revision("posts"),
      environment: this.ctx.web.environment || "development",
    };
  }
  awinObservation(offer: CheckOffer): Observation {
    const awin = awinService(this.ctx),
      meta = offer.awin;
    const record =
      meta?.publisherId === awin.config.publisherId
        ? awin.repository
            .byCatalogId([meta.catalogId])
            .find(
              (item) =>
                item.advertiserId === meta.advertiserId &&
                item.originalUrl === offer.productUrl &&
                awin.canPublish(item.listingKey),
            )
        : undefined;
    const url = record && awin.destination(meta!.catalogId);
    return {
      status: url && record ? "confirmed" : "restricted",
      stock: record ? record.availability : "unknown",
      checkedAt:
        record?.sourceUpdatedAt ||
        record?.feedUpdatedAt ||
        new Date(this.now()).toISOString(),
      validUntil: record?.validUntil || null,
      ...(url ? { url } : {}),
    };
  }
  resolve(product: EditorialProduct): EditorialProduct {
    const offerStates: Record<string, OfferPublicState> = {};
    for (const offer of product.offers) {
      const observed =
        offer.store === "awin"
          ? this.awinObservation(offer)
          : this.state(offer);
      if (!observed) continue;
      const current =
        !!observed.validUntil && Date.parse(observed.validUntil) > this.now();
      offerStates[offer.id] = {
        status: observed.status,
        stock: current ? observed.stock : "unknown",
        checkedAt: observed.checkedAt,
        // Stock observations use the live search provider. Keep the independently
        // reviewed editorial destination and tracking for the same Amazon item.
        ...(observed.url
          ? { url: offer.store === "amazon" ? offer.url : observed.url }
          : {}),
        blocked:
          (offer.store === "awin" && observed.status === "restricted") ||
          (current && observed.status === "unavailable"),
      };
    }
    return { ...product, offerStates };
  }
  resolvePost(post: Post): Post {
    const linkStates: Record<string, OfferPublicState> = {};
    for (const link of post.links || []) {
      const proof = this.ctx.db.sql
        .prepare("SELECT value FROM affiliate_evidence WHERE id=?")
        .get(digest(link.url));
      const evidence = proof ? JSON.parse(String(proof.value)) : null;
      if (evidence?.product === "incorrect") {
        linkStates[link.id] = {
          status: "product_incorrect",
          stock: "unknown",
          checkedAt: evidence.checkedAt || null,
          blocked: true,
        };
        continue;
      }
      const store = affiliateStore(link.url);
      if (!store || store === "awin") continue;
      const observed = this.state({
        id: `${post.id}:${link.id}`,
        store,
        url: link.url,
        productUrl: link.productUrl || link.url,
      });
      if (!observed) continue;
      const current =
        !!observed.validUntil && Date.parse(observed.validUntil) > this.now();
      linkStates[link.id] = {
        status: current ? observed.status : "expired",
        stock: current ? observed.stock : "unknown",
        checkedAt: observed.checkedAt,
        ...(observed.url ? { url: observed.url } : {}),
        blocked: current && observed.status === "unavailable",
      };
    }
    return { ...post, linkStates };
  }
  async observe(offer: CheckOffer, signal: AbortSignal): Promise<Observation> {
    const base: Observation = {
      status: "product_pending",
      stock: "unknown",
      checkedAt: new Date(this.now()).toISOString(),
      validUntil: null,
    };
    if (offer.store === "awin") return this.awinObservation(offer);
    if (config.fixtures || false) return { ...base, status: "fixtures" };
    if (offer.store === "magalu") return { ...base, status: "unsupported" };
    const productUrl = await editorialProductDestination(
      offer.productUrl,
      offer.store,
      signal,
    );
    if (!productUrl) return base;
    if (offer.store === "mercado-livre")
      return mercadoLivreConnection(this.ctx).observe(productUrl, signal);
    const id = productIdentity(offer.store, productUrl);
    if (!id) return base;
    if (offer.store === "amazon") {
      if (!this.amazon.configured())
        return { ...base, status: "credentials_pending" };
      const found = (
        await this.amazon.getItems([id], signal, BLOG_AMAZON_TAG)
      ).find((item) => item.sourceId === id);
      if (!found)
        return {
          ...base,
          status: "unavailable",
          validUntil: new Date(this.now() + 3600000).toISOString(),
        };
      const url = safeUrl(found.url, ["amazon.com.br"]);
      if (
        !url ||
        productIdentity("amazon", url) !== id ||
        new URL(url).searchParams.get("tag") !== BLOG_AMAZON_TAG
      )
        throw new ProviderError("invalid_destination");
      const editorialUrl = new URL(url);
      editorialUrl.searchParams.set("tag", BLOG_AMAZON_TAG);
      return {
        ...base,
        status:
          found.product.availability === "unknown"
            ? "offer_available"
            : "confirmed",
        stock: found.product.availability,
        url: editorialUrl.href,
        validUntil: new Date(this.now() + 3600000).toISOString(),
      };
    }
    if (!this.shopee.configured())
      return { ...base, status: "credentials_pending" };
    const [shopId, itemId] = id.split(":");
    const found = await this.shopee.lookup(shopId, itemId, signal);
    if (!found)
      return {
        ...base,
        status: "unavailable",
        validUntil: new Date(this.now() + 300000).toISOString(),
      };
    const previous = this.state(offer);
    // Generate once per exact source and retain the tracked URL between stock checks.
    const url = previous?.url || offer.url;
    if (affiliateStore(url) !== "shopee")
      throw new ProviderError("invalid_destination");
    return {
      ...base,
      status: "offer_available",
      stock: "unknown",
      url,
      validUntil: new Date(this.now() + 300000).toISOString(),
    };
  }
  async tick() {
    if (this.busy || this.closed) return;
    this.busy = true;
    let claimed:
      { offer: CheckOffer; owner: string; attempts: number } | undefined;
    try {
      const offers = this.offers();
      this.seed(offers);
      const byId = new Map(
        this.offers(undefined, true).map((offer) => [offer.id, offer]),
      );
      this.ctx.db.transaction(() => {
        const enabled = this.ctx.settings.get<boolean>(
          "posts.weeklyOfferChecks",
        );
        const published = [...new Set(offers.map((offer) => offer.id))];
        const slots = published.length
          ? published.map(() => "?").join(",")
          : "NULL";
        const row = this.ctx.db.sql
          .prepare(
            `SELECT id,fingerprint,attempts,manual FROM editorial_offer_checks WHERE next_at<=? AND lease_until<? AND (?=1 AND id IN (${slots}) OR manual=1) ORDER BY next_at,id LIMIT 1`,
          )
          .get(this.now(), this.now(), enabled ? 1 : 0, ...published);
        const offer = row && byId.get(String(row.id));
        if (!row) return;
        if (!offer) {
          this.ctx.db.sql
            .prepare("DELETE FROM editorial_offer_checks WHERE id=?")
            .run(String(row.id));
          return;
        }
        const owner = randomUUID();
        this.ctx.db.sql
          .prepare(
            "UPDATE editorial_offer_checks SET lease_owner=?,lease_until=? WHERE id=?",
          )
          .run(owner, this.now() + 120000, offer.id);
        claimed = { offer, owner, attempts: Number(row.attempts) };
      });
      if (!claimed) return;
      const { offer, owner, attempts } = claimed;
      const signal = AbortSignal.any([
        this.controller.signal,
        AbortSignal.timeout(30000),
      ]);
      let observation: Observation,
        failed = false;
      try {
        observation = await this.check(offer, signal);
      } catch (error) {
        failed = true;
        const previous = this.state(offer);
        const status =
          error instanceof ProviderError && error.status === 429
            ? "rate_limited"
            : error instanceof ProviderError &&
                [401, 403].includes(error.status || 0)
              ? "access_restricted"
              : "error";
        observation = {
          status,
          stock: "unknown",
          checkedAt: new Date(this.now()).toISOString(),
          validUntil: null,
          ...(previous?.url ? { url: previous.url } : {}),
        };
      }
      if (this.closed) return;
      const nextAt =
        this.now() + (failed && attempts < 2 ? 60000 * 5 ** attempts : week);
      this.ctx.db.transaction(() => {
        const updated = this.ctx.db.sql
          .prepare(
            "UPDATE editorial_offer_checks SET observation=?,next_at=?,lease_owner=NULL,lease_until=0,attempts=?,manual=CASE WHEN ?=1 THEN manual ELSE 0 END WHERE id=? AND fingerprint=? AND lease_owner=?",
          )
          .run(
            JSON.stringify(observation),
            nextAt,
            failed ? attempts + 1 : 0,
            failed && attempts < 2 ? 1 : 0,
            offer.id,
            offerFingerprint(offer),
            owner,
          );
        if (Number(updated.changes)) {
          this.ctx.db.sql
            .prepare(
              "INSERT INTO editorial_offer_check_history(offer_id,status,stock,checked_at) VALUES(?,?,?,?)",
            )
            .run(
              offer.id,
              observation.status,
              observation.stock,
              observation.checkedAt,
            );
          this.ctx.db.sql
            .prepare(
              "DELETE FROM editorial_offer_check_history WHERE offer_id=? AND id NOT IN (SELECT id FROM editorial_offer_check_history WHERE offer_id=? ORDER BY id DESC LIMIT 12)",
            )
            .run(offer.id, offer.id);
        }
      });
    } finally {
      this.busy = false;
    }
  }
  start() {
    if (this.timer || this.closed) return;
    this.ctx.content.setOfferResolver((product) =>
      productImages(this.ctx).resolve(this.resolve(product)),
    );
    this.ctx.content.setPostResolver((post) => this.resolvePost(post));
    this.timer = setInterval(() => {
      void this.tick()
        .then(() => this.drainManual())
        .catch(() => {});
    }, 15000);
    this.timer.unref();
  }
  close() {
    this.closed = true;
    clearInterval(this.timer);
    this.controller.abort();
  }
}
const instances = new WeakMap<PluginContext, EditorialOfferChecks>();
export function editorialOfferChecks(ctx: PluginContext) {
  let service = instances.get(ctx);
  if (!service) {
    service = new EditorialOfferChecks(ctx);
    instances.set(ctx, service);
  }
  return service;
}
