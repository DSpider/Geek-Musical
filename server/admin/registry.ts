import type { Request, Response, RequestHandler } from "express";
import type { z } from "zod";
import type { AdminMenuItem, AdminPluginInfo } from "../../shared/admin.js";
import type { AdminDatabase, Migration } from "./database.js";
import type { AdminAuth } from "./auth.js";
import type { ContentRepository } from "../content/repository.js";
import type { SettingsService } from "./settings.js";
import type { WebConfig } from "../config.js";
export interface PluginContext {
  db: AdminDatabase;
  auth: AdminAuth;
  content: ContentRepository;
  settings: SettingsService;
  web: WebConfig;
  registry: PluginRegistry;
}
export interface PermissionDefinition {
  id: string;
  roles: ("admin" | "editor" | "seo")[];
}
export interface SettingDefinition {
  key: string;
  schema: z.ZodType;
  defaultValue: unknown;
}
export interface AdminPageDefinition extends AdminMenuItem {
  page: string;
}
export interface AdminApiDefinition {
  method: "get" | "post" | "put" | "delete";
  path: string;
  permission: string;
  handle: (
    ctx: PluginContext,
    req: Request,
    res: Response,
  ) => unknown | Promise<unknown>;
}
export interface WidgetDefinition {
  id: string;
  label: string;
  permission: string;
  read: (ctx: PluginContext) => number | string;
}
export interface AdminPluginDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  required?: boolean;
  defaultEnabled?: boolean;
  close?: (ctx: PluginContext) => void;
  permissions: PermissionDefinition[];
  pages: AdminPageDefinition[];
  api: AdminApiDefinition[];
  settings?: SettingDefinition[];
  migrations?: Migration[];
  widgets?: WidgetDefinition[];
  services?: Record<string, unknown>;
  tasks?: { id: string; run: (ctx: PluginContext) => Promise<void> }[];
  publicMiddleware?: (ctx: PluginContext) => RequestHandler;
}
export class PluginRegistry {
  private readonly entries = new Map<string, AdminPluginDefinition>();
  private readonly routes = new Set<string>();
  private readonly permissionIds = new Set<string>([
    "dashboard.read",
    "plugins.manage",
    "audit.read",
    "system.read",
  ]);
  private readonly settingKeys = new Set<string>();
  register(plugin: AdminPluginDefinition) {
    if (!/^[a-z][a-z0-9-]*$/.test(plugin.id) || this.entries.has(plugin.id))
      throw new Error("Plugin com ID inválido/duplicado.");
    if (!/^\d+\.\d+\.\d+$/.test(plugin.version))
      throw new Error("Versão do plugin inválida.");
    const permissions = new Set(plugin.permissions.map((p) => p.id));
    if (permissions.size !== plugin.permissions.length)
      throw new Error("Permissão duplicada no plugin.");
    for (const permission of plugin.permissions) {
      if (
        !/^[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/.test(permission.id) ||
        this.permissionIds.has(permission.id)
      )
        throw new Error("Permissão inválida/duplicada.");
    }
    const routes: string[] = [];
    for (const page of plugin.pages) {
      if (
        !/^\/gm-admin\/[a-z0-9-]+$/.test(page.path) ||
        !permissions.has(page.permission)
      )
        throw new Error("Página/permissão do plugin inválida.");
      routes.push("page:" + page.path);
    }
    for (const api of plugin.api) {
      if (
        !new RegExp(`^/${plugin.id}(?:/|$)`).test(api.path) ||
        !permissions.has(api.permission)
      )
        throw new Error(
          "API deve pertencer ao namespace/permissões do plugin.",
        );
      routes.push(api.method + ":" + api.path);
    }
    if (
      new Set(routes).size !== routes.length ||
      routes.some((r) => this.routes.has(r))
    )
      throw new Error("Rota de plugin duplicada.");
    const keys = (plugin.settings || []).map((s) => s.key);
    if (
      new Set(keys).size !== keys.length ||
      keys.some(
        (key) => !key.startsWith(plugin.id + ".") || this.settingKeys.has(key),
      )
    )
      throw new Error("Configuração de plugin inválida/duplicada.");
    for (const setting of plugin.settings || [])
      setting.schema.parse(setting.defaultValue);
    for (const migration of plugin.migrations || [])
      if (!migration.id.startsWith(plugin.id + ":"))
        throw new Error("Migration deve usar namespace do plugin.");
    for (const widget of plugin.widgets || [])
      if (!permissions.has(widget.permission))
        throw new Error("Widget exige permissão registrada.");
    this.entries.set(plugin.id, plugin);
    routes.forEach((r) => this.routes.add(r));
    permissions.forEach((p) => this.permissionIds.add(p));
    keys.forEach((k) => this.settingKeys.add(k));
  }
  all() {
    return [...this.entries.values()];
  }
  get(id: string) {
    return this.entries.get(id);
  }
  service<T>(pluginId: string, name: string): T {
    const service = this.get(pluginId)?.services?.[name];
    if (service === undefined)
      throw new Error("Serviço de plugin não registrado.");
    return service as T;
  }
  async runTask(pluginId: string, taskId: string, ctx: PluginContext) {
    const plugin = this.get(pluginId);
    const task = plugin?.tasks?.find((task) => task.id === taskId);
    if (!plugin || !this.enabled(ctx.db, plugin) || !task)
      throw new Error("Tarefa de plugin indisponível.");
    await task.run(ctx);
  }
  enabled(db: AdminDatabase, plugin: AdminPluginDefinition) {
    return (
      !!plugin.required ||
      db.sql
        .prepare("SELECT enabled FROM plugin_state WHERE id=?")
        .get(plugin.id)?.enabled !== 0
    );
  }
  info(db: AdminDatabase): AdminPluginInfo[] {
    return this.all().map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      version: p.version,
      required: !!p.required,
      enabled: this.enabled(db, p),
      menu: p.pages.map(({ page: _page, ...menu }) => menu),
    }));
  }
  initialize(db: AdminDatabase) {
    db.migrate(this.all().flatMap((p) => p.migrations || []));
    db.transaction(() => {
      for (const role of ["super_admin", "admin", "editor", "seo"])
        db.sql.prepare("INSERT OR IGNORE INTO roles VALUES (?)").run(role);
      db.sql
        .prepare(
          "INSERT OR IGNORE INTO role_permissions VALUES ('super_admin','*')",
        )
        .run();
      for (const id of ["dashboard.read", "system.read"])
        for (const role of ["admin", "editor", "seo"])
          db.sql
            .prepare("INSERT OR IGNORE INTO role_permissions VALUES (?, ?)")
            .run(role, id);
      for (const id of ["plugins.manage", "audit.read"])
        db.sql
          .prepare("INSERT OR IGNORE INTO role_permissions VALUES ('admin', ?)")
          .run(id);
      for (const p of this.all()) {
        db.sql
          .prepare("INSERT OR IGNORE INTO plugin_state VALUES (?, ?)")
          .run(p.id, Number(p.defaultEnabled !== false));
        for (const permission of p.permissions)
          for (const role of permission.roles)
            db.sql
              .prepare("INSERT OR IGNORE INTO role_permissions VALUES (?, ?)")
              .run(role, permission.id);
      }
    });
  }
}
