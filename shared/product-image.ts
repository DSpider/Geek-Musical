import { z } from "zod";

export const localProductImage = /^\/images\/products\/[a-f0-9]{64}\.webp$/;
const sourceUrlSchema = z
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" && !url.username && !url.password && !url.port
    );
  }, "Use uma origem HTTPS sem credenciais.");
const hosts: Record<string, string[]> = {
  "amazon-api": ["media-amazon.com", "ssl-images-amazon.com"],
  "shopee-api": [
    "shopee.com.br",
    "shopee.sg",
    "susercontent.com",
    "shopeemobile.com",
  ],
  "meli-api": ["mlstatic.com"],
};
export function safeProductImageUrl(url: string, source: string) {
  if (source === "upload" || source === "web")
    return localProductImage.test(url);
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      !!hosts[source]?.some(
        (host) =>
          parsed.hostname === host || parsed.hostname.endsWith("." + host),
      )
    );
  } catch {
    return false;
  }
}
export const productImageSchema = z
  .object({
    url: z.string().max(2000),
    alt: z.string().trim().min(3).max(300),
    width: z.number().int().positive().max(20000).optional(),
    height: z.number().int().positive().max(20000).optional(),
    source: z.enum(["amazon-api", "shopee-api", "meli-api", "web", "upload"]),
    sourceUrl: sourceUrlSchema.optional(),
    checkedAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (image) => safeProductImageUrl(image.url, image.source),
    "Imagem ou origem não permitida.",
  );
export type ProductImage = z.infer<typeof productImageSchema>;
export const productImageReferenceSchema = z
  .object({
    source: z.enum(["amazon-api", "shopee-api", "meli-api"]),
    sourceUrl: sourceUrlSchema,
    alt: z.string().trim().min(3).max(300),
    url: z.undefined().optional(),
  })
  .strict();
export type ProductImageReference = z.infer<typeof productImageReferenceSchema>;
export function currentProductImage(
  image: ProductImage | ProductImageReference | null | undefined,
  now = Date.now(),
) {
  const parsed = productImageSchema.safeParse(image);
  if (!parsed.success) return undefined;
  image = parsed.data;
  if (
    image.source === "amazon-api" &&
    (Date.parse(image.checkedAt) > now + 60000 ||
      now - Date.parse(image.checkedAt) >= 86400000)
  )
    return undefined;
  return image;
}
