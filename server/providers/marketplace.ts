import type {
  Marketplace,
  Product,
  SearchIntent,
  StoreSearch,
} from "../../shared/types.js";
export interface MarketplaceProvider {
  readonly id: Marketplace;
  configured(): boolean;
  search(
    intent: SearchIntent,
    signal: AbortSignal,
    options?: { storeIds?: string[] },
  ): Promise<Product[]>;
  cacheVersion?(): string;
  storeSearches?(
    intent: SearchIntent,
    signal: AbortSignal,
    options?: { storeIds?: string[] },
  ): Promise<StoreSearch[]>;
  refreshProducts?(
    references: { id: string; name: string }[],
    signal: AbortSignal,
  ): Promise<Product[]>;
}
