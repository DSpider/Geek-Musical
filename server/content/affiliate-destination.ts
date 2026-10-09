import { affiliateStore, type AffiliateStore } from "../../shared/affiliate.js";
import { ProviderError } from "../lib/http.js";

const allowed = (url: URL, store: AffiliateStore) =>
  url.protocol === "https:" &&
  !url.username &&
  !url.password &&
  !url.port &&
  affiliateStore(url.href) === store &&
  /^(?:(?:www\.)?(?:amazon\.com\.br|amzn\.to|mercadolivre\.com\.br|mercadolivre\.com|meli\.la|magazineluiza\.com\.br|magazinevoce\.com\.br|magalu\.com|shopee\.com\.br|s\.shopee\.com\.br|shope\.ee)|produto\.mercadolivre\.com\.br)$/.test(
    url.hostname,
  );

const direct = (url: URL, store: AffiliateStore) =>
  store === "amazon"
    ? /\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i.test(url.pathname)
    : store === "mercado-livre"
      ? /\/p\/MLB\d+(?:\/|$)|\/MLB-\d+.*_JM$/.test(url.pathname)
      : store === "shopee" &&
        /\/product\/\d+\/\d+(?:\/|$)|-i\.\d+\.\d+$/.test(url.pathname);

/** Follow only the original merchant's public redirects; never infer a replacement. */
export async function editorialProductDestination(
  source: string,
  store: AffiliateStore,
  signal: AbortSignal,
) {
  let url = new URL(source);
  for (let hop = 0; hop < 6; hop++) {
    if (!allowed(url, store)) throw new ProviderError("invalid_destination");
    if (direct(url, store)) return url.href;
    if (hop === 5) break;
    const response = await fetch(url.href, {
      method: "HEAD",
      redirect: "manual",
      signal,
      headers: { "User-Agent": "GeekMusical-LinkAudit/1.0" },
    });
    if (!response.ok && ![301, 302, 303, 307, 308].includes(response.status))
      throw new ProviderError("upstream_http", response.status);
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location)
      break;
    url = new URL(location, url);
  }
  return null;
}
