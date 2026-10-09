export type Marketplace =
  "amazon" | "shopee" | "magalu" | "awin" | "mercado-livre";
export type Category =
  | "notebook"
  | "smartphone"
  | "smartwatch"
  | "tv"
  | "headphones"
  | "monitor"
  | "tablet"
  | "appliance"
  | "other";
export interface Feature {
  key: string;
  label: string;
  terms: string[];
  minimum?: number;
  exact?: number;
}
export interface SearchIntent {
  query: string;
  category: Category;
  categoryLabel: string;
  keywords: string;
  maxPrice: number | null;
  minPrice: number | null;
  features: Feature[];
  uses: string[];
  exclusions: string[];
  source: "jev" | "local";
}
export interface Product {
  storeId?: string;
  storeName?: string;
  sourceUpdatedAt?: string | null;
  feedUpdatedAt?: string | null;
  importedAt?: string;
  priceValidUntil?: string | null;
  priceStatus?: "current" | "expired" | "unknown";
  sourceCurrency?: string | null;
  identityKey?: string | null;
  variant?: Record<string, string>;
  identifiers?: {
    gtin: string | null;
    mpn: string | null;
    model: string | null;
  };
  offers?: ProductOffer[];
  catalogId?: string;
  fixture?: boolean;
  id: string;
  marketplace: Marketplace;
  name: string;
  image: string | null;
  price: number | null;
  priceMax: number | null;
  priceKind: "exact" | "from";
  currency: "BRL";
  referencePrice: number | null;
  discountPercent: number | null;
  rating: number | null;
  reviewCount: number | null;
  seller: string | null;
  availability: "in_stock" | "out_of_stock" | "unknown";
  features: string[];
  checkedAt: string;
  visitPath: string;
}
export interface ProductOffer {
  id: string;
  marketplace: Marketplace;
  storeId: string;
  storeName: string;
  price: number | null;
  currency: "BRL";
  validUntil: string | null;
  availability: Product["availability"];
  shipping: number | null;
  conditions: string;
  visitPath: string;
}
export interface RankedProduct extends Product {
  score: number;
  reasons: string[];
  caveats: string[];
  matchedFeatures: string[];
}
export interface SourceStatus {
  marketplace: Marketplace;
  status: "pending" | "success" | "error" | "unconfigured";
  count: number;
  durationMs?: number;
  message?: string;
}
export interface SearchResult {
  storeSearches?: StoreSearch[];
  intent: SearchIntent;
  products: RankedProduct[];
  sources: SourceStatus[];
  cached: boolean;
  durationMs: number;
  searchedAt: string;
}
export interface StoreSearch {
  queryApplied?: boolean;
  storeId: string;
  storeName: string;
  visitPath: string;
}
export type SearchEvent =
  | {
      type: "progress";
      stage: "understanding" | "features" | "searching" | "ranking";
      message: string;
    }
  | { type: "intent"; intent: SearchIntent }
  | { type: "partial"; products: RankedProduct[]; sources: SourceStatus[] }
  | { type: "complete"; result: SearchResult }
  | { type: "error"; message: string };
