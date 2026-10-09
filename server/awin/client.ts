import { z } from "zod";
import type { AwinConfig } from "./config.js";
import { AwinHttp } from "./http.js";
import type { AwinRepository, FeedMetadata, Program } from "./repository.js";
import { parseFeed } from "./parsers.js";
import { sourceDate } from "./normalize.js";
import {
  affiliateUrl,
  merchantUrl,
  publicHttps,
  secretFreeDownloadPath,
  validDomain,
} from "./urls.js";
import { cleanText } from "../products/normalize.js";
import { AwinError } from "./errors.js";
const programmeSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    status: z.string(),
    currencyCode: z.string().optional(),
    linkStatus: z.string().optional(),
    primaryRegion: z
      .object({ countryCode: z.string() })
      .passthrough()
      .optional(),
    validDomains: z.array(z.object({ domain: z.string() })).optional(),
    displayUrl: z.string().optional(),
    logoUrl: z.string().optional(),
  })
  .passthrough();
// Columns exposed by the account's official Create-a-Feed interface; no merchant-specific mappings.
const columns =
  "data_feed_id,merchant_id,merchant_name,aw_product_id,aw_deep_link,merchant_product_id,product_name,description,merchant_category,category_name,merchant_deep_link,merchant_image_url,aw_image_url,currency,search_price,store_price,delivery_cost,last_updated,brand_name,colour,specifications,condition,product_model,model_number,mpn,ean,product_GTIN,product_type,rrp_price,product_price_old,promotional_text,terms_of_contract,in_stock,stock_status,valid_from,valid_to,parent_product_id,alternate_image,alternate_image_two,alternate_image_three,alternate_image_four,Fashion:size";
export class AwinClient {
  constructor(
    readonly config: AwinConfig,
    readonly repository: AwinRepository,
    readonly http = new AwinHttp(config.publisherId),
  ) {}
  async programs(signal = AbortSignal.timeout(30000)) {
    if (!this.config.apiToken) throw new AwinError("credential_pending");
    const programs: Program[] = [];
    for (const relationship of ["joined", "pending", "suspended"] as const) {
      const result = await this.http.json(
        `https://api.awin.com/publishers/${this.config.publisherId}/programmes?relationship=${relationship}`,
        { token: this.config.apiToken, signal },
      );
      const parsed = z.array(programmeSchema).max(20000).safeParse(result);
      if (!parsed.success) throw new AwinError("invalid_response");
      for (const p of parsed.data) {
        const display = publicHttps(p.displayUrl);
        const domains = [
          ...new Set([
            ...(p.validDomains || [])
              .map((v) => validDomain(v.domain))
              .filter((v): v is string => !!v),
            ...(display ? [display.hostname] : []),
          ]),
        ];
        programs.push({
          id: p.id,
          publisherId: this.config.publisherId,
          name: cleanText(p.name, 300),
          logoUrl: publicHttps(p.logoUrl)?.href || null,
          relationship,
          status: p.status,
          linkStatus: p.linkStatus || null,
          country: p.primaryRegion?.countryCode || null,
          currency: p.currencyCode || null,
          domains,
          discoveredAt: new Date().toISOString(),
        });
      }
    }
    return programs;
  }
  async feeds(signal = AbortSignal.timeout(60000)) {
    if (!this.config.feedKey) throw new AwinError("credential_pending");
    const eligible = new Set(
      this.repository
        .advertisers()
        .filter((a) => a.relationship === "joined")
        .map((a) => a.id),
    );
    if (!eligible.size) throw new AwinError("ineligible");
    const response = await this.http.request(
      `https://productdata.awin.com/datafeed/list/apikey/${encodeURIComponent(this.config.feedKey)}`,
      { signal },
    );
    const result: FeedMetadata[] = [];
    for await (const row of parseFeed(response, "csv", {
      maxBytes: 4 * 1024 * 1024,
      maxExpandedBytes: 4 * 1024 * 1024,
      signal,
    })) {
      const advertiserId = Number(row["Advertiser ID"]);
      if (!eligible.has(advertiserId) || row["Membership Status"] !== "active")
        continue;
      const sourceId = String(row["Feed ID"] || "");
      if (!/^\d+$/.test(sourceId)) throw new AwinError("invalid_feed");
      if (typeof row.URL !== "string" || !row.URL) continue;
      const path = secretFreeDownloadPath(
        row.URL,
        this.config.feedKey,
        this.config.publisherId,
      );
      const actual = new URL(row.URL);
      if (!actual.pathname.includes(`/fid/${sourceId}/`))
        throw new AwinError("invalid_feed");
      // Request the same official CSV with explicit currency/availability fields even when the list's preset omits them.
      const downloadPath = path.replace(
        /\/columns\/[^/]+\//,
        `/columns/${encodeURIComponent(columns)}/`,
      );
      result.push({
        id: `${this.config.publisherId}:csv:${sourceId}`,
        publisherId: this.config.publisherId,
        advertiserId,
        sourceId,
        name: cleanText(row["Feed Name"], 300),
        format: "csv",
        language: cleanText(row.Language, 40),
        currency: null,
        sourceUpdatedAt: sourceDate(row["Last Imported"]),
        downloadPath,
        expectedRecords: Number.isFinite(Number(row["No of products"]))
          ? Number(row["No of products"])
          : null,
        metadataCheckedAt: sourceDate(row["Last Checked"]),
      });
    }
    return result;
  }
  async generateLink(
    advertiserId: number,
    destination: string,
    context: "search" | "comparison" | "editorial",
    signal = AbortSignal.timeout(30000),
  ) {
    const a = this.repository.advertiser(advertiserId);
    if (
      !a ||
      a.relationship !== "joined" ||
      a.status !== "Active" ||
      a.linkStatus === "Offline" ||
      !a.enabled ||
      !a.termsReviewed
    )
      throw new AwinError("ineligible");
    const direct = merchantUrl(destination, a);
    if (!direct) throw new AwinError("unsafe_url");
    const cached = this.repository.link(advertiserId, direct, context);
    if (cached && affiliateUrl(cached, a, direct, null)) return cached;
    if (!this.config.apiToken) throw new AwinError("credential_pending");
    const response = await this.http.json(
      `https://api.awin.com/publishers/${this.config.publisherId}/linkbuilder/generate`,
      {
        token: this.config.apiToken,
        method: "POST",
        body: {
          advertiserId,
          destinationUrl: direct,
          parameters: { clickref: `mago_${context}` },
          shorten: false,
        },
        signal,
      },
    );
    const result = z
      .object({ url: z.string() })
      .passthrough()
      .safeParse(response);
    if (!result.success) throw new AwinError("restricted");
    const link = affiliateUrl(result.data.url, a, direct, null);
    if (!link) throw new AwinError("unsafe_url");
    this.repository.saveLink(advertiserId, direct, context, link);
    return link;
  }
}
