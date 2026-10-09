import { createHash } from "node:crypto";
import type { Product } from "../../shared/types.js";
import { TtlCache } from "../lib/cache.js";
export interface TrustedProductSource {
  product: Product;
  sourceRef: string;
  destination: string;
  catalogId: string;
  allowed?: () => boolean;
}
export const PRODUCT_DETAILS_TTL_MS = 12 * 60 * 60_000;
const byId = new TtlCache<TrustedProductSource>(12000, PRODUCT_DETAILS_TTL_MS);
const byStableId = new TtlCache<TrustedProductSource>(
  12000,
  PRODUCT_DETAILS_TTL_MS,
);
export const stableListingId = (source: string, ref: string) =>
  createHash("sha256")
    .update(`catalog-v1:${source}:${ref}`)
    .digest("hex")
    .slice(0, 32);
export function registerTrustedProduct(
  product: Product,
  sourceRef: string,
  destination: string,
  allowed?: () => boolean,
) {
  product.catalogId = stableListingId(product.marketplace, sourceRef);
  const entry = {
    product,
    sourceRef,
    destination,
    catalogId: product.catalogId,
    allowed,
  };
  byId.set(product.id, entry);
  byStableId.set(product.catalogId, entry);
}
export const trustedProduct = (id: string) =>
  byId.get(id) || byStableId.get(id);
