import { homePopularity } from "./content/home-popularity.js";
import { createServer } from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { mountProductImages, productImages } from "./content/product-images.js";
import express from "express";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { mountPages } from "./web/pages.js";
import { loadContent } from "./content/runtime.js";
import { adminConfig } from "./admin/config.js";
import { AdminRuntime } from "./admin/runtime.js";
import {
  readLegacyManifest,
  mountLegacyMedia,
  validateLegacyTargets,
} from "./content/legacy.js";

const adminOptions = adminConfig(config.web);
const admin = adminOptions.enabled
  ? new AdminRuntime(adminOptions, config.web)
  : undefined;
admin?.activateFunctionalSettings();
const app = createApp(config.web, admin);
const contentRoot = admin
  ? adminOptions.contentRoot
  : process.env.CONTENT_SOURCE_ROOT || "content";
mountProductImages(
  app,
  contentRoot,
  admin ? productImages(admin.context) : undefined,
);
const legacy = readLegacyManifest(contentRoot);
mountLegacyMedia(app, contentRoot, legacy);
const editorialContent = admin
  ? () => admin.content.catalog(true)
  : loadContent(config.web);
validateLegacyTargets(
  legacy,
  typeof editorialContent === "function"
    ? editorialContent()
    : editorialContent,
);
const httpServer = createServer(app);
httpServer.requestTimeout = 45_000;
httpServer.headersTimeout = 15_000;
httpServer.keepAliveTimeout = 5000;
httpServer.maxRequestsPerSocket = 100;
if (config.production) {
  const root = path.resolve("dist/client");
  const rawTemplate = await readFile(path.join(root, "index.html"), "utf8");
  const template = rawTemplate;
  const editorialTemplate = await readFile(
    path.join(root, "blog.html"),
    "utf8",
  );
  const adminTemplate = await readFile(path.join(root, "admin.html"), "utf8");
  if (admin) admin.mountPages(app, async () => adminTemplate);
  else
    app.get("/admin.html", (_req, res) =>
      res.status(404).send("Página não encontrada."),
    );
  app.get("/blog.html", (_req, res) =>
    res.status(404).type("text/plain").send("Página não encontrada."),
  );
  app.get("/index.html", (_req, res) => res.redirect(308, "/"));
  app.use(
    express.static(root, {
      index: false,
      dotfiles: "deny",
      maxAge: "1h",
      setHeaders: (res, file) => {
        if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
        else if (file.includes(`${path.sep}assets${path.sep}`))
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  admin?.mountPublic(app);
  mountPages(
    app,
    async () => template,
    config.web,
    undefined,
    editorialContent,
    async () => editorialTemplate,
    !!admin,
    legacy,
    () => false,
    () => admin?.settings.get("home.layout") ?? null,
    () => homePopularity(admin?.db),
  );
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, ws: { server: httpServer } },
    appType: "custom",
  });
  if (admin)
    admin.mountPages(
      app,
      () => readFile(path.resolve("src/admin.html"), "utf8"),
      (url, html) => vite.transformIndexHtml(url, html),
    );
  else
    app.get("/admin.html", (_req, res) =>
      res.status(404).send("Página não encontrada."),
    );
  app.use(vite.middlewares);
  admin?.mountPublic(app);
  mountPages(
    app,
    () => readFile(path.resolve("src/index.html"), "utf8"),
    config.web,
    (url, html) => vite.transformIndexHtml(url, html),
    editorialContent,
    () => readFile(path.resolve("src/blog.html"), "utf8"),
    !!admin,
    legacy,
    () => false,
    () => admin?.settings.get("home.layout") ?? null,
    () => homePopularity(admin?.db),
  );
}
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error) console.error("[web] Não foi possível servir a página.");
    if (!res.headersSent)
      res
        .status(500)
        .type("text/plain")
        .send("Não foi possível abrir esta página. Tente novamente.");
  },
);
httpServer.listen(config.port, config.host, () => {
  console.log(
    `Geek Musical disponível em http://localhost:${config.port} (${config.production ? "produção" : "desenvolvimento"})`,
  );
});
httpServer.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `A porta ${config.port} já está em uso.`
      : "Não foi possível iniciar o servidor.",
  );
  process.exit(1);
});
const shutdown = () => {
  httpServer.close(() => {
    admin?.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
