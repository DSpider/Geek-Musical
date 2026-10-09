import express from "express";

import { rateLimit } from "express-rate-limit";

import { config, type WebConfig } from "./config.js";

import { installSecurity } from "./security.js";

import type { AdminRuntime } from "./admin/runtime.js";

/** Editorial HTTP app. Marketplace discovery and voice APIs are not mounted. */

export function createApp(web: WebConfig = config.web, admin?: AdminRuntime) {
  const app = express();

  installSecurity(app, web);

  app.use(express.json({ limit: "2mb" }));

  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, site: "Geek Musical", environment: web.environment }),
  );

  if (admin) app.use("/api/admin", admin.router);

  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Rota não encontrada." }),
  );

  return app;
}
