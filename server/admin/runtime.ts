import express, { Router, type Express } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  type AdminMenuItem,
  listSchema,
  revisionSchema,
} from "../../shared/admin.js";
import type { AdminConfig } from "./config.js";
import type { WebConfig } from "../config.js";
import { AdminDatabase, digest } from "./database.js";
import { AdminAuth, adminUser, can } from "./auth.js";
import { AdminError, adminErrorHandler } from "./errors.js";
import { SettingsService } from "./settings.js";
import { builtinPlugins } from "./plugins/index.js";

import { themePresets } from "./plugins/themes.js";
import { ContentRepository } from "../content/repository.js";
import type { PluginContext, PluginRegistry } from "./registry.js";
import { acquireWriterLock } from "./writer-lock.js";
import { closeMeliCatalog, meliCatalog } from "../mercado-livre/service.js";
import { defaultHomeLayout } from "../../shared/home-editor.js";
import { homePostCards } from "../content/discovery.js";
export const coreMenu: AdminMenuItem[] = [
  {
    label: "Dashboard",
    path: "/gm-admin",
    permission: "dashboard.read",
    icon: "LayoutDashboard",
    position: 10,
  },
  {
    label: "Plugins",
    path: "/gm-admin/plugins",
    permission: "plugins.manage",
    icon: "Blocks",
    position: 70,
  },
  {
    label: "Sistema",
    path: "/gm-admin/system",
    permission: "system.read",
    icon: "Activity",
    position: 90,
  },
  {
    label: "Auditoria",
    path: "/gm-admin/audit",
    permission: "audit.read",
    icon: "ShieldCheck",
    position: 100,
  },
];
export class AdminRuntime {
  readonly db: AdminDatabase;
  readonly auth: AdminAuth;
  readonly content: ContentRepository;
  readonly settings: SettingsService;
  readonly context: PluginContext;
  readonly router: Router;
  private readonly releaseWriter: () => void;
  constructor(
    readonly options: AdminConfig,
    readonly web: WebConfig,
    readonly registry: PluginRegistry = builtinPlugins(),
  ) {
    this.releaseWriter = acquireWriterLock(options.contentRoot);
    let opened: AdminDatabase | undefined;
    try {
      this.db = opened = new AdminDatabase(options.databaseFile);
      registry.initialize(this.db);
      this.settings = new SettingsService(
        this.db,
        registry.all().flatMap((p) => p.settings || []),
      );
      this.content = new ContentRepository(options.contentRoot, this.db);
      if (!this.settings.get("home.layout")) {
        this.db.sql
          .prepare("INSERT OR IGNORE INTO settings VALUES (?, ?, ?)")
          .run(
            "home.layout",
            JSON.stringify(
              defaultHomeLayout(homePostCards(this.content.catalog(false))),
            ),
            new Date().toISOString(),
          );
      }
      this.content.setPageSize(
        this.settings.get<number>("settings.blog.postsPerPage"),
      );
      this.auth = new AdminAuth(this.db, options, web);
      this.context = {
        db: this.db,
        auth: this.auth,
        content: this.content,
        settings: this.settings,
        web,
        registry,
      };
      this.router = this.createRouter();
    } catch (error) {
      opened?.close();
      this.releaseWriter();
      throw error;
    }
  }
  activateFunctionalSettings() {
    // Editorial portal has no product-search AI settings.
  }
  // Public extensions are mounted after technical/Admin/static routes, before the page fallback.
  mountPublic(app: Express) {
    for (const plugin of this.registry.all()) {
      const handler = plugin.publicMiddleware?.(this.context);
      if (handler)
        app.use((req, res, next) => {
          if (!this.registry.enabled(this.db, plugin)) return next();
          handler(req, res, next);
        });
    }
  }
  private menu(user: Parameters<typeof can>[0]) {
    return [
      ...coreMenu,
      ...this.registry
        .info(this.db)
        .filter((p) => p.enabled)
        .flatMap((p) => p.menu),
    ]
      .filter((m) => can(user, m.permission))
      .sort((a, b) => a.position - b.position);
  }
  private pluginsRevision() {
    return digest(
      JSON.stringify(this.registry.info(this.db).map((p) => [p.id, p.enabled])),
    );
  }
  private createRouter() {
    const router = Router();
    router.use((_req, res, next) => {
      res
        .set("Cache-Control", "no-store")
        .set("X-Robots-Tag", "noindex, nofollow");
      next();
    });
    router.use(this.auth.transport);
    router.use(
      rateLimit({
        windowMs: 60000,
        limit: 120,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (_req, res) =>
          res.status(429).json({
            error: {
              code: "RATE_LIMITED",
              message: "Muitas operações. Aguarde um minuto.",
            },
          }),
      }),
    );
    router.use(this.auth.csrfGuard);
    router.use((req, _res, next) => {
      if (!["GET", "HEAD", "POST", "PUT", "DELETE"].includes(req.method))
        return next(
          new AdminError("VALIDATION_ERROR", "Método não permitido."),
        );
      if (!["GET", "HEAD"].includes(req.method) && !req.is("application/json"))
        return next(
          new AdminError("VALIDATION_ERROR", "Envie a operação em JSON."),
        );
      next();
    });
    router.use(
      "/posts/product-images/upload",
      this.auth.require("posts.update"),
      express.json({ limit: "6mb", inflate: false }),
    );
    router.use(express.json({ limit: "256kb", inflate: false }));
    router.get("/auth/csrf", (req, res) =>
      res.json({ csrfToken: this.auth.csrf(req, res) }),
    );
    router.post(
      "/auth/login",
      rateLimit({
        windowMs: 15 * 60000,
        limit: 40,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (_req, res) => {
          this.db.audit(null, "LOGIN_IP_LIMIT", "auth", null, "FAILURE");
          res.status(429).json({
            error: {
              code: "RATE_LIMITED",
              message: "Muitas tentativas. Aguarde antes de entrar novamente.",
            },
          });
        },
      }),
      async (req, res) => res.json(await this.auth.login(req, res)),
    );
    router.post("/auth/logout", this.auth.require(), (req, res) => {
      this.auth.logout(req, res);
      res.json({ ok: true });
    });
    router.get("/auth/session", this.auth.require(), (req, res) => {
      const user = adminUser(res);
      res.json({
        user,
        csrfToken: this.auth.csrf(req, res),
        menu: this.menu(user),
        plugins: this.registry
          .info(this.db)
          .filter(
            (p) =>
              can(user, "plugins.manage") ||
              p.menu.some((m) => can(user, m.permission)),
          ),
      });
    });
    router.get(
      "/dashboard",
      this.auth.require("dashboard.read"),
      (_req, res) => {
        this.content.refresh();
        const user = adminUser(res);
        const widgets = this.registry
          .all()
          .filter((p) => this.registry.enabled(this.db, p))
          .flatMap((p) => p.widgets || [])
          .filter((w) => can(user, w.permission))
          .map((w) => ({
            id: w.id,
            label: w.label,
            value: w.read(this.context),
          }));
        res.json({
          widgets: [
            ...widgets,
            {
              id: "plugins.active",
              label: "Plugins ativos",
              value: this.registry.info(this.db).filter((p) => p.enabled)
                .length,
            },
            {
              id: "system.status",
              label: "Status da aplicação",
              value: "Operacional",
            },
          ],
          environment: this.web.environment,
          version: "1.0.0",
        });
      },
    );
    router.get("/plugins", this.auth.require("plugins.manage"), (_req, res) =>
      res.json({
        plugins: this.registry.info(this.db),
        revision: this.pluginsRevision(),
      }),
    );
    router.put(
      "/plugins/:id",
      this.auth.require("plugins.manage"),
      (req, res) => {
        const input = z
          .object({ enabled: z.boolean(), revision: revisionSchema })
          .strict()
          .parse(req.body);
        const plugin = this.registry.get(String(req.params.id));
        if (!plugin)
          throw new AdminError("NOT_FOUND", "Plugin não encontrado.");
        if (plugin.required && !input.enabled)
          throw new AdminError(
            "CONFLICT",
            "Este módulo é necessário ao núcleo administrativo.",
          );
        this.db.transaction(() => {
          if (input.revision !== this.pluginsRevision())
            throw new AdminError(
              "CONFLICT",
              "A lista de plugins mudou. Recarregue a página.",
            );
          this.db.sql
            .prepare("UPDATE plugin_state SET enabled=? WHERE id=?")
            .run(input.enabled ? 1 : 0, plugin.id);
          this.db.audit(
            adminUser(res).id,
            input.enabled ? "ENABLE_PLUGIN" : "DISABLE_PLUGIN",
            "plugins",
            plugin.id,
          );
        });
        res.json({
          plugins: this.registry.info(this.db),
          revision: this.pluginsRevision(),
        });
      },
    );
    router.get("/system", this.auth.require("system.read"), (_req, res) =>
      res.json({
        status: "ok",
        mercadoLivre: meliCatalog(this.context).status(),
        version: "1.0.0",
        node: process.version,
        environment: this.web.environment,
        publicSite: this.web.publicSite,
        storage: "SQLite + Markdown/JSON",
        migrations: this.db.sql
          .prepare(
            "SELECT id, applied_at AS appliedAt FROM schema_migrations ORDER BY id",
          )
          .all(),
        users: this.db.sql
          .prepare(
            "SELECT name, role_id AS role, active FROM users ORDER BY name",
          )
          .all(),
      }),
    );
    router.get("/audit", this.auth.require("audit.read"), (req, res) => {
      const input = listSchema.parse(req.query);
      const filter = "%" + input.q.replace(/[%_\\]/g, "\\$&") + "%";
      const total = Number(
        this.db.sql
          .prepare(
            "SELECT COUNT(*) AS total FROM audit_log WHERE action LIKE ? ESCAPE '\\'",
          )
          .get(filter)!.total,
      );
      const items = this.db.sql
        .prepare(
          "SELECT id, user_id AS userId, action, resource, resource_id AS resourceId, created_at AS createdAt, result FROM audit_log WHERE action LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 25 OFFSET ?",
        )
        .all(filter, (input.page - 1) * 25);
      res.json({
        items,
        page: input.page,
        pages: Math.max(1, Math.ceil(total / 25)),
        total,
      });
    });
    for (const plugin of this.registry.all())
      for (const api of plugin.api)
        router[api.method](
          api.path,
          this.auth.require(api.permission),
          (_req, _res, next) => {
            if (!this.registry.enabled(this.db, plugin))
              return next(new AdminError("NOT_FOUND", "Módulo desativado."));
            next();
          },
          async (req, res) => {
            await api.handle(this.context, req, res);
          },
        );
    router.use((_req, _res, next) =>
      next(new AdminError("NOT_FOUND", "API administrativa não encontrada.")),
    );
    router.use(adminErrorHandler);
    return router;
  }
  mountPages(
    app: Express,
    template: () => Promise<string>,
    transform?: (url: string, html: string) => Promise<string>,
  ) {
    app.get("/admin.html", (_req, res) =>
      res.status(404).send("Página não encontrada."),
    );
    app.get(
      ["/gm-admin-login", "/gm-admin", "/gm-admin/{*path}"],
      this.auth.transport,
      async (req, res) => {
        res
          .set("Cache-Control", "no-store")
          .set("X-Robots-Tag", "noindex, nofollow");
        const user = this.auth.user(req);
        if (req.path === "/gm-admin/awin") {
          res.redirect(303, "/gm-admin/integrations");
          return;
        }
        if (req.path === "/gm-admin-login") {
          if (user) {
            res.redirect(303, "/gm-admin");
            return;
          }
        } else {
          if (!user) {
            res.redirect(303, "/gm-admin-login");
            return;
          }
          const page = [
            ...coreMenu,
            ...this.registry
              .info(this.db)
              .filter((p) => p.enabled)
              .flatMap((p) => p.menu),
          ].find((p) => p.path === req.path);
          if (!page) {
            res
              .status(404)
              .type("text/plain")
              .send("Página administrativa não encontrada.");
            return;
          }
          if (!can(user, page.permission)) {
            this.db.audit(
              user.id,
              "PAGE_ACCESS_DENIED",
              "admin",
              req.path,
              "FAILURE",
            );
            res
              .status(403)
              .type("text/plain")
              .send("Você não tem permissão para acessar esta página.");
            return;
          }
        }
        let html = await template();
        if (transform) html = await transform(req.originalUrl, html);
        res.type("html").send(html);
      },
    );
    app.get("/portal-theme.css", (_req, res) => {
      const preset =
        themePresets[
          this.settings.get<keyof typeof themePresets>("themes.active")
        ];
      const font =
        this.settings.get<string>("themes.font") === "manrope"
          ? '"Manrope",system-ui,sans-serif'
          : "system-ui,sans-serif";
      res
        .type("css")
        .set("Cache-Control", "no-store")
        .send(
          `:root{--blue:${preset.blue};--purple:${preset.purple};--gradient:linear-gradient(110deg,${preset.blue},${preset.purple});--button-gradient:linear-gradient(110deg,${preset.buttonBlue},${preset.buttonPurple});--portal-font:${font};font-family:var(--portal-font);--editorial-link:${preset.link};--reading-width:${this.settings.get<number>("themes.readingWidth")}px;--reading-font-size:${this.settings.get<number>("themes.readingSize")}px;--reading-line-height:${this.settings.get<number>("themes.lineHeight")}}`,
        );
    });
    app.use(adminErrorHandler);
  }
  close() {
    closeMeliCatalog(this.context);
    for (const plugin of this.registry.all()) plugin.close?.(this.context);
    this.db.close();
    this.releaseWriter();
  }
}
