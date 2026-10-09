import type { AdminPluginDefinition } from "../registry.js";
import { generalSettings } from "../settings.js";
import { settingsApi } from "./settings-api.js";
import { site } from "../../../shared/site.js";
export const settingsPlugin: AdminPluginDefinition = {
  id: "settings",
  name: "Configurações",
  description:
    "Parâmetros globais funcionais separados de ambiente e segredos.",
  version: "1.0.0",
  required: true,
  permissions: [{ id: "settings.manage", roles: ["admin"] }],
  pages: [
    {
      label: "Configurações",
      path: "/gm-admin/settings",
      page: "settings",
      permission: "settings.manage",
      icon: "Settings",
      position: 80,
    },
  ],
  settings: generalSettings,
  api: settingsApi(
    "settings",
    "settings.manage",
    (ctx) => ({
      infrastructure: {
        siteName: site.name,
        siteUrl: ctx.web.siteUrl,
        publicSite: ctx.web.publicSite,
        preview: ctx.web.editorialPreview,
        environment: ctx.web.environment || "development",
      },
    }),
    (ctx) =>
      ctx.content.setPageSize(
        ctx.settings.get<number>("settings.blog.postsPerPage"),
      ),
  ),
};
