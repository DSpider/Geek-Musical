import { z } from "zod";
import { revisionSchema } from "./admin.js";

export const redirectAliasSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use letras sem acentos, números e hífens no alias.",
  );
export const redirectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    alias: redirectAliasSchema,
    destination: z.string().trim().min(1).max(2048),
    redirectType: z.union([z.literal(301), z.literal(302)]),
    status: z.enum(["active", "inactive"]),
  })
  .strict();
export type RedirectInput = z.infer<typeof redirectInputSchema>;
export interface RedirectRecord extends RedirectInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  revision: string;
}
export const saveRedirectSchema = z
  .object({
    redirect: redirectInputSchema,
    revision: revisionSchema.optional(),
  })
  .strict();
export const redirectListSchema = z
  .object({
    q: z.string().max(200).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    status: z.enum(["active", "inactive"]).optional(),
    type: z.coerce
      .number()
      .pipe(z.union([z.literal(301), z.literal(302)]))
      .optional(),
  })
  .strict();
export type RedirectListInput = z.infer<typeof redirectListSchema>;
