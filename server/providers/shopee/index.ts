import { createHash } from "node:crypto";
import { config } from "../../config.js";
import { fetchJson, ProviderError } from "../../lib/http.js";
import {
  cleanText,
  productBase,
  safeUrl,
  positive,
  validDiscount,
} from "../../products/normalize.js";
import type { MarketplaceProvider } from "../marketplace.js";
import type { Product, SearchIntent } from "../../../shared/types.js";
interface ShopeeItem {
  itemId?: string | number;
  shopId?: string | number;
  productName?: string;
  imageUrl?: string;
  productLink?: string;
  offerLink?: string;
  priceMin?: string;
  priceMax?: string;
  ratingStar?: string;
  shopName?: string;
  priceDiscountRate?: number;
}
export function normalizeShopee(item: ShopeeItem): Product | null {
  const product = productBase(
    "shopee",
    `${item.shopId || ""}:${item.itemId || ""}`,
    item.productName,
    item.offerLink || item.productLink,
  );
  if (!product || !item.itemId) return null;
  product.image = safeUrl(item.imageUrl, [
    "shopee.com.br",
    "shopee.sg",
    "susercontent.com",
    "shopeemobile.com",
  ]);
  product.price = positive(item.priceMin);
  product.priceMax = positive(item.priceMax);
  product.priceKind =
    product.price && product.priceMax && product.priceMax > product.price
      ? "from"
      : "exact";
  product.discountPercent = validDiscount(null, null, item.priceDiscountRate);
  const rating = positive(item.ratingStar);
  product.rating = rating && rating <= 5 ? rating : null;
  product.seller = cleanText(item.shopName) || null;
  return product;
}
export class ShopeeProvider implements MarketplaceProvider {
  readonly id = "shopee" as const;
  configured() {
    return !!(config.shopee.appId && config.shopee.secret);
  }
  async search(intent: SearchIntent, signal: AbortSignal): Promise<Product[]> {
    if (!this.configured()) throw new ProviderError("unconfigured");
    const query = `{ productOfferV2(keyword:${JSON.stringify(intent.keywords)}, page:1, limit:30, sortType:1) { nodes { itemId shopId productName imageUrl productLink offerLink priceMin priceMax ratingStar shopName priceDiscountRate } } }`;
    const body = JSON.stringify({ query });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHash("sha256")
      .update(
        `${config.shopee.appId}${timestamp}${body}${config.shopee.secret}`,
      )
      .digest("hex");
    const data = await fetchJson<{
      data?: { productOfferV2?: { nodes?: ShopeeItem[] } };
      errors?: Array<{ extensions?: { code?: number } }>;
    }>(
      config.shopee.endpoint,
      {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
          Authorization: `SHA256 Credential=${config.shopee.appId}, Timestamp=${timestamp}, Signature=${signature}`,
        },
      },
      signal,
    );
    if (data.errors?.length) throw new ProviderError("shopee_api_error");
    if (!data.data?.productOfferV2) throw new ProviderError("invalid_response");
    return (data.data.productOfferV2.nodes || [])
      .map(normalizeShopee)
      .filter((p): p is Product => p !== null);
  }
  private async request<T>(query: string, signal: AbortSignal): Promise<T> {
    if (!this.configured()) throw new ProviderError("unconfigured");
    const body = JSON.stringify({ query });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHash("sha256")
      .update(
        `${config.shopee.appId}${timestamp}${body}${config.shopee.secret}`,
      )
      .digest("hex");
    const response = await fetchJson<{ data?: T; errors?: unknown[] }>(
      config.shopee.endpoint,
      {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
          Authorization: `SHA256 Credential=${config.shopee.appId}, Timestamp=${timestamp}, Signature=${signature}`,
        },
      },
      signal,
    );
    if (response.errors?.length || !response.data)
      throw new ProviderError("shopee_api_error");
    return response.data;
  }
  async lookup(
    shopId: string,
    itemId: string,
    signal: AbortSignal,
  ): Promise<Product | null> {
    if (![shopId, itemId].every((id) => /^\d{1,18}$/.test(id)))
      throw new ProviderError("invalid_item_ids");
    const data = await this.request<{
      productOfferV2?: { nodes?: ShopeeItem[] };
    }>(
      `{ productOfferV2(shopId:${shopId}, itemId:${itemId}, page:1, limit:1) { nodes { itemId shopId productName imageUrl productLink offerLink priceMin priceMax } } }`,
      signal,
    );
    if (!data.productOfferV2 || !Array.isArray(data.productOfferV2.nodes))
      throw new ProviderError("invalid_response");
    const item = data.productOfferV2.nodes.find(
      (node) =>
        String(node.shopId) === shopId && String(node.itemId) === itemId,
    );
    return item ? normalizeShopee(item) : null;
  }
  async affiliateLink(
    productUrl: string,
    signal: AbortSignal,
  ): Promise<string> {
    const url = new URL(productUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "shopee.com.br" ||
      url.username ||
      url.password ||
      url.port ||
      !/\/product\/\d+\/\d+(?:\/|$)|-i\.\d+\.\d+$/.test(url.pathname)
    )
      throw new ProviderError("invalid_destination");
    const data = await this.request<{
      generateShortLink?: { shortLink?: string };
    }>(
      `mutation { generateShortLink(input: { originUrl:${JSON.stringify(productUrl)}, subIds:[${JSON.stringify(process.env.SHOPEE_SUB_ID || "geekmusical")}] }) { shortLink } }`,
      signal,
    );
    const link = data.generateShortLink?.shortLink;
    if (!link || !safeUrl(link, ["shope.ee", "shopee.com.br"]))
      throw new ProviderError("invalid_response");
    return link;
  }
}
