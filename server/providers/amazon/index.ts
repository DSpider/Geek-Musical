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
import { AmazonApiQueue } from "./queue.js";

const apiQueue = new AmazonApiQueue(config.amazon.quotaFile);

interface AmazonItem {
  asin?: string;
  detailPageURL?: string;
  images?: {
    primary?: { large?: { url?: string }; medium?: { url?: string } };
  };
  itemInfo?: {
    title?: { displayValue?: string };
    features?: { displayValues?: string[] };
  };
  offersV2?: {
    listings?: Array<{
      violatesMAP?: boolean;
      availability?: { type?: string };
      merchantInfo?: { name?: string };
      price?: {
        money?: { amount?: number; currency?: string };
        savingBasis?: { money?: { amount?: number } };
        savings?: { percentage?: number };
      };
    }>;
  };
}
export function normalizeAmazon(item: AmazonItem): Product | null {
  const product = productBase(
    "amazon",
    item.asin || "",
    item.itemInfo?.title?.displayValue,
    item.detailPageURL,
  );
  if (!product) return null;
  const offer = item.offersV2?.listings?.[0];
  const price = offer?.price;
  product.image = safeUrl(
    item.images?.primary?.large?.url || item.images?.primary?.medium?.url,
    ["media-amazon.com", "ssl-images-amazon.com"],
  );
  if (!offer?.violatesMAP && price?.money?.currency === "BRL") {
    product.price = positive(price.money.amount);
    const reference = positive(price.savingBasis?.money?.amount);
    product.referencePrice =
      reference && product.price && reference > product.price
        ? reference
        : null;
    product.discountPercent = validDiscount(
      product.price,
      product.referencePrice,
      price.savings?.percentage,
    );
  }
  product.features = (item.itemInfo?.features?.displayValues || [])
    .map((x) => cleanText(x, 600))
    .filter(Boolean)
    .slice(0, 12);
  product.availability =
    offer?.availability?.type === "IN_STOCK"
      ? "in_stock"
      : offer?.availability?.type === "OUT_OF_STOCK"
        ? "out_of_stock"
        : "unknown";
  product.seller = cleanText(offer?.merchantInfo?.name) || null;
  return product;
}
export class AmazonProvider implements MarketplaceProvider {
  readonly id = "amazon" as const;
  private token: { value: string; expires: number } | null = null;
  private pendingToken: Promise<string> | null = null;
  configured() {
    return !!(config.amazon.id && config.amazon.secret && config.amazon.tag);
  }
  private async getToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now()) return this.token.value;
    if (this.pendingToken) return this.pendingToken;
    this.pendingToken = (async () => {
      const v = config.amazon.version;
      const endpoints: Record<string, string> = {
        "2.1":
          "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token",
        "2.2":
          "https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token",
        "2.3":
          "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token",
        "3.1": "https://api.amazon.com/auth/o2/token",
        "3.2": "https://api.amazon.co.uk/auth/o2/token",
        "3.3": "https://api.amazon.co.jp/auth/o2/token",
      };
      if (!endpoints[v])
        throw new ProviderError("unsupported_credential_version");
      const modern = v.startsWith("3.");
      const fields = {
        grant_type: "client_credentials",
        client_id: config.amazon.id,
        client_secret: config.amazon.secret,
        scope: modern ? "creatorsapi::default" : "creatorsapi/default",
      };
      const tokenSignal = AbortSignal.timeout(config.timeoutMs);
      const data = await apiQueue.run(
        () =>
          fetchJson<{
            access_token?: string;
            expires_in?: number;
          }>(
            endpoints[v],
            {
              method: "POST",
              headers: {
                "Content-Type": modern
                  ? "application/json"
                  : "application/x-www-form-urlencoded",
              },
              body: modern
                ? JSON.stringify(fields)
                : new URLSearchParams(fields),
            },
            tokenSignal,
          ),
        tokenSignal,
      );
      if (!data.access_token) throw new ProviderError("invalid_auth_response");
      this.token = {
        value: data.access_token,
        expires:
          Date.now() + Math.max(0, (data.expires_in || 3600) - 60) * 1000,
      };
      return this.token.value;
    })().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }
  async search(
    intent: SearchIntent,
    signal: AbortSignal,
    options?: { storeIds?: string[]; partnerTag?: string },
  ): Promise<Product[]> {
    if (!this.configured()) throw new ProviderError("unconfigured");
    const partnerTag = options?.partnerTag || config.amazon.tag;
    if (![config.amazon.tag, "geekmusical-20"].includes(partnerTag))
      throw new ProviderError("invalid_partner_tag");
    const token = await this.getToken();
    const modern = config.amazon.version.startsWith("3.");
    try {
      const data = await apiQueue.run(
        () =>
          fetchJson<{
            searchResult?: { items?: AmazonItem[] };
            errors?: unknown[];
          }>(
            "https://creatorsapi.amazon/catalog/v1/searchItems",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-marketplace": config.amazon.marketplace,
                Authorization: modern
                  ? `Bearer ${token}`
                  : `Bearer ${token}, Version ${config.amazon.version}`,
              },
              body: JSON.stringify({
                keywords: intent.keywords,
                partnerTag,
                marketplace: config.amazon.marketplace,
                itemCount: 10,
                ...(intent.maxPrice
                  ? { maxPrice: Math.floor(intent.maxPrice * 100) }
                  : {}),
                ...(intent.minPrice
                  ? { minPrice: Math.ceil(intent.minPrice * 100) }
                  : {}),
                resources: [
                  "images.primary.large",
                  "itemInfo.title",
                  "itemInfo.features",
                  "offersV2.listings.price",
                  "offersV2.listings.availability",
                  "offersV2.listings.merchantInfo",
                ],
              }),
            },
            signal,
          ),
        signal,
      );
      if (data.errors?.length && !data.searchResult)
        throw new ProviderError("amazon_api_error");
      return (data.searchResult?.items || [])
        .map(normalizeAmazon)
        .filter((p): p is Product => p !== null);
    } catch (e) {
      if (e instanceof ProviderError && e.status === 401) this.token = null;
      throw e;
    }
  }
  async getItems(
    ids: string[],
    signal: AbortSignal,
    partnerTag = config.amazon.tag,
  ): Promise<Array<{ sourceId: string; product: Product; url: string }>> {
    if (!this.configured()) throw new ProviderError("unconfigured");
    if (
      !ids.length ||
      ids.length > 10 ||
      ids.some((id) => !/^[A-Z0-9]{10}$/.test(id)) ||
      ![config.amazon.tag, "geekmusical-20"].includes(partnerTag)
    )
      throw new ProviderError("invalid_item_ids");
    const token = await this.getToken();
    try {
      // The official documentation names itemResults; this account currently returns itemsResult.
      const data = await apiQueue.run(
        () =>
          fetchJson<{
            itemResults?: { items?: AmazonItem[] };
            itemsResult?: { items?: AmazonItem[] };
            errors?: unknown[];
          }>(
            "https://creatorsapi.amazon/catalog/v1/getItems",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-marketplace": config.amazon.marketplace,
                Authorization: config.amazon.version.startsWith("3.")
                  ? `Bearer ${token}`
                  : `Bearer ${token}, Version ${config.amazon.version}`,
              },
              body: JSON.stringify({
                itemIds: [...new Set(ids)],
                partnerTag,
                marketplace: config.amazon.marketplace,
                resources: [
                  "itemInfo.title",
                  "images.primary.large",
                  "offersV2.listings.price",
                  "offersV2.listings.availability",
                ],
              }),
            },
            signal,
          ),
        signal,
      );
      const items = data.itemsResult?.items || data.itemResults?.items;
      if (!Array.isArray(items)) throw new ProviderError("amazon_api_error");
      return items.flatMap((item) => {
        const product = normalizeAmazon(item);
        return product &&
          item.asin &&
          ids.includes(item.asin) &&
          item.detailPageURL
          ? [{ sourceId: item.asin, product, url: item.detailPageURL }]
          : [];
      });
    } catch (e) {
      if (e instanceof ProviderError && e.status === 401) this.token = null;
      throw e;
    }
  }
}
