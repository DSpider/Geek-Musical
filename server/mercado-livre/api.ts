import { z } from "zod";
import { fetchJson, ProviderError } from "../lib/http.js";
import { cleanText } from "../products/normalize.js";
import type { MercadoLivreConnection } from "../content/mercado-livre.js";
import { imageUrl, type MeliIdentity, type MeliValidated } from "./protocol.js";

const offer = z.object({
  price: z.number().finite().nonnegative().nullish(),
  currency_id: z.string().nullish(),
  available_quantity: z.number().finite().nonnegative().nullish(),
});
const listing = offer.extend({
  id: z.string(),
  status: z.string(),
  name: z.string().nullish(),
  title: z.string().nullish(),
  secure_thumbnail: z.string().nullish(),
  pictures: z
    .array(
      z.object({
        url: z.string().optional(),
        secure_url: z.string().optional(),
      }),
    )
    .nullish(),
  attributes: z
    .array(
      z.object({
        name: z.string().nullish(),
        value_name: z.string().nullish(),
      }),
    )
    .nullish(),
  buy_box_winner: offer.nullish(),
  variations: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]),
        price: z.number().finite().nonnegative().nullish(),
        available_quantity: z.number().finite().nonnegative().nullish(),
      }),
    )
    .nullish(),
});
export type MeliObservation = Pick<
  MeliValidated,
  "state" | "name" | "image" | "price" | "stock" | "reason" | "features"
>;
export class MeliApi {
  constructor(readonly connection: Pick<MercadoLivreConnection, "token">) {}
  async search(query: string, signal: AbortSignal) {
    const token = await this.connection.token(signal);
    const data = await fetchJson<{ results?: unknown[] }>(
      `https://api.mercadolibre.com/products/search?${new URLSearchParams({ status: "active", site_id: "MLB", q: query.slice(0, 200), limit: "20" })}`,
      { headers: { Authorization: `Bearer ${token}` } },
      signal,
    );
    return z
      .array(
        z.object({
          id: z.string().regex(/^MLB\d+$/),
          status: z.literal("active"),
          name: z.string(),
        }),
      )
      .max(100)
      .parse(data.results || []);
  }
  async observe(
    identity: MeliIdentity,
    signal: AbortSignal,
  ): Promise<MeliObservation> {
    let token = await this.connection.token(signal);
    const url = `https://api.mercadolibre.com/${identity.kind}/${identity.id}`;
    let data: unknown;
    try {
      data = await fetchJson(
        url,
        { headers: { Authorization: `Bearer ${token}` } },
        signal,
      );
    } catch (error) {
      if (!(error instanceof ProviderError) || error.status !== 401)
        throw error;
      token = await this.connection.token(signal, token);
      data = await fetchJson(
        url,
        { headers: { Authorization: `Bearer ${token}` } },
        signal,
      );
    }
    const parsed = listing.safeParse(data);
    if (!parsed.success || parsed.data.id !== identity.id)
      throw new ProviderError("invalid_response");
    const result = parsed.data;
    const base: MeliObservation = {
      state: "pending",
      name: cleanText(result.name || result.title, 500) || null,
      image:
        (result.pictures || [])
          .map((p) => imageUrl(p.secure_url || p.url))
          .find(Boolean) || imageUrl(result.secure_thumbnail),
      price: null,
      stock: "unknown",
      reason: "unconfirmed",
      features: (result.attributes || [])
        .flatMap((a) =>
          a.name && a.value_name
            ? [cleanText(`${a.name}: ${a.value_name}`, 300)]
            : [],
        )
        .filter(Boolean)
        .slice(0, 100),
    };
    if (result.status === "closed")
      return { ...base, state: "invalid", reason: "closed" };
    if (
      [
        "paused",
        "inactive",
        "under_review",
        "payment_required",
        "not_yet_active",
      ].includes(result.status)
    )
      return { ...base, state: "unavailable", reason: result.status };
    if (result.status !== "active" || !base.name)
      throw new ProviderError("invalid_response");
    let selected =
      identity.kind === "products" ? result.buy_box_winner : result;
    if (identity.kind === "products" && !selected) {
      const offers = await fetchJson<{
        results?: { item_id?: string; price?: number; currency_id?: string }[];
      }>(
        `${url}/items?limit=100`,
        { headers: { Authorization: `Bearer ${token}` } },
        signal,
      );
      const prices = (offers.results || [])
        .filter(
          (o) =>
            /^MLB\d+$/.test(o.item_id || "") &&
            o.currency_id === "BRL" &&
            typeof o.price === "number" &&
            Number.isFinite(o.price) &&
            o.price > 0,
        )
        .map((o) => o.price!);
      if (!prices.length)
        return { ...base, state: "unavailable", reason: "no_offers" };
      selected = { price: Math.min(...prices), currency_id: "BRL" };
    }
    if (selected?.currency_id && selected.currency_id !== "BRL")
      throw new ProviderError("unsupported_currency");
    let price =
        selected?.currency_id === "BRL" && selected.price && selected.price > 0
          ? selected.price
          : null,
      quantity = selected?.available_quantity;
    if (identity.variationId) {
      const variant = result.variations?.find(
        (v) => String(v.id) === identity.variationId,
      );
      if (!variant) throw new ProviderError("variant_unconfirmed");
      price =
        selected?.currency_id === "BRL" && variant.price && variant.price > 0
          ? variant.price
          : null;
      quantity = variant.available_quantity;
    }
    const stock =
      typeof quantity === "number"
        ? quantity > 0
          ? "in_stock"
          : "out_of_stock"
        : "unknown";
    return {
      ...base,
      state: stock === "out_of_stock" ? "unavailable" : "active",
      stock,
      price,
      reason: stock === "out_of_stock" ? "out_of_stock" : "active",
    };
  }
}
