import { z } from "zod";
import { relationsSchema } from "../../../shared/admin.js";
import { adminUser, can } from "../auth.js";
import { AdminError } from "../errors.js";
import { editorialDate } from "../../content/admin-service.js";
import type { AdminPluginDefinition } from "../registry.js";
import { settingsApi } from "./settings-api.js";
export const linkBuildingPlugin: AdminPluginDefinition = {
  id: "link-building",
  name: "Link Building",
  description:
    "Relações editoriais por ID, links recebidos/enviados e páginas órfãs.",
  version: "1.0.0",
  permissions: [
    { id: "linkbuilding.read", roles: ["admin", "editor", "seo"] },
    { id: "linkbuilding.manage", roles: ["admin", "seo"] },
  ],
  pages: [
    {
      label: "Link Building",
      path: "/gm-admin/link-building",
      page: "link-building",
      permission: "linkbuilding.read",
      icon: "Link",
      position: 40,
    },
  ],
  settings: [
    { key: "link-building.enabled", schema: z.boolean(), defaultValue: true },
  ],
  api: [
    {
      method: "get",
      path: "/link-building/graph",
      permission: "linkbuilding.read",
      handle: (ctx, _req, res) => {
        ctx.content.refresh();
        res.json({
          entries: ctx.content.graph(),
          revision: ctx.content.revision,
          enabled: ctx.settings.get<boolean>("link-building.enabled"),
        });
      },
    },
    {
      method: "put",
      path: "/link-building/relations/:id",
      permission: "linkbuilding.manage",
      handle: (ctx, req, res) => {
        const input = relationsSchema.parse(req.body);
        const user = adminUser(res);
        if (!ctx.settings.get<boolean>("link-building.enabled"))
          throw new AdminError(
            "CONFLICT",
            "Habilite o gerenciamento de relações antes de editar.",
          );
        ctx.content.commit(
          input.revision,
          user.id,
          "UPDATE_RELATIONS",
          "posts",
          String(req.params.id),
          (state) => {
            const post = state.posts.find((p) => p.id === req.params.id);
            if (!post)
              throw new AdminError("NOT_FOUND", "Artigo não encontrado.");
            if (post.status === "published" && !can(user, "posts.publish"))
              throw new AdminError(
                "FORBIDDEN",
                "Alterar relações publicadas exige permissão de publicação.",
              );
            post.relatedPostIds = input.relatedPostIds;
            post.updatedAt = editorialDate();
          },
        );
        res.json({ revision: ctx.content.revision });
      },
    },
    ...settingsApi("link-building", "linkbuilding.manage"),
  ],
};
