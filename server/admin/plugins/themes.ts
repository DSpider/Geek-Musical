import { z } from "zod";
import type { AdminPluginDefinition } from "../registry.js";
import { settingsApi } from "./settings-api.js";
export const themesPlugin: AdminPluginDefinition = {
  id: "themes",
  name: "Temas",
  description: "Tema ativo e tokens compartilhados de identidade e leitura.",
  version: "1.0.0",
  permissions: [{ id: "themes.manage", roles: ["admin"] }],
  pages: [
    {
      label: "Temas",
      path: "/gm-admin/themes",
      page: "themes",
      permission: "themes.manage",
      icon: "Palette",
      position: 60,
    },
  ],
  settings: [
    {
      key: "themes.active",
      schema: z.enum(["guia", "editorial"]),
      defaultValue: "guia",
    },
    {
      key: "themes.font",
      schema: z.enum(["manrope", "system"]),
      defaultValue: "manrope",
    },
    {
      key: "themes.readingWidth",
      schema: z.number().int().min(600).max(900),
      defaultValue: 740,
    },
    {
      key: "themes.readingSize",
      schema: z.number().int().min(16).max(24),
      defaultValue: 17,
    },
    {
      key: "themes.lineHeight",
      schema: z.number().min(1.6).max(2.2),
      defaultValue: 1.9,
    },
  ],
  api: settingsApi("themes", "themes.manage"),
};
export const themePresets = {
  guia: {
    blue: "#470e68",
    purple: "#12618C",
    link: "#470e68",
    buttonBlue: "#470e68",
    buttonPurple: "#12618C",
  },
  editorial: {
    blue: "#470e68",
    purple: "#12618C",
    link: "#470e68",
    buttonBlue: "#470e68",
    buttonPurple: "#12618C",
  },
};
