import type { Marketplace, Product } from "../../shared/types.js";
import { createHmac } from "node:crypto";
import { randomBytes } from "node:crypto";
import { TtlCache } from "../lib/cache.js";
import { registerTrustedProduct, trustedProduct } from "./catalog.js";
const signingKey = randomBytes(32);
const destinations = new TtlCache<{ url: string; allowed?: () => boolean }>(
  12000,
  24 * 60 * 60 * 1000,
);
export const cleanText = (value: unknown, max = 400) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/[\x00-\x1f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
export const numberOrNull = (value: unknown): number | null => {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export const positive = (value: unknown) => {
  const n = numberOrNull(value);
  return n !== null && n > 0 ? n : null;
};
export function safeUrl(value: unknown, hosts: string[]): string | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      return null;
    if (
      !hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function productBase(
  marketplace: Marketplace,
  rawId: string,
  name: unknown,
  url: unknown,
  allowed?: () => boolean,
): Product | null {
  if (["awin", "mercado-livre"].includes(marketplace) && !allowed) return null;
  const destination = safeUrl(
    url,
    marketplace === "amazon"
      ? ["amazon.com.br"]
      : marketplace === "awin"
        ? ["www.awin1.com", "awin1.com"]
        : marketplace === "mercado-livre"
          ? ["meli.la", "mercadolivre.com.br"]
          : marketplace === "magalu"
            ? ["www.magazineluiza.com.br"]
            : ["shopee.com.br", "shope.ee"],
  );
  const title = cleanText(name);
  if (!destination || !title || !rawId) return null;
  const id = createHmac("sha256", signingKey)
    .update(`${marketplace}:${rawId}`)
    .digest("hex")
    .slice(0, 32);
  destinations.set(id, { url: destination, allowed });
  const product: Product = {
    id,
    marketplace,
    name: title,
    visitPath: `/api/products/${id}/visit`,
    image: null,
    price: null,
    priceMax: null,
    priceKind: "exact",
    currency: "BRL",
    referencePrice: null,
    discountPercent: null,
    rating: null,
    reviewCount: null,
    seller: null,
    availability: "unknown",
    features: [],
    checkedAt: new Date().toISOString(),
  };
  registerTrustedProduct(product, rawId, destination, allowed);
  return product;
}
export const getDestination = (id: string) => {
  const found = destinations.get(id);
  if (found) return !found.allowed || found.allowed() ? found.url : undefined;
  const trusted = trustedProduct(id);
  return trusted && (!trusted.allowed || trusted.allowed())
    ? trusted.destination
    : undefined;
};
export function storeSearchPath(
  storeId: string,
  destination: string,
  allowed: () => boolean,
) {
  const url = safeUrl(destination, ["awin1.com"]);
  if (!url) return null;
  const id = createHmac("sha256", signingKey)
    .update(`store-search:${storeId}:${url}`)
    .digest("hex")
    .slice(0, 32);
  destinations.set(id, { url, allowed });
  return `/api/products/${id}/visit`;
}
export function validDiscount(
  price: number | null,
  reference: number | null,
  reported?: unknown,
): number | null {
  if (price !== null && reference !== null && reference > price)
    return Math.round((1 - price / reference) * 100);
  const value = numberOrNull(reported);
  return value !== null && value > 0 && value < 100 ? Math.round(value) : null;
}
