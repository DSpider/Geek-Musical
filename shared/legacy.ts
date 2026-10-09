import { z } from "zod";
import { safeContentLink, safeMediaPath } from "./content.js";

export const legacyPathSchema = z
  .string()
  .max(500)
  .regex(/^\/[a-zA-Z0-9%_-]+(?:\/[a-zA-Z0-9%_-]+)*\/?$/)
  .refine(
    (p) =>
      !/%(?:2f|5c|2e)/i.test(p) &&
      !/^\/(?:api|gm-admin|wp-admin|wp-content|wp-json|assets|sitemaps|\.well-known)(?:\/|-|$)/.test(
        p,
      ),
  );
export const legacyManifestSchema = z
  .object({
    version: z.literal(1),
    routes: z
      .array(
        z
          .object({
            path: legacyPathSchema,
            status: z.union([z.literal(301), z.literal(302), z.literal(410)]),
            destination: z
              .string()
              .max(2048)
              .refine((p) => p === "/" || safeContentLink(p))
              .optional(),
            forwardQuery: z.boolean(),
            source: z.enum([
              "wordpress",
              "rank-math",
              "pretty-links",
              "web-story",
            ]),
          })
          .strict()
          .superRefine((r, c) => {
            if ((r.status === 410) === !!r.destination)
              c.addIssue({
                code: "custom",
                message: "410 não tem destino; redirect exige destino.",
              });
            if (r.path === r.destination)
              c.addIssue({
                code: "custom",
                message: "Loop de redirecionamento.",
              });
          }),
      )
      .max(5000),
    media: z
      .array(
        z
          .object({
            path: z.string().max(2000).refine(safeMediaPath),
            file: z
              .string()
              .regex(/^[a-f0-9]{64}\.(?:png|jpg|jpeg|webp|avif|gif)$/),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            bytes: z.number().int().positive().max(50_000_000),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type LegacyManifest = z.infer<typeof legacyManifestSchema>;
