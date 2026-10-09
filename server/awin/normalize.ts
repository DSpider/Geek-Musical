import { createHash } from "node:crypto";
import type {
  AwinAdvertiser,
  AwinFeed,
  AwinRecord,
} from "../../shared/awin.js";
import type { Category } from "../../shared/types.js";
import { cleanText } from "../products/normalize.js";
import { affiliateUrl, merchantUrl, publicHttps } from "./urls.js";
import type { FeedRow } from "./parsers.js";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = (value: unknown, max = 400) =>
  cleanText(typeof value === "number" ? String(value) : value, max).replace(
    /&(?:amp|lt|gt|quot|#39);/g,
    (s) =>
      ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[
        s
      ] || s,
  );
const normalize = (v: string) =>
  v
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
export function sourceDate(value: unknown, allowFuture = false): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  // Legacy dates without an offset use the adapter's UTC convention.
  // Never substitute the local import/check time for a source timestamp.
  const timestamp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(v)
    ? v.replace(" ", "T") + "Z"
    : v;
  const n = Date.parse(timestamp);
  return Number.isFinite(n) && (allowFuture || n <= Date.now() + 300000)
    ? new Date(n).toISOString()
    : null;
}
export function amount(value: unknown, allowZero = false): number | null {
  const v =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  if (!/^\d+(?:\.\d{1,4})?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n <= 100000000 && (allowZero ? n >= 0 : n > 0)
    ? Math.round(n * 100) / 100
    : null;
}
export function validGtin(value: unknown): string | null {
  const v = text(value, 14);
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(v) || /^0+$/.test(v))
    return null;
  const sum = v
    .slice(0, -1)
    .split("")
    .reverse()
    .reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(v.at(-1))
    ? v.padStart(14, "0")
    : null;
}
function object(value: unknown): FeedRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FeedRow)
    : {};
}
export function normalizeAwin(
  row: FeedRow,
  feed: AwinFeed,
  advertiser: AwinAdvertiser,
  importedAt = new Date().toISOString(),
): AwinRecord | null {
  const enhanced = feed.format === "jsonl",
    meta = object(row.meta),
    basic = object(row.product_basic),
    pricing = object(row.price_and_availability),
    ident = object(row.product_identifiers),
    detail = object(row.product_detailed),
    categories = object(row.product_category),
    variants = object(row.product_variants);
  const rawId = enhanced ? basic.id : row.merchant_product_id;
  const sourceProductId = text(rawId, 200),
    name = text(enhanced ? basic.title : row.product_name, 400);
  if (
    !sourceProductId ||
    !name ||
    Number(enhanced ? meta.advertiser_id : row.merchant_id) !== advertiser.id ||
    advertiser.publisherId !== feed.publisherId
  )
    return null;
  if (
    !enhanced &&
    row.data_feed_id &&
    String(row.data_feed_id) !== feed.sourceId
  )
    return null;
  const field = (key: keyof typeof feed.policy.mappings, fallback: unknown) =>
    text(
      feed.policy.mappings[key] ? row[feed.policy.mappings[key]!] : fallback,
      300,
    ) || null;
  const brand = field("brand", enhanced ? ident.brand : row.brand_name),
    model = field(
      "model",
      enhanced ? detail.model : row.product_model || row.model_number,
    ),
    mpn = field("mpn", enhanced ? ident.mpn : row.mpn),
    gtin = validGtin(
      field(
        "gtin",
        enhanced ? ident.gtin : row.ean || row.product_GTIN || row.upc,
      ),
    );
  const variant: Record<string, string> = {};
  for (const [key, value] of Object.entries({
    colour: field("colour", enhanced ? variants.color : row.colour),
    size: field(
      "size",
      enhanced ? variants.size : row["Fashion:size"] || row.size,
    ),
    voltage: field("voltage", null),
    capacity: field("capacity", null),
    quantity: field("quantity", enhanced ? detail.multipack : null),
    condition: field("condition", enhanced ? detail.condition : row.condition),
  }))
    if (value) variant[key] = normalize(value);
  const title = normalize(name);
  // These are explicit variant tokens in the source title, not inferred specifications.
  for (const [key, pattern] of Object.entries({
    voltage: /\b(110\s?v|127\s?v|220\s?v|bivolt)\b/,
    capacity: /\b(\d+(?:[.,]\d+)?\s?(?:gb|tb|ml|litros?|kg))\b/,
    quantity: /\b(\d+\s?(?:unidades?|pecas?))\b/,
    kit: /\b(kit|conjunto|refil)\b/,
  }))
    if (!variant[key]) {
      const found = title.match(pattern);
      if (found) variant[key] = found[1].replace(/\s/g, "");
    }
  if (!variant.colour) {
    const found = title.match(
      /\b(preto|preta|branco|branca|azul|vermelho|vermelha|rosa|verde|prata|inox|dourado|dourada)\b/,
    );
    if (found) variant.colour = found[1];
  }
  // Unknown conditions and variants cannot be treated as confirmed equal across stores.
  const sorted = Object.fromEntries(
    Object.entries(variant).sort(([a], [b]) => a.localeCompare(b)),
  );
  const listingKey = hash([
    feed.publisherId,
    advertiser.id,
    sourceProductId,
    sorted,
  ]);
  const identityKey = gtin
    ? hash([
        gtin,
        normalize(brand || ""),
        normalize(model || ""),
        normalize(mpn || ""),
        sorted,
      ])
    : null;
  const rawDirect = enhanced ? basic.link : row.merchant_deep_link;
  let originalUrl = merchantUrl(rawDirect, advertiser);
  if (
    !originalUrl &&
    feed.policy.directUrlParameter &&
    typeof rawDirect === "string"
  ) {
    try {
      const wrapper = new URL(rawDirect);
      // Some official feeds provide a merchant tracking wrapper and an explicit HTTPS destination.
      // Extract only the configured field. The source affiliate link remains byte-for-byte intact.
      if (
        ["http:", "https:"].includes(wrapper.protocol) &&
        !wrapper.username &&
        !wrapper.password &&
        !wrapper.port &&
        merchantUrl(`https://${wrapper.hostname}/`, advertiser) &&
        wrapper.searchParams.getAll(feed.policy.directUrlParameter).length === 1
      )
        originalUrl = merchantUrl(
          wrapper.searchParams.get(feed.policy.directUrlParameter),
          advertiser,
        );
    } catch {
      /* Untrusted external URL; leave unknown. */
    }
  }
  const awinProductId =
    text(enhanced ? basic.aw_product_id : row.aw_product_id, 100) || null;
  const rawLink = enhanced ? basic.aw_deep_link : row.aw_deep_link;
  const link = affiliateUrl(rawLink, advertiser, originalUrl, awinProductId);
  const imageValue = enhanced
    ? basic.image_link
    : row.merchant_image_url || row.aw_image_url || row.large_image;
  const image = publicHttps(imageValue)?.href || null;
  const additionalImages = (
    enhanced
      ? Array.isArray(basic.additional_image_link)
        ? basic.additional_image_link
        : []
      : [
          row.alternate_image,
          row.alternate_image_two,
          row.alternate_image_three,
          row.alternate_image_four,
        ]
  )
    .map((v) => publicHttps(v)?.href)
    .filter((v): v is string => !!v)
    .slice(0, 8);
  const currencyRaw = text(
    enhanced ? text(pricing.price).match(/ ([A-Z]{3})$/)?.[1] : row.currency,
    3,
  );
  const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : feed.currency;
  let price = amount(
    enhanced ? text(pricing.price).replace(/ [A-Z]{3}$/, "") : row.search_price,
  );
  const referencePrice = amount(
    enhanced ? null : row.rrp_price || row.product_price_old,
  );
  let validFrom = sourceDate(enhanced ? null : row.valid_from, true),
    end = sourceDate(enhanced ? null : row.valid_to, true);
  if (enhanced && pricing.sale_price) {
    const [start, finish] = text(pricing.sale_price_effective_date).split("/");
    const startAt = sourceDate(start),
      endAt =
        finish && Number.isFinite(Date.parse(finish))
          ? new Date(finish).toISOString()
          : null;
    if (
      startAt &&
      endAt &&
      Date.parse(startAt) <= Date.now() &&
      Date.parse(endAt) > Date.now() &&
      text(pricing.sale_price).endsWith(" " + currency)
    ) {
      price = amount(text(pricing.sale_price).replace(/ [A-Z]{3}$/, ""));
      validFrom = startAt;
      end = endAt;
    }
  }
  const sourceUpdatedAt = sourceDate(
      enhanced ? meta.updated_at : row.last_updated,
    ),
    feedUpdatedAt = feed.sourceUpdatedAt;
  const basis = sourceUpdatedAt || feedUpdatedAt;
  const ttlEnd = basis
    ? Date.parse(basis) + feed.policy.priceTtlHours * 3600000
    : NaN;
  const commercialEnd = end ? Date.parse(end) : Infinity;
  const validUntil = Number.isFinite(ttlEnd)
    ? new Date(Math.min(ttlEnd, commercialEnd)).toISOString()
    : null;
  const stock = normalize(
    text(enhanced ? pricing.availability : row.stock_status),
  );
  const availability =
    stock === "in stock" ||
    stock === "in_stock" ||
    (!enhanced && String(row.in_stock) === "1")
      ? "in_stock"
      : stock === "out of stock" ||
          stock === "out_of_stock" ||
          (!enhanced && String(row.in_stock) === "0")
        ? "out_of_stock"
        : "unknown";
  const description = text(
    enhanced ? basic.description : row.description,
    8000,
  );
  const externalCategory = text(
    enhanced
      ? categories.product_type || categories.google_product_category
      : row.merchant_category || row.category_name,
    400,
  );
  const category: Category = "other";
  const features = [
    brand && `Marca: ${brand}`,
    model && `Modelo: ${model}`,
    ...Object.entries(sorted).map(([key, value]) => `${key}: ${value}`),
    text(enhanced ? null : row.specifications, 2000),
  ].filter((v): v is string => !!v);
  return {
    listingKey,
    advertiserId: advertiser.id,
    publisherId: feed.publisherId,
    sourceProductId,
    awinProductId,
    name,
    description,
    brand,
    model,
    gtin,
    mpn,
    externalCategory,
    category,
    variant: sorted,
    identityKey,
    image,
    additionalImages,
    originalUrl,
    affiliateUrl: link,
    linkStatus: link ? "verified" : rawLink ? "invalid" : "missing",
    price,
    currency,
    referencePrice,
    availability,
    shipping: amount(enhanced ? null : row.delivery_cost, true),
    commercialText: text(
      enhanced ? null : row.promotional_text || row.terms_of_contract,
      1000,
    ),
    installment: null,
    sourceUpdatedAt,
    feedUpdatedAt,
    importedAt,
    validFrom,
    validUntil,
    features,
    technicalHash: hash([
      name,
      description,
      brand,
      model,
      gtin,
      mpn,
      sorted,
      features,
    ]),
  };
}
export function priceCurrent(item: AwinRecord, now = Date.now()) {
  return (
    item.price !== null &&
    !!item.validUntil &&
    Date.parse(item.validUntil) > now &&
    (!item.validFrom || Date.parse(item.validFrom) <= now)
  );
}
