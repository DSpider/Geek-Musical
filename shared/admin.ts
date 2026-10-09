import { z } from "zod";
import {
  postSchema,
  categorySchema,
  editorialProductSchema,
} from "./content.js";

export const adminErrors = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;
export type AdminErrorCode = (typeof adminErrors)[number];
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}
export interface AdminMenuItem {
  label: string;
  path: string;
  icon: string;
  position: number;
  permission: string;
}
export interface AdminPluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  required: boolean;
  menu: AdminMenuItem[];
}
export interface DashboardWidget {
  id: string;
  label: string;
  value: number | string;
}
export interface AdminSession {
  user: AdminUser;
  csrfToken: string;
  plugins: AdminPluginInfo[];
  menu: AdminMenuItem[];
}
export interface PageResult<T> {
  items: T[];
  total: number;
  pages: number;
  page: number;
  revision?: string;
}
export const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();
export const listSchema = z
  .object({
    q: z.string().max(200).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    status: z.string().max(20).optional(),
    categoryId: z.string().max(100).optional(),
  })
  .strict();
export const postInputSchema = postSchema.safeExtend({
  body: z.string().max(200000),
});
export const savePostSchema = z
  .object({
    revision: revisionSchema,
    post: z.preprocess((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        return value;
      const post = value as Record<string, unknown>;
      const firstPublication = post.status === "published" && !post.publishedAt;
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      });
      return {
        ...post,
        // A primeira publicação e a atualização recebem a data real no servidor.
        updatedAt: firstPublication ? today : post.updatedAt,
        publishedAt:
          post.status === "published" ? post.publishedAt || today : undefined,
      };
    }, postInputSchema),
    approvePublication: z.boolean().default(false),
    products: z.array(editorialProductSchema).max(100).optional(),
  })
  .strict();
export const categoryInputSchema = categorySchema;
export const saveCategorySchema = z
  .object({ revision: revisionSchema, category: categoryInputSchema })
  .strict();
export const deleteSchema = z.object({ revision: revisionSchema }).strict();
export const bulkPostSchema = z
  .object({
    revision: revisionSchema,
    ids: z
      .array(
        z
          .string()
          .max(100)
          .regex(/^[A-Za-z][A-Za-z0-9-]*$/),
      )
      .min(1)
      .max(25)
      .refine((ids) => new Set(ids).size === ids.length, "Não repita IDs."),
    status: z.enum(["draft", "archived"]),
  })
  .strict();
export const deleteCategorySchema = deleteSchema
  .extend({
    reassignTo: z.string().max(100).optional(),
  })
  .strict();
export const relationsSchema = z
  .object({
    revision: revisionSchema,
    relatedPostIds: z
      .array(z.string().regex(/^[A-Za-z][A-Za-z0-9-]*$/))
      .max(100),
  })
  .strict();
export interface LinkGraphEntry {
  id: string;
  title: string;
  status: string;
  url: string;
  incoming: string[];
  outgoing: string[];
  bodyLinks: string[];
  relatedPostIds: string[];
  orphan: boolean;
}
export interface AuditEntry {
  id: number;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  createdAt: string;
  result: string;
}
export interface SettingsEnvelope {
  values: Record<string, unknown>;
  revision: string;
  environment: string;
  credentials?: Record<string, boolean>;
}
export const settingsUpdateSchema = z
  .object({
    revision: revisionSchema,
    values: z.record(z.string(), z.unknown()),
  })
  .strict();
export const passwordSchema = z.string().min(15).max(256);
