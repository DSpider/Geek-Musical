import { mkdir, writeFile } from "node:fs/promises";
import { readSourceContent } from "../server/content/catalog.js";
import { config } from "../server/config.js";
import { contentSnapshot } from "../server/content/build.js";
import {
  previewEnabled,
  type BusinessEnvironment,
} from "../server/content/environment.js";
const environment = (process.env.APP_ENV ||
  "production") as BusinessEnvironment;
const preview = previewEnabled({
  ...config.web,
  environment,
});
const source = readSourceContent(process.env.CONTENT_SOURCE_ROOT || "content");
const snapshot = contentSnapshot(
  source,
  environment,
  preview,
  config.web.siteUrl,
);
await mkdir("dist/content", { recursive: true });
await writeFile("dist/content/catalog.json", JSON.stringify(snapshot));
console.log(
  `Conteúdo validado: ${source.posts.length} artigos; artefato ${environment}: ${snapshot.posts.length} artigos (${preview ? "preview protegido" : "somente published"}).`,
);
