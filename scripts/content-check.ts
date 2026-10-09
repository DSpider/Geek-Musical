import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { JSDOM } from "jsdom";
import {
  readSourceContent,
  ContentCatalog,
} from "../server/content/catalog.js";
import { createApp } from "../server/app.js";
import { mountPages } from "../server/web/pages.js";
import { publicManifest } from "../server/web/manifest.js";
import { site } from "../shared/site.js";
import type { WebConfig } from "../server/config.js";
import { linkGraph } from "./seo-graph.js";
import {
  readLegacyManifest,
  mountLegacyMedia,
} from "../server/content/legacy.js";

const mode = process.argv[2] || "content";
const source = readSourceContent();
const catalog = new ContentCatalog(source.registries, source.posts, true);
const legacy = readLegacyManifest("content");
if (mode === "content") {
  console.log(
    `PASS: ${source.posts.length} artigos, ${source.registries.categories.length} categorias; esquema, datas, fontes, imagens e referências válidos.`,
  );
} else {
  const web: WebConfig = {
    production: false,
    publicSite: false,
    siteUrl: site.defaultUrl,
    trustProxy: false,
    port: 3230,
    environment: "development",
    editorialPreview: true,
  };
  const app = createApp(web);
  mountLegacyMedia(app, "content", legacy);
  mountPages(
    app,
    () => readFile("src/index.html", "utf8"),
    web,
    undefined,
    catalog,
    () => readFile("src/blog.html", "utf8"),
    false,
    legacy,
  );
  const get = (url: string) =>
    request(app).get(url).set("Host", "localhost:3230");
  const urls = publicManifest(catalog).map((r) => r.path);
  const docs = new Map<string, Document>();
  for (const url of urls) {
    const response = await get(url);
    assert.equal(response.status, 200, url);
    const doc = new JSDOM(response.text).window.document;
    docs.set(url, doc);
    if (mode === "seo") {
      assert.equal(doc.documentElement.lang, "pt-BR");
      assert.equal(
        doc.querySelectorAll('link[rel="canonical"]').length,
        1,
        url,
      );
      assert.equal(
        doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
        web.siteUrl + url,
        url,
      );
      assert.ok(response.headers["x-robots-tag"].includes("noindex"));
      if (
        url.startsWith("/blog/") ||
        url === "/mapa-do-site/" ||
        catalog.findPost(url)
      )
        assert.equal(doc.querySelectorAll("h1").length, 1, url);
      for (const script of doc.querySelectorAll(
        'script[type="application/ld+json"]',
      ))
        JSON.parse(script.textContent || "");
    }
  }
  if (mode === "links") {
    const edges = new Map<string, Set<string>>();
    for (const [url, doc] of docs) {
      const destinations = new Set<string>();
      for (const anchor of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const href = anchor.getAttribute("href")!;
        if (!href.startsWith("/") && !href.startsWith("#")) continue;
        const parsed = new URL(href, web.siteUrl + url);
        const destination = parsed.pathname + parsed.search;
        if (
          !docs.has(destination) &&
          parsed.searchParams.has("relatedPage") &&
          catalog.findPost(parsed.pathname)?.kind === "pillar" &&
          [...parsed.searchParams.keys()].every((k) => k === "relatedPage")
        ) {
          const auxiliary = await get(destination);
          assert.equal(auxiliary.status, 200, `${url} → ${href}`);
          assert.ok(auxiliary.headers["x-robots-tag"].includes("noindex"));
          docs.set(destination, new JSDOM(auxiliary.text).window.document);
        }
        if (parsed.hash) {
          assert.ok(
            docs.get(destination)?.getElementById(parsed.hash.slice(1)),
            `${url} → ${href}`,
          );
        }
        assert.ok(docs.has(destination), `${url} → ${href}`);
        if (destination !== "/mapa-do-site/") destinations.add(destination);
      }
      edges.set(url, destinations);
    }
    const visited = linkGraph(docs, web.siteUrl).reachable;
    for (const post of catalog.summaries)
      assert.ok(visited.has(post.url), `Artigo órfão: ${post.id}`);
  }
  console.log(
    `PASS: ${mode === "seo" ? "HTML, canonical, robots e JSON-LD" : "links, âncoras e grafo a partir da home sem usar o mapa"}: ${urls.length} URLs via HTTP, fixtures sem APIs externas.`,
  );
}
