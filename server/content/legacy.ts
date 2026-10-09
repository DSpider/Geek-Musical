import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Express } from "express";
import {
  legacyManifestSchema,
  type LegacyManifest,
} from "../../shared/legacy.js";
import type { ContentCatalog } from "./catalog.js";
import { pages } from "../../shared/site.js";

function normalizedMediaPath(value: string): string {
  try {
    return decodeURIComponent(value).normalize("NFC");
  } catch {
    return value.normalize("NFC");
  }
}

export function readLegacyManifest(root: string): LegacyManifest {
  const file = path.join(root, "legacy-routes.json");
  const manifest = existsSync(file)
    ? legacyManifestSchema.parse(JSON.parse(readFileSync(file, "utf8")))
    : { version: 1 as const, routes: [], media: [] };
  const keys = manifest.routes.map((r) => r.path.replace(/\/+$/, ""));
  if (new Set(keys).size !== keys.length)
    throw new Error("Origem duplicada no inventário legado.");
  if (new Set(manifest.media.map((m) => m.path)).size !== manifest.media.length)
    throw new Error("Mídia duplicada no inventário legado.");
  for (const r of manifest.routes)
    if (
      r.destination?.startsWith("/") &&
      keys.includes(r.destination.replace(/\/+$/, ""))
    )
      throw new Error("O inventário legado precisa ter redirects sem cadeias.");
  return manifest;
}
export function validateLegacyTargets(
  manifest: LegacyManifest,
  catalog: ContentCatalog,
) {
  const publicPaths = new Set([
    ...Object.keys(pages),
    ...catalog.summaries.map((p) => p.url),
    ...catalog.listCategories().map((c) => "/blog/" + c.slug + "/"),
  ]);
  const permittedMedia = new Set(
    manifest.media.map((m) => normalizedMediaPath(m.path)),
  );
  for (const summary of catalog.summaries)
    for (const image of catalog.getPost(summary.id)?.media || [])
      if (
        image.url.startsWith("/wp-content/uploads/") &&
        !permittedMedia.has(normalizedMediaPath(image.url))
      )
        throw new Error("Imagem publicada fora do inventário: " + image.url);
  for (const r of manifest.routes) {
    if (publicPaths.has(r.path.replace(/\/+$/, "") + "/"))
      throw new Error("URL legada ocupa página pública: " + r.path);
    if (
      r.destination?.startsWith("/") &&
      !publicPaths.has(r.destination.split(/[?#]/)[0])
    )
      throw new Error("Redirect legado sem destino público: " + r.path);
  }
}
export function mountLegacyMedia(
  app: Express,
  root: string,
  manifest: LegacyManifest,
) {
  const files = new Map<string, string>();
  const mediaRoot = path.resolve(root, "legacy-media");
  for (const m of manifest.media) {
    const target = path.resolve(mediaRoot, m.file);
    if (
      !existsSync(target) ||
      !statSync(target).isFile() ||
      !realpathSync(target).startsWith(realpathSync(mediaRoot) + path.sep) ||
      statSync(target).size !== m.bytes ||
      createHash("sha256").update(readFileSync(target)).digest("hex") !==
        m.sha256
    )
      throw new Error(
        "Imagem legada ausente ou diferente do inventário: " + m.path,
      );
    files.set(normalizedMediaPath(m.path), target);
  }
  app.get("/wp-content/uploads/{*path}", (req, res) => {
    const file = files.get(normalizedMediaPath(req.path));
    if (!file) {
      res
        .status(404)
        .set("Cache-Control", "no-store")
        .type("text/plain")
        .send("Imagem não encontrada.");
      return;
    }
    res
      .set("Cache-Control", "public, max-age=86400")
      .set("X-Content-Type-Options", "nosniff")
      .sendFile(file, { dotfiles: "deny" });
  });
}
