import { escapeHtml } from "../web/escape.js";
import type { EditorialProduct } from "./schema.js";
import { safeContentLink } from "./schema.js";
import { currentProductImage } from "../../shared/product-image.js";
import {
  affiliateStores as stores,
  editorialStoreInfo,
  affiliateStore,
  type AffiliateStore,
} from "../../shared/affiliate.js";
export { affiliateStore, type AffiliateStore } from "../../shared/affiliate.js";
export function legacyOffersTable(
  name: string,
  photo: string,
  rows: { store: AffiliateStore; action: string }[],
) {
  return `<div class="editorial-product-offers editorial-legacy-offers${photo ? "" : " editorial-offers-compact"}"><table><caption${photo ? "" : ' class="sr-only"'}>Onde encontrar ${escapeHtml(name)}${photo ? `<span class="editorial-product-photo">${photo}</span>` : ""}</caption><thead><tr><th scope="col">Loja</th><th scope="col">Oferta</th></tr></thead><tbody>${rows
    .map(({ store, action }) => {
      const info = stores[store];
      return `<tr data-store="${store}"><th scope="row"><span class="editorial-shop"><span class="editorial-store-logo"><img src="${info.logo}" alt="" width="80" height="40" loading="lazy" decoding="async"></span><span>${info.name}</span></span></th><td>${action}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
export function productOffersTable(product: EditorialProduct) {
  const name = escapeHtml(product.name);
  const image = currentProductImage(product.image);
  const amazonPhotoOffer =
    image?.source === "amazon-api"
      ? product.offers.find(
          (o) => o.store === "amazon" && o.productUrl === image.sourceUrl,
        )
      : undefined;
  const photo = image
    ? `<span class="editorial-product-photo">${amazonPhotoOffer ? `<a href="${escapeHtml(amazonPhotoOffer.url)}" target="_blank" rel="sponsored nofollow noopener noreferrer" aria-label="Ver ${name} na Amazon — abre em nova aba">` : ""}<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}"${image.width ? ` width="${image.width}"` : ""}${image.height ? ` height="${image.height}"` : ""} loading="lazy" decoding="async" referrerpolicy="no-referrer">${amazonPhotoOffer ? "</a>" : ""}</span>`
    : "";
  const rows = product.offers
    .filter(
      (offer) =>
        safeContentLink(offer.url) && affiliateStore(offer.url) === offer.store,
    )
    .map((offer) => {
      const info = editorialStoreInfo(offer),
        state = product.offerStates?.[offer.id];
      const href = state?.url || offer.url;
      const blocked =
        state?.blocked ||
        state?.stock === "out_of_stock" ||
        (offer.store === "awin" && !state) ||
        !safeContentLink(href) ||
        affiliateStore(href) !== offer.store;
      const action = blocked
        ? '<span class="editorial-offers-empty">Oferta indisponível</span>'
        : `<a class="editorial-price-button" href="${escapeHtml(href)}" target="_blank" rel="sponsored nofollow noopener noreferrer" data-affiliate-store="${offer.store}" aria-label="Ver preço de ${name} na ${escapeHtml(info.name)} — abre em nova aba">Ver preço<span aria-hidden="true">↗</span></a>`;
      return `<tr data-offer-id="${escapeHtml(offer.id)}" data-store="${offer.store}"><th scope="row"><span class="editorial-shop"><span class="editorial-store-logo"><img src="${info.logo}" alt="" width="80" height="40" loading="lazy" decoding="async"></span><span>${escapeHtml(info.name)}</span></span></th><td>${action}</td></tr>`;
    })
    .join("");
  return `<div class="editorial-product-offers" data-product-id="${escapeHtml(product.id)}"><table><caption>Onde encontrar ${name}${photo}</caption><thead><tr><th scope="col">Loja</th><th scope="col">Oferta</th></tr></thead><tbody>${rows || '<tr><td colspan="2" class="editorial-offers-empty">Sem ofertas disponíveis.</td></tr>'}</tbody></table></div>`;
}
export function affiliateButton(
  href: string,
  label: string,
  plainLabel: string,
  store: AffiliateStore,
  compact = false,
) {
  // A legacy tracking URL cannot establish the publisher, merchant or product.
  if (store === "awin") return label;
  const info = stores[store];
  const generic =
    /^(?:ver pre[cç]os?|comprar(?: agora)?|amazon|mercado livre|magalu|shopee)$/i.test(
      plainLabel,
    );
  const title = generic ? info.name : info.name + ": " + plainLabel;
  return `<span class="editorial-offer">${generic ? "" : `<span class="editorial-offer-name">${label}</span>`}<a class="editorial-price-button" href="${escapeHtml(href)}" target="_blank" rel="sponsored nofollow noopener noreferrer" data-affiliate-store="${store}" aria-label="Ver Preço na ${escapeHtml(title)} — abre em nova aba">${compact ? "Ver preço" : `<span class="editorial-store-logo"><img src="${info.logo}" alt="" width="${store === "amazon" ? 90 : 80}" height="${store === "amazon" ? 44 : 40}" loading="lazy" decoding="async"></span><span class="editorial-price-label">Ver Preço<span>${info.name}</span></span>`}<span aria-hidden="true">↗</span></a></span>`;
}
