import {
  analyticsEventSchema,
  type AnalyticsEvent,
} from "../../shared/analytics.js";

export interface PublicAnalyticsConfig {
  enabled: boolean;
  measurementId: string;
  canonical: string;
  path: string;
  type: string;
  category?: string;
  postId?: string;
}
export const consentKey = "gp-cookie-consent-v1";
export const consentChanged = "gp-cookie-consent-changed";
export const openCookiePreferences = "gp-cookie-preferences";
export interface CookieConsent {
  version: 1;
  analytics: boolean;
  decidedAt: number;
}
const maxAge = 180 * 86400000;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}
export function readConsent(
  storage: Pick<Storage, "getItem"> = localStorage,
  now = Date.now(),
): CookieConsent | null {
  try {
    const value = JSON.parse(
      storage.getItem(consentKey) || "null",
    ) as CookieConsent | null;
    if (
      !value ||
      value.version !== 1 ||
      typeof value.analytics !== "boolean" ||
      !Number.isFinite(value.decidedAt) ||
      value.decidedAt > now ||
      now - value.decidedAt > maxAge
    )
      return null;
    return {
      version: 1,
      analytics: value.analytics,
      decidedAt: value.decidedAt,
    };
  } catch {
    return null;
  }
}
let memoryConsent: CookieConsent | null = null;
export function saveConsent(analytics: boolean) {
  memoryConsent = { version: 1, analytics, decidedAt: Date.now() };
  try {
    localStorage.setItem(consentKey, JSON.stringify(memoryConsent));
  } catch {
    /* Choice still applies to this document if storage is blocked. */
  }
  window.dispatchEvent(new Event(consentChanged));
}
function currentConsent() {
  if (
    memoryConsent &&
    (memoryConsent.decidedAt > Date.now() ||
      Date.now() - memoryConsent.decidedAt > maxAge)
  )
    memoryConsent = null;
  try {
    return readConsent() || memoryConsent;
  } catch {
    return memoryConsent;
  }
}
export function publicAnalyticsConfig(): PublicAnalyticsConfig | null {
  try {
    const value = JSON.parse(
      document.getElementById("gm-analytics-config")?.textContent || "null",
    ) as PublicAnalyticsConfig | null;
    if (
      !value ||
      typeof value.enabled !== "boolean" ||
      !/^\/(?:[a-z0-9-]+\/)*$/.test(value.path) ||
      !/^[a-z0-9_-]+$/.test(value.type)
    )
      return null;
    const canonical = new URL(value.canonical);
    if (
      canonical.search ||
      canonical.hash ||
      canonical.pathname !== value.path ||
      (value.enabled &&
        (!/^G-[A-Z0-9]+$/.test(value.measurementId) ||
          location.protocol !== "https:" ||
          canonical.origin !== location.origin))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
let ready = false,
  loading = false,
  pageSent = false;
let pending: AnalyticsEvent[] = [];
let searchCategory: string | undefined;
function disableKey(id: string, value: boolean) {
  Reflect.set(window, "ga-disable-" + id, value);
}
function clearAnalyticsCookies() {
  const domains = [
    "",
    ...location.hostname
      .split(".")
      .map((_, index, parts) => parts.slice(index).join("."))
      .filter((domain) => domain.includes(".")),
  ];
  for (const pair of document.cookie.split(";")) {
    const name = pair.trim().split("=")[0];
    if (!/^_ga(?:_|$)/.test(name)) continue;
    for (const domain of domains)
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${domain ? "; domain=" + domain : ""}${location.protocol === "https:" ? "; Secure" : ""}`;
  }
}
function context(config: PublicAnalyticsConfig) {
  return {
    source_page: config.path,
    source_type: config.type,
    ...(config.category ? { category: config.category } : {}),
  };
}
function emit(event: AnalyticsEvent, config: PublicAnalyticsConfig) {
  if (!currentConsent()?.analytics || !config.enabled || !ready) return;
  window.gtag?.("event", event.name, {
    ...event.params,
    send_to: config.measurementId,
    page_location: config.canonical,
    page_referrer: "",
    page_title: "Geek Musical",
  });
}
export function track(event: AnalyticsEvent) {
  try {
    const config = publicAnalyticsConfig();
    const parsed = analyticsEventSchema.safeParse(event);
    if (!config?.enabled || !currentConsent()?.analytics || !parsed.success)
      return;
    if (ready) emit(parsed.data, config);
    else if (loading && pending.length < 20) pending.push(parsed.data);
  } catch {
    /* Analytics must never interrupt search or navigation. */
  }
}
export function trackSearch(
  name: "product_search_submit" | "product_search_results_view",
  inputType: "text" | "voice",
  category?: string,
  count = 0,
) {
  if (
    name === "product_search_results_view" &&
    category &&
    /^[a-z0-9_-]{1,80}$/i.test(category)
  )
    searchCategory = category;
  if (name === "product_search_submit") searchCategory = undefined;
  const config = publicAnalyticsConfig();
  if (!config) return;
  const params = {
    ...context(config),
    input_type: inputType,
    ...(category ? { category } : {}),
  };
  if (name === "product_search_submit") track({ name, params });
  else track({ name, params: { ...params, result_count: count } });
}
export function trackAffiliate(
  marketplace: "amazon" | "shopee" | "magalu" | "awin" | "mercado-livre",
  productId: string,
) {
  const config = publicAnalyticsConfig();
  if (config)
    track({
      name: "affiliate_click",
      params: {
        ...context(config),
        ...(searchCategory ? { category: searchCategory } : {}),
        marketplace,
        product_id: productId,
      },
    });
}
export function trackComparison(
  name: "product_compare_start" | "product_compare_complete",
  count: number,
  outcome:
    | "direct"
    | "adapted"
    | "incompatible"
    | "insufficient_data"
    | "basic" = "basic",
) {
  const config = publicAnalyticsConfig();
  if (!config) return;
  const params = {
    ...context(config),
    ...(searchCategory ? { category: searchCategory } : {}),
    product_count: count,
  };
  if (name === "product_compare_start") track({ name, params });
  else track({ name, params: { ...params, outcome } });
}
export function updateAnalyticsConsent() {
  const config = publicAnalyticsConfig();
  if (!config) return;
  if (!currentConsent()?.analytics) {
    disableKey(config.measurementId, true);
    pending = [];
    pageSent = false;
    if (window.gtag)
      window.gtag("consent", "update", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    clearAnalyticsCookies();
    return;
  }
  if (!config.enabled) return;
  disableKey(config.measurementId, false);
  if (ready) {
    window.gtag?.("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    if (!pageSent) {
      emit({ name: "page_view", params: context(config) }, config);
      pageSent = true;
    }
    return;
  }
  if (loading) return;
  loading = true;
  window.dataLayer = [];
  window.gtag = function (..._args: unknown[]) {
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("consent", "update", { analytics_storage: "granted" });
  window.gtag("js", new Date());
  window.gtag("set", {
    page_location: config.canonical,
    page_referrer: "",
    page_title: "Geek Musical",
  });
  window.gtag("config", config.measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: 15552000,
    cookie_update: false,
    page_location: config.canonical,
    page_referrer: "",
    page_title: "Geek Musical",
  });
  const script = document.createElement("script");
  script.src =
    "https://www.googletagmanager.com/gtag/js?id=" + config.measurementId;
  script.async = true;
  script.nonce =
    (document.getElementById("gm-analytics-config") as HTMLScriptElement | null)
      ?.nonce || "";
  script.onload = () => {
    ready = true;
    loading = false;
    if (!currentConsent()?.analytics) {
      pending = [];
      return;
    }
    emit({ name: "page_view", params: context(config) }, config);
    pageSent = true;
    for (const event of pending) emit(event, config);
    pending = [];
  };
  script.onerror = () => {
    loading = false;
    pending = [];
    script.remove();
  };
  document.head.append(script);
}
export function installAnalytics() {
  window.addEventListener(consentChanged, updateAnalyticsConsent);
  window.addEventListener("storage", (event) => {
    if (event.key === consentKey) {
      memoryConsent = null;
      updateAnalyticsConsent();
    }
  });
  document.addEventListener("click", (event) => {
    const anchor = (event.target as Element | null)?.closest?.(
      "[data-analytics-cta]",
    );
    const config = publicAnalyticsConfig();
    if (anchor && config)
      track({
        name: "blog_cta_click",
        params: {
          ...context(config),
          ...(config.postId ? { post_id: config.postId } : {}),
          cta_key: anchor.getAttribute("data-analytics-cta") || "",
        },
      });
    if (
      (event.target as Element | null)?.closest?.("[data-cookie-preferences]")
    )
      window.dispatchEvent(new Event(openCookiePreferences));
  });
  updateAnalyticsConsent();
}
