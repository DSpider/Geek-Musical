import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Express, RequestHandler, Response } from "express";
import { isPublicRequest } from "./web/seo.js";
import helmet from "helmet";
import { type WebConfig } from "./config.js";
import { analyticsConfig, collectionEnabled } from "./analytics/config.js";

export function installSecurity(app: Express, web: WebConfig) {
  const analytics = collectionEnabled(web, analyticsConfig());
  const googleScript = (req: unknown) => {
    const request = req as import("express").Request;
    return analytics &&
      !request.path.startsWith("/gm-admin") &&
      !request.path.startsWith("/api/")
      ? "https://www.googletagmanager.com"
      : "'self'";
  };
  const googleConnection = (req: unknown) => {
    const request = req as import("express").Request;
    return analytics &&
      !request.path.startsWith("/gm-admin") &&
      !request.path.startsWith("/api/")
      ? "https://*.google-analytics.com"
      : "'self'";
  };
  const viteDependencyPrefix =
    "/@fs/" +
    path
      .resolve("node_modules/.vite/deps")
      .replaceAll("\\", "/")
      .replace(/^\//, "") +
    "/";
  app.disable("x-powered-by");
  app.set("trust proxy", web.trustProxy);
  app.use((req, res, next) => {
    res.locals.nonce = randomBytes(18).toString("base64");
    res.setHeader(
      "Permissions-Policy",
      "microphone=(), camera=(), geolocation=(), payment=()",
    );
    if (!isPublicRequest(req, web))
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    const hostname = (req.headers.host || "").toLowerCase();
    const domain = new URL(web.siteUrl).hostname;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(hostname);
    const configuredHost = web.production && hostname === domain;
    const publicAlias =
      web.production &&
      web.publicSite &&
      hostname ===
        (domain.startsWith("www.") ? domain.slice(4) : `www.${domain}`);
    if (!local && !configuredHost && !publicAlias) {
      res.status(400).json({ error: "Endereço do site não permitido." });
      return;
    }
    if (
      web.publicSite &&
      web.production &&
      !local &&
      (!req.secure || hostname !== domain)
    ) {
      res.redirect(308, web.siteUrl + req.originalUrl);
      return;
    }
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: web.production
            ? [
                "'self'",
                googleScript,
                (_req, res) => `'nonce-${(res as Response).locals.nonce}'`,
              ]
            : ["'self'", "'unsafe-inline'"],
          // Vite's React refresh preamble is inline and intentionally development-only.
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: [
            "'self'",
            "data:",
            "https://*.media-amazon.com",
            "https://*.ssl-images-amazon.com",
            "https://*.susercontent.com",
            "https://*.shopee.com.br",
            "https://*.shopee.sg",
            "https://*.shopeemobile.com",
            "https://*.mlcdn.com.br",
            "https://http2.mlstatic.com",
            "https://*.mlstatic.com",
            googleConnection,
          ],
          connectSrc: [
            "'self'",
            googleConnection,
            ...(web.production ? [] : ["ws://localhost:*", "ws://127.0.0.1:*"]),
          ],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
      strictTransportSecurity:
        web.production && web.publicSite
          ? { maxAge: 31536000, includeSubDomains: false }
          : false,
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use((req, res, next) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(req.path);
    } catch {
      res.sendStatus(400);
      return;
    }
    // Only Vite's generated dependency modules need a dot-directory in development.
    // Source files, arbitrary node_modules paths and traversal remain blocked.
    const viteDependency =
      !web.production &&
      pathname.startsWith(viteDependencyPrefix) &&
      /^[\w-][\w.-]*\.js$/.test(pathname.slice(viteDependencyPrefix.length));
    if (
      (!viteDependency &&
        pathname.split(/[\\/]/).some((part) => part.startsWith("."))) ||
      /\.(?:map|log|env)$/i.test(pathname) ||
      (web.production && /^\/lib(?:\/|$)/i.test(pathname)) ||
      /^\/(?:server|shared|scripts|tests|node_modules|deploy|artifacts|content|docs|dist)(?:\/|$)/i.test(
        pathname,
      )
    ) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.status(404).json({ error: "Rota não encontrada." });
      return;
    }
    next();
  });
  app.use("/api", (_req, res, next) => {
    res
      .set("Cache-Control", "no-store")
      .set("X-Robots-Tag", "noindex, nofollow");
    next();
  });
}

export function sameOrigin(web: WebConfig): RequestHandler {
  const allowed = new Set([
    web.siteUrl,
    `http://localhost:${web.port}`,
    `http://127.0.0.1:${web.port}`,
  ]);
  return (req, res, next) => {
    if (
      req.headers["sec-fetch-site"] === "cross-site" ||
      (req.headers.origin && !allowed.has(req.headers.origin))
    ) {
      res.status(403).json({ error: "Origem não permitida." });
      return;
    }
    next();
  };
}

export function workLimiter(max: number) {
  let active = 0;
  return () => {
    if (active >= max) return null;
    active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        active--;
      }
    };
  };
}
