import type { EditorialOffer } from "./content.js";
export const affiliateStores = {
  amazon: { name: "Amazon", logo: "/brands/amazon-available.png" },
  "mercado-livre": {
    name: "Mercado Livre",
    logo: "/brands/mercado-livre.webp",
  },
  magalu: { name: "Magalu", logo: "/brands/magalu.svg" },
  shopee: { name: "Shopee", logo: "/brands/shopee.svg" },
  awin: { name: "Loja parceira", logo: "" },
} as const;
export type AffiliateStore = keyof typeof affiliateStores;
const domains: Record<AffiliateStore, string[]> = {
  amazon: ["amazon.com.br", "amzn.to"],
  "mercado-livre": ["mercadolivre.com.br", "mercadolivre.com", "meli.la"],
  magalu: ["magazinevoce.com.br", "magazineluiza.com.br", "magalu.com"],
  shopee: ["shopee.com.br", "shope.ee"],
  awin: ["awin1.com"],
};
export function affiliateStore(value: string): AffiliateStore | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return;
    return (Object.keys(domains) as AffiliateStore[]).find((store) =>
      domains[store].some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith("." + domain),
      ),
    );
  } catch {
    return;
  }
}
export function editorialStoreInfo(
  offer: Pick<EditorialOffer, "store" | "awin">,
) {
  return offer.store === "awin" && offer.awin
    ? {
        name: offer.awin.storeName,
        logo: `/api/awin/logos/${offer.awin.advertiserId}`,
      }
    : affiliateStores[offer.store];
}
export const offerStatusLabels: Record<string, string> = {
  pending: "Aguardando verificação",
  checking: "Verificação em andamento",
  confirmed: "Estoque informado pela fonte",
  offer_available: "Oferta disponível; estoque não informado",
  unavailable: "Oferta não retornada pela API; estoque não confirmado",
  error: "Falha técnica; link anterior preservado",
  credentials_pending: "Credencial da API pendente",
  unsupported: "API de estoque indisponível para esta integração",
  product_pending: "Informe a URL direta do anúncio para consultar a API",
  restricted: "Oferta Awin sem elegibilidade atual",
  expired: "Verificação vencida; confira na loja",
  fixtures: "Consultas reais desativadas neste ambiente",
  access_restricted: "A API restringiu esta consulta; estoque não confirmado",
  rate_limited: "Limite temporário da API; nova tentativa agendada",
};
export interface EditorialCheck {
  id: string;
  status: string;
  stock: "in_stock" | "out_of_stock" | "unknown";
  checkedAt: string | null;
  validUntil: string | null;
  nextAt: string;
  updatedLink: boolean;
  currentUrl?: string;
  history: Array<{
    status: string;
    stock: EditorialCheck["stock"];
    checkedAt: string;
  }>;
}
export interface PostAffiliateStatus {
  checks: EditorialCheck[];
  weeklyEnabled: boolean;
  settingsRevision: string;
  environment: string;
}
