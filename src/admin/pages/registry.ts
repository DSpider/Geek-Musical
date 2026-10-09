import type { ComponentType } from "react";
import { PostsPage } from "./Posts.js";
import { HomeEditorPage } from "./MusicalHomeEditor.js";
import { CategoriesPage } from "./Categories.js";
import { ThemesPage, SettingsPage } from "./Configuration.js";
import { LinkBuildingPage } from "./LinkBuilding.js";
import { RedirectPage } from "./Redirect.js";
import { AnalyticsPage } from "./Analytics.js";
import { DashboardPage, PluginsPage, SystemPage, AuditPage } from "./Core.js";
import { AffiliatesPage } from "./Affiliates.js";
import { MediaPage, SeoPage, UsersPage } from "./Governance.js";
// Um ponto de composição: adicionar uma página não altera o shell/Core.
export const adminPages: Record<string, ComponentType> = {
  "/gm-admin": DashboardPage,
  "/gm-admin/posts": PostsPage,
  "/gm-admin/home": HomeEditorPage,
  "/gm-admin/categories": CategoriesPage,
  "/gm-admin/themes": ThemesPage,
  "/gm-admin/link-building": LinkBuildingPage,
  "/gm-admin/redirect": RedirectPage,
  "/gm-admin/analytics": AnalyticsPage,
  "/gm-admin/settings": SettingsPage,
  "/gm-admin/plugins": PluginsPage,
  "/gm-admin/system": SystemPage,
  "/gm-admin/audit": AuditPage,
  "/gm-admin/affiliates": AffiliatesPage,
  "/gm-admin/media": MediaPage,
  "/gm-admin/seo": SeoPage,
  "/gm-admin/users": UsersPage,
};
