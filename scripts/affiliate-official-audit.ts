import "../server/config.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { AmazonProvider } from "../server/providers/amazon/index.js";
import { ShopeeProvider } from "../server/providers/shopee/index.js";
import { affiliateStore } from "../shared/affiliate.js";
import { ProviderError } from "../server/lib/http.js";
type Offer = { unique_id: string; title: string; url: string };
const data = JSON.parse(
  readFileSync("artifacts/wordpress/export.private.json", "utf8"),
) as { offers: Record<string, Offer[]> };
const entries = new Map<string, Offer>();
for (const offer of Object.values(data.offers).flat())
  if (affiliateStore(offer.url)) entries.set(offer.url, offer);
const amazon = new AmazonProvider(),
  shopee = new ShopeeProvider();
const records: {
  url: string;
  store: string;
  identity: string | null;
  accessibility: string;
  product: string;
  tracking: string;
  officialCandidate?: string;
  expectedTitle?: string;
  observedTitle?: string;
  note?: string;
  checkedAt: string;
}[] = [];
const ids = [
  ...new Set(
    [...entries.values()]
      .filter((o) => affiliateStore(o.url) === "amazon")
      .map((o) => o.url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1])
      .filter((v): v is string => !!v),
  ),
];
const returned = new Map<string, { title: string; url: string }>();
let amazonFailure = "";
for (let index = 0; index < ids.length; index += 10) {
  try {
    const items = await amazon.getItems(
      ids.slice(index, index + 10),
      AbortSignal.timeout(20000),
      "geekmusical-20",
    );
    for (const item of items)
      returned.set(item.sourceId, { title: item.product.name, url: item.url });
  } catch (error) {
    amazonFailure =
      error instanceof ProviderError
        ? `${error.code}${error.status ? ":" + error.status : ""}`
        : "official-request-failed";
    break;
  }
  console.log(
    `Amazon: ${Math.min(index + 10, ids.length)}/${ids.length} identidades consultadas.`,
  );
}
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
let shopeeFailure = "";
for (const entry of entries.values()) {
  const store = affiliateStore(entry.url)!;
  const record: (typeof records)[number] = {
    url: entry.url,
    store,
    identity: null,
    accessibility: "pending",
    product: "pending",
    tracking: "unconfirmed",
    checkedAt: new Date().toISOString(),
  };
  if (store === "amazon") {
    const asin =
      entry.url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] || null;
    record.identity = asin;
    const result = asin ? returned.get(asin) : undefined;
    if (result) {
      record.accessibility = "official-api-returned";
      record.expectedTitle = entry.title;
      record.observedTitle = result.title;
      record.product =
        normalize(result.title) === normalize(entry.title)
          ? "correct"
          : "pending-title-review";
      if (
        new URL(result.url).searchParams.get("tag") === "geekmusical-20" &&
        result.url.includes(asin!)
      ) {
        record.tracking = "official-candidate-confirmed";
        record.officialCandidate = result.url;
      }
    } else
      record.note =
        amazonFailure ||
        (asin ? "item-not-returned" : "short-link-requires-resolution");
  } else if (store === "shopee") {
    const match = new URL(entry.url).pathname.match(
      /\/product\/(\d+)\/(\d+)|-i\.(\d+)\.(\d+)$/,
    );
    if (match && !shopeeFailure) {
      const shop = match[1] || match[3],
        item = match[2] || match[4];
      record.identity = shop + ":" + item;
      try {
        const result = await shopee.lookup(
          shop,
          item,
          AbortSignal.timeout(10000),
        );
        if (result) {
          record.accessibility = "official-api-returned";
          record.expectedTitle = entry.title;
          record.observedTitle = result.name;
          record.product =
            normalize(result.name) === normalize(entry.title)
              ? "correct"
              : "pending-title-review";
          record.officialCandidate = await shopee.affiliateLink(
            `https://shopee.com.br/product/${shop}/${item}`,
            AbortSignal.timeout(10000),
          );
          record.tracking = "official-candidate-confirmed";
        } else record.note = "item-not-returned";
      } catch (error) {
        shopeeFailure =
          error instanceof ProviderError
            ? `${error.code}${error.status ? ":" + error.status : ""}`
            : "official-request-failed";
        record.note = shopeeFailure;
      }
    } else record.note = shopeeFailure || "short-link-requires-resolution";
  } else if (store === "mercado-livre")
    record.note = "official-authenticated-link-generator-required";
  else record.note = "historical-merchant-preserved";
  records.push(record);
}
mkdirSync("docs/migration", { recursive: true });
writeFileSync(
  "docs/migration/official-affiliate-verification.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      amazonIdentities: ids.length,
      amazonReturned: returned.size,
      amazonFailure,
      shopeeFailure,
      records,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    distinctSourceOffers: records.length,
    amazonIdentities: ids.length,
    amazonReturned: returned.size,
    amazonFailure,
    shopeeFailure,
    officialCandidates: records.filter((r) => !!r.officialCandidate).length,
  }),
);
