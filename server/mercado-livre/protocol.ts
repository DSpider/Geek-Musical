import { createHash } from "node:crypto";
import { z } from "zod";

export const sourceSchema = z
  .object({
    eventId: z.string().regex(/^[a-zA-Z0-9:-]{1,100}$/),
    title: z.string().trim().min(1).max(500),
    originalUrl: z.string().max(4000).nullable(),
    affiliateUrl: z.string().max(4000),
    sourceAt: z.iso.datetime({ offset: true }),
    tipopromo: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    groupNumber: z.number().int().nonnegative().nullable(),
    groupOrder: z.number().int().positive().nullable(),
    legacy: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      !trustedUrl(value.affiliateUrl, true) ||
      (value.originalUrl && !trustedUrl(value.originalUrl, true))
    )
      ctx.addIssue({ code: "custom", message: "URL Mercado Livre inválida." });
    const preferred = value.tipopromo === 0 ? 1 : 31;
    if (
      value.groupNumber !== preferred &&
      (value.tipopromo === 0 || value.groupOrder !== 1 || value.legacy)
    )
      ctx.addIssue({
        code: "custom",
        message: "Grupo fora da seleção autorizada.",
      });
  });
export type MeliSource = z.infer<typeof sourceSchema>;
export interface MeliIdentity {
  kind: "items" | "products";
  id: string;
  variationId: string | null;
  key: string;
}
export function trustedUrl(value: string, short = false) {
  try {
    const url = new URL(value);
    const hosts = short
      ? ["mercadolivre.com.br", "meli.la", "meli.promo"]
      : ["mercadolivre.com.br"];
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !/[\x00-\x20]/.test(value) &&
      hosts.some(
        (host) =>
          url.hostname === host ||
          (host === "mercadolivre.com.br" && url.hostname.endsWith("." + host)),
      )
    );
  } catch {
    return false;
  }
}
export function identityOf(value: string | null): MeliIdentity | null {
  if (!value || !trustedUrl(value)) return null;
  const url = new URL(value),
    fragment = new URLSearchParams(url.hash.slice(1)),
    catalog = url.pathname.match(/\/p\/(MLB\d+)(?:\/|$)/)?.[1],
    itemPath = url.pathname.match(/\/MLB-(\d+)(?:-|\/|$)/)?.[1],
    userProduct = /\/up\/MLBU\d+(?:\/|$)/.test(url.pathname),
    selectedItems = [
      ...url.searchParams.getAll("wid"),
      ...url.searchParams.getAll("item_id"),
      ...fragment.getAll("wid"),
      ...fragment.getAll("item_id"),
    ],
    wid = selectedItems[0] || null,
    item = wid || (itemPath ? "MLB" + itemPath : null),
    id = item || catalog,
    variants = [
      ...url.searchParams.getAll("variation_id"),
      ...url.searchParams.getAll("variation"),
      ...fragment.getAll("variation_id"),
      ...fragment.getAll("variation"),
    ],
    variant = variants[0] || null;
  if (
    !(catalog || userProduct || itemPath) ||
    !id ||
    selectedItems.some((value) => value !== wid || !/^MLB\d+$/.test(value)) ||
    (itemPath && wid && "MLB" + itemPath !== wid) ||
    variants.some((value) => value !== variant || !/^\d{1,20}$/.test(value)) ||
    (variant && !item)
  )
    return null;
  const kind = item ? "items" : "products",
    variationId = item ? variant : null;
  return {
    kind,
    id,
    variationId,
    key: `${kind}:${id}${variationId ? ":" + variationId : ""}`,
  };
}
const stateSchema = z.enum(["active", "pending", "unavailable", "invalid"]);
export const validatedSchema = z
  .object({
    key: z.string().regex(/^(items|products):MLB\d+(?::\d+)?$/),
    revision: z.number().int().positive(),
    source: sourceSchema,
    state: stateSchema,
    name: z.string().max(500).nullable(),
    image: z.string().max(4000).nullable(),
    price: z.number().positive().finite().nullable(),
    features: z.array(z.string().max(300)).max(100),
    stock: z.enum(["in_stock", "out_of_stock", "unknown"]),
    checkedAt: z.iso.datetime(),
    reason: z.string().regex(/^[a-z_0-9]{1,70}$/),
    missingCount: z.number().int().nonnegative(),
    missingSlot: z.string().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (identityOf(value.source.originalUrl)?.key !== value.key)
      ctx.addIssue({ code: "custom", message: "Identidade divergente." });
    if (value.image && !imageUrl(value.image))
      ctx.addIssue({ code: "custom", message: "Imagem inválida." });
    if (value.state === "active" && !value.name)
      ctx.addIssue({ code: "custom", message: "Nome ausente." });
  });
export type MeliValidated = z.infer<typeof validatedSchema>;
export function imageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "mlstatic.com" ||
        url.hostname.endsWith(".mlstatic.com"))
      ? value
      : null;
  } catch {
    return null;
  }
}
export const envelopeSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^(source-[a-f0-9]{32}|validation-\d+-\d+)$/),
    kind: z.enum(["source", "validation"]),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    body: z.string().max(4_000_000),
  })
  .strict();
export type MeliEnvelope = z.infer<typeof envelopeSchema>;
export const checksum = (body: string) =>
  createHash("sha256").update(body).digest("hex");
export function parseEnvelope(value: string) {
  if (Buffer.byteLength(value) > 5_000_000) throw new Error("batch_limit");
  const envelope = envelopeSchema.parse(JSON.parse(value));
  if (
    checksum(envelope.body) !== envelope.checksum ||
    !envelope.id.startsWith(envelope.kind + "-")
  )
    throw new Error("batch_integrity");
  return {
    envelope,
    records:
      envelope.kind === "source"
        ? z
            .array(sourceSchema)
            .min(1)
            .max(1000)
            .parse(JSON.parse(envelope.body))
        : z
            .array(validatedSchema)
            .min(1)
            .max(1000)
            .parse(JSON.parse(envelope.body)),
  };
}
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function schedule(now: number) {
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return {
    open: minutes >= 480 && minutes <= 1320,
    minutes,
    day: `${parts.year}-${parts.month}-${parts.day}`,
    slot: `${parts.year}-${parts.month}-${parts.day}:${Math.floor(minutes / 15)}`,
  };
}
export function visible(record: MeliValidated, now: number) {
  const age = now - Date.parse(record.checkedAt);
  const window = schedule(now);
  const closing =
    Date.parse(window.day + "T22:00:00-03:00") -
    (window.minutes < 480 ? 24 * 3600000 : 0);
  // A mudança de horário não ressuscita registros já vencidos na janela anterior.
  return (
    record.state === "active" &&
    age >= 0 &&
    (window.open
      ? age <= 30 * 60000
      : Date.parse(record.checkedAt) >= closing - 30 * 60000)
  );
}
export function currentPrice(record: MeliValidated, now: number) {
  const age = now - Date.parse(record.checkedAt);
  return record.state === "active" && age >= 0 && age < 15 * 60_000
    ? record.price
    : null;
}
