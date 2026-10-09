import {
  deleteCategorySchema,
  saveCategorySchema,
} from "../../../shared/admin.js";
import { adminUser } from "../auth.js";
import { AdminError } from "../errors.js";
import { saveCategory, deleteCategory } from "../../content/admin-service.js";
import type { AdminPluginDefinition } from "../registry.js";
export const categoriesPlugin: AdminPluginDefinition = {
  id: "categories",
  name: "Categorias",
  description: "Taxonomia, ordem e guias centrais compartilhados pelo blog.",
  version: "1.0.0",
  required: true,
  permissions: [
    { id: "categories.read", roles: ["admin", "editor", "seo"] },
    { id: "categories.manage", roles: ["admin"] },
  ],
  pages: [
    {
      label: "Categorias",
      path: "/gm-admin/categories",
      page: "categories",
      permission: "categories.read",
      icon: "Folder",
      position: 30,
    },
  ],
  widgets: [
    {
      id: "categories.total",
      label: "Categorias",
      permission: "categories.read",
      read: (ctx) => ctx.content.snapshot().registries.categories.length,
    },
  ],
  api: [
    {
      method: "get",
      path: "/categories",
      permission: "categories.read",
      handle: (ctx, _req, res) => {
        ctx.content.refresh();
        const state = ctx.content.snapshot();
        res.json({
          categories: state.registries.categories,
          ctas: state.registries.ctas,
          posts: state.posts.map((p) => ({
            id: p.id,
            title: p.title,
            categoryId: p.categoryId,
          })),
          revision: ctx.content.revision,
        });
      },
    },
    {
      method: "post",
      path: "/categories",
      permission: "categories.manage",
      handle: (ctx, req, res) => {
        const input = saveCategorySchema.parse(req.body);
        saveCategory(
          ctx.content,
          adminUser(res),
          input.revision,
          input.category,
          true,
        );
        res.status(201).json({ revision: ctx.content.revision });
      },
    },
    {
      method: "put",
      path: "/categories/:id",
      permission: "categories.manage",
      handle: (ctx, req, res) => {
        const input = saveCategorySchema.parse(req.body);
        if (req.params.id !== input.category.id)
          throw new AdminError(
            "VALIDATION_ERROR",
            "O ID da categoria é estável.",
          );
        saveCategory(
          ctx.content,
          adminUser(res),
          input.revision,
          input.category,
          false,
        );
        res.json({ revision: ctx.content.revision });
      },
    },
    {
      method: "delete",
      path: "/categories/:id",
      permission: "categories.manage",
      handle: (ctx, req, res) => {
        const input = deleteCategorySchema.parse(req.body);
        deleteCategory(
          ctx.content,
          adminUser(res),
          input.revision,
          String(req.params.id),
          input.reassignTo,
        );
        res.json({ revision: ctx.content.revision });
      },
    },
  ],
};
