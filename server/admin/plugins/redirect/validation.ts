import { isIP } from "node:net";
import { pages } from "../../../../shared/site.js";
import type { RedirectInput } from "../../../../shared/redirect.js";
import type { PluginContext } from "../../registry.js";
import { AdminError } from "../../errors.js";
import { publicManifest } from "../../../web/manifest.js";
import { readLegacyManifest } from "../../../content/legacy.js";
import type { LegacyManifest } from "../../../../shared/legacy.js";
const legacyManifests = new WeakMap<PluginContext["content"], LegacyManifest>();
function legacyFor(ctx: PluginContext) {
  let manifest = legacyManifests.get(ctx.content);
  if (!manifest) {
    manifest = readLegacyManifest(ctx.content.root);
    legacyManifests.set(ctx.content, manifest);
  }
  return manifest;
}

// Root-only aliases cannot occupy blog paths or legacy article/media paths.
const reserved = new Set([
  ...Object.keys(pages)
    .map((route) => route.split("/")[1])
    .filter(Boolean),
  "api",
  "assets",
  "brands",
  "fonts",
  "src",
  "public",
  "server",
  "shared",
  "scripts",
  "tests",
  "node_modules",
  "deploy",
  "artifacts",
  "content",
  "docs",
  "dist",
  "lib",
  "tmp",
  "coverage",
  "wp-admin",
  "wp-content",
  "wp-includes",
  "wp-json",
  "wp-login",
  "wp-cron",
  "wp-sitemap",
  "feed",
  "comments",
  "author",
  "category",
  "tag",
  "search",
  "attachment",
  "embed",
  "login",
  "logout",
  "robots",
  "sitemap",
  "sitemaps",
  "index",
  "admin",
  "favicon",
  "portal-theme",
  "health",
]);
export function validateAlias(alias: string, ctx: PluginContext) {
  if (
    reserved.has(alias) ||
    /^(?:gm-admin|wp-|wp$)/.test(alias) ||
    Object.keys(ctx.content.snapshot().registries.redirects).some(
      (route) => route.replace(/^\/+|\/+$/g, "") === alias,
    ) ||
    legacyFor(ctx).routes.some(
      (r) => r.path.replace(/^\/+|\/+$/g, "") === alias,
    )
  )
    throw new AdminError(
      "CONFLICT",
      "Este alias é reservado pelo portal ou pelo WordPress.",
    );
}
export function normalizeDestination(value: string, ctx: PluginContext) {
  if (
    /[\s\\\u0000-\u001f\u007f]/.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)
  )
    throw new AdminError(
      "VALIDATION_ERROR",
      "O destino contém caracteres não permitidos.",
    );
  const internal = value.startsWith("/") && !value.startsWith("//");
  if (!internal && !/^https:\/\//i.test(value))
    throw new AdminError(
      "VALIDATION_ERROR",
      "URLs externas precisam começar com https://.",
    );
  let url: URL;
  try {
    url = new URL(value, internal ? ctx.web.siteUrl : undefined);
  } catch {
    throw new AdminError(
      "VALIDATION_ERROR",
      "Informe uma URL HTTPS válida ou um caminho interno iniciado por /.",
    );
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new AdminError(
      "VALIDATION_ERROR",
      "O destino exige HTTPS, sem credenciais ou porta personalizada.",
    );
  const ownHost = new URL(ctx.web.siteUrl).hostname;
  const hostBase = ownHost.replace(/^www\./, "");
  if (
    internal ||
    url.hostname === ownHost ||
    url.hostname === hostBase ||
    url.hostname === "www." + hostBase
  ) {
    // Reject URL-parser normalization tricks rather than resolving encoded paths differently.
    const path = internal
      ? value.split(/[?#]/)[0]
      : value
          .slice(value.indexOf("://") + 3)
          .replace(/^[^/]*(?=\/|$)/, "")
          .split(/[?#]/)[0] || "/";
    if (
      !/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*\/?$/.test(path) ||
      /\/\//.test(path) ||
      path !== url.pathname
    )
      throw new AdminError(
        "VALIDATION_ERROR",
        "O caminho interno não é válido.",
      );
    return url.pathname + url.search + url.hash;
  }
  const hostname = url.hostname.replace(/\.$/, "");
  if (
    isIP(hostname.replace(/^\[|\]$/g, "")) ||
    hostname.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(
      hostname,
    ) ||
    /(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion)$/.test(
      hostname,
    )
  )
    throw new AdminError(
      "VALIDATION_ERROR",
      "Informe um domínio público válido; IPs e endereços locais não são aceitos.",
    );
  return url.href;
}
export function internalPath(destination: string) {
  return destination.startsWith("/") ? destination.split(/[?#]/)[0] : undefined;
}
export function validateGraph(records: RedirectInput[], ctx: PluginContext) {
  const aliases = new Map<string, RedirectInput>();
  for (const record of records) {
    validateAlias(record.alias, ctx);
    if (aliases.has(record.alias))
      throw new AdminError("CONFLICT", "Já existe um redirect com este alias.");
    aliases.set(record.alias, record);
    if (normalizeDestination(record.destination, ctx) !== record.destination)
      throw new AdminError(
        "VALIDATION_ERROR",
        "O destino precisa estar normalizado antes da resolução.",
      );
  }
  const publicPaths = new Set(
    publicManifest(ctx.content.catalog(false))
      .filter(
        (route) =>
          route.type === "page" || route.type === "blog" || route.indexable,
      )
      .map((route) => route.path.split("?")[0]),
  );
  for (const record of records) {
    const seen = new Set<string>();
    let current: RedirectInput | undefined = record;
    while (current) {
      if (seen.has(current.alias))
        throw new AdminError(
          "CONFLICT",
          "O destino cria um loop de redirects.",
        );
      seen.add(current.alias);
      if (seen.size > 8)
        throw new AdminError(
          "CONFLICT",
          "Uma cadeia pode ter no máximo oito redirects.",
        );
      if (record.status === "active" && current.status !== "active")
        throw new AdminError(
          "CONFLICT",
          "Um redirect ativo não pode depender de outro inativo.",
        );
      const pathname = internalPath(current.destination);
      if (!pathname) break;
      if (publicPaths.has(pathname)) break;
      current = aliases.get(pathname.replace(/^\/|\/$/g, ""));
      if (!current)
        throw new AdminError(
          "CONFLICT",
          "O destino interno deve ser uma página pública existente ou outro alias cadastrado.",
        );
    }
  }
}
