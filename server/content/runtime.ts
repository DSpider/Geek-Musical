import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ContentCatalog, readSourceContent } from "./catalog.js";
import { postSchema, registriesSchema } from "./schema.js";
import { environmentOf, previewEnabled } from "./environment.js";
import type { WebConfig } from "../config.js";
export function parseSnapshot(value: string, web: WebConfig) {
  const snapshot = z
    .object({
      environment: z.enum(["development", "production"]),
      siteUrl: z.string(),
      registries: registriesSchema,
      posts: z.array(postSchema.safeExtend({ body: z.string() })),
    })
    .parse(JSON.parse(value));
  if (
    snapshot.environment !== environmentOf(web) ||
    snapshot.siteUrl !== web.siteUrl
  )
    throw new Error(
      "Build editorial pertence a outro ambiente/host. Reconstrua com APP_ENV e SITE_URL corretos.",
    );
  if (
    environmentOf(web) === "production" &&
    snapshot.posts.some((p) => p.status !== "published")
  )
    throw new Error("Build público contém conteúdo não publicado.");
  return snapshot;
}
export function loadContent(web: WebConfig) {
  let source: ReturnType<typeof readSourceContent>;
  if (!web.production) source = readSourceContent();
  else {
    const persistent = process.env.ADMIN_CONTENT_ROOT
      ? path.resolve(
          process.env.ADMIN_CONTENT_ROOT,
          "../published/catalog.json",
        )
      : null;
    const snapshot = parseSnapshot(
      readFileSync(
        persistent && existsSync(persistent)
          ? persistent
          : "dist/content/catalog.json",
        "utf8",
      ),
      web,
    );
    source = snapshot;
  }
  return new ContentCatalog(
    source.registries,
    source.posts,
    previewEnabled(web),
  );
}
