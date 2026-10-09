import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import { JSDOM } from "jsdom";
import type { HomeGridContent } from "../shared/home-editor.js";
import {
  ContentCatalog,
  readSourceContent,
} from "../server/content/catalog.js";
import { urlInventory } from "../server/web/inventory.js";

const origin = "https://www.geekmusical.com.br";
const source = readSourceContent();
const catalog = new ContentCatalog(source.registries, source.posts, false);
const inventory = urlInventory(catalog, origin);
const legacy = JSON.parse(readFileSync("content/legacy-routes.json", "utf8"));
const sitemapPaths = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/post-sitemap.xml",
  "/page-sitemap.xml",
  "/category-sitemap.xml",
  "/sitemaps/posts.xml",
  "/sitemaps/pages.xml",
  "/sitemaps/categories.xml",
];
const purgeUrls = [
  ...new Set([
    ...inventory.map((r) => r.url),
    ...legacy.routes.map((r: { path: string }) => origin + r.path),
    ...sitemapPaths.map((p) => origin + p),
  ]),
];
const batches = Array.from(
  { length: Math.ceil(purgeUrls.length / 30) },
  (_, i) => purgeUrls.slice(i * 30, i * 30 + 30),
);
writeFileSync(
  "artifacts/deploy/purge-urls.json",
  JSON.stringify(batches, null, 2),
);
if (process.argv.includes("--purge-list")) {
  console.log(
    JSON.stringify({ urls: purgeUrls.length, batches: batches.length }),
  );
  process.exit(0);
}

async function get(path: string, init: RequestInit = {}) {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin);
  return fetch(url, {
    ...init,
    headers: { "Cache-Control": "no-cache", ...init.headers },
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
}
async function parallel<T, R>(
  items: T[],
  work: (item: T) => Promise<R>,
  limit = 4,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}
const routeChecks = await parallel(inventory, async (route) => {
  const response = await get(route.path);
  assert.equal(response.status, 200, route.path);
  const html = await response.text();
  const doc = new JSDOM(html).window.document;
  assert.equal(
    doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    route.canonical,
    route.path,
  );
  if (route.postId || route.path === "/" || route.path.startsWith("/blog/"))
    assert.equal(doc.querySelectorAll("h1").length, 1, route.path);
  if (route.indexable)
    assert.ok(
      !/noindex/i.test(response.headers.get("x-robots-tag") || ""),
      route.path,
    );
  for (const script of doc.querySelectorAll(
    'script[type="application/ld+json"]',
  ))
    JSON.parse(script.textContent || "");
  if (route.postId)
    assert.equal(
      doc.querySelector("h1")?.textContent,
      catalog.getPost(route.postId)?.title,
    );
  if (route.path === "/tipos-de-baquetas/") {
    assert.equal(doc.querySelectorAll(".editorial-offers-compact").length, 8);
    assert.equal(doc.querySelector('img[src$="/Magalu.png"]'), null);
  }
  if (route.path === "/") {
    const grids: HomeGridContent[] = JSON.parse(
      doc.querySelector("#gm-home-layout")?.textContent || "null",
    );
    assert.ok(Array.isArray(grids) && grids.length <= 8);
    assert.equal(new Set(grids.map((g) => g.id)).size, grids.length);
    for (const grid of grids) {
      assert.ok(
        Number.isInteger(grid.columns) &&
          grid.columns >= 1 &&
          grid.columns <= 4,
      );
      assert.ok(
        Number.isInteger(grid.rows) && grid.rows >= 1 && grid.rows <= 6,
      );
      assert.ok(grid.cards.length <= grid.columns * grid.rows);
      assert.equal(
        new Set(grid.cards.map((card) => card.id)).size,
        grid.cards.length,
      );
    }
    assert.deepEqual(
      Array.from(
        doc.querySelectorAll(".home-posts h2"),
        (heading) => heading.textContent,
      ),
      grids.filter((grid) => grid.cards.length).map((grid) => grid.title),
    );
    assert.deepEqual(
      Array.from(doc.querySelectorAll(".home-post-card"), (card) =>
        card.getAttribute("href"),
      ),
      grids.flatMap((grid) => grid.cards.map((card) => card.url)),
    );
    const categories = doc.querySelector("#explorar");
    assert.ok(categories);
    for (const section of doc.querySelectorAll("main > .home-posts"))
      assert.ok(section.compareDocumentPosition(categories) & 4);
    assert.equal(doc.documentElement.dataset.theme, "light");
  }
  return {
    path: route.path,
    status: response.status,
    canonical: route.canonical,
    cache: response.headers.get("cf-cache-status"),
    bytes: Buffer.byteLength(html),
  };
});
console.log(
  `PASS: ${routeChecks.length} rotas públicas, títulos, canonicals, JSON-LD e grades salvas da Home.`,
);
const redirects = await parallel(
  legacy.routes as { path: string; destination: string; status: number }[],
  async (route) => {
    const response = await get(route.path);
    assert.equal(response.status, route.status, route.path);
    assert.equal(
      new URL(response.headers.get("location")!, origin).pathname,
      route.destination,
      route.path,
    );
    return {
      path: route.path,
      destination: route.destination,
      status: response.status,
    };
  },
);
const sitemaps = await parallel(
  [...sitemapPaths, "/web-story-sitemap.xml", "/author-sitemap.xml"],
  async (path) => {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    const xml = await response.text();
    assert.match(xml, /<(?:sitemapindex|urlset)\b/, path);
    if (path === "/sitemaps/posts.xml")
      assert.equal((xml.match(/<url>/g) || []).length, 149);
    return { path, xml };
  },
);
const storyXml = sitemaps.find((s) => s.path === "/web-story-sitemap.xml")!.xml;
const storyUrls = [...storyXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1])
  .filter((url) => new URL(url).pathname !== "/web-stories/");
assert.equal(storyUrls.length, 96);
const stories = await parallel(storyUrls, async (url) => {
  const response = await get(url);
  assert.equal(response.status, 200, url);
  const html = await response.text();
  assert.match(html, /<amp-story\b/, url);
  return { path: new URL(url).pathname, status: response.status };
});
const mediaPaths = [
  ...new Set(
    source.posts.flatMap(
      (p) =>
        p.media
          ?.filter((m) => p.body.includes(`media:${m.id}`))
          .map((m) => m.url) || [],
    ),
  ),
].filter((p) => p.startsWith("/wp-content/"));
const media = await parallel(
  mediaPaths,
  async (path) => {
    const response = await get(path, { method: "HEAD" });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") || "", /^image\//, path);
    return { path, status: response.status };
  },
  6,
);
console.log(
  `PASS: ${redirects.length} redirects, ${sitemaps.length} sitemaps, ${stories.length} Stories e ${media.length} imagens editoriais.`,
);
for (const path of ["/api/admin/auth/session", "/api/admin/posts"]) {
  const response = await get(path);
  assert.equal(response.status, 401, path);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.notEqual(response.headers.get("cf-cache-status"), "HIT");
}
const env = dotenv.parse(readFileSync(".env"));
const csrfResponse = await get("/api/admin/auth/csrf");
assert.equal(csrfResponse.status, 200);
const csrf = (await csrfResponse.json()) as { csrfToken: string };
const csrfCookie = csrfResponse.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
const login = await get("/api/admin/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: origin,
    Cookie: csrfCookie,
    "X-CSRF-Token": csrf.csrfToken,
  },
  body: JSON.stringify({ email: env.adminEmail, password: env.adminPassword }),
});
assert.equal(login.status, 200, "Login próprio em produção");
const sessionCookie = login.headers
  .getSetCookie()
  .find((c) => c.startsWith("__Host-gm_admin="))!;
assert.ok(sessionCookie);
assert.match(sessionCookie, /Secure/);
assert.match(sessionCookie, /HttpOnly/);
assert.match(sessionCookie, /SameSite=Strict/);
assert.match(sessionCookie, /Path=\//);
const session = await get("/api/admin/auth/session", {
  headers: { Cookie: sessionCookie.split(";")[0] },
});
assert.equal(session.status, 200);
assert.match(session.headers.get("cache-control") || "", /no-store/);
assert.notEqual(session.headers.get("cf-cache-status"), "HIT");
const auth = (await login.json()) as { csrfToken: string };
const logout = await get("/api/admin/auth/logout", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: origin,
    Cookie: sessionCookie.split(";")[0],
    "X-CSRF-Token": auth.csrfToken,
  },
  body: "{}",
});
assert.equal(logout.status, 200);
const health = await get("/api/health");
assert.deepEqual(await health.json(), {
  ok: true,
  site: "Geek Musical",
  environment: "production",
});
const measurements = [];
for (const base of ["http://127.0.0.1:3230", origin]) {
  for (let sample = 0; sample < 5; sample++) {
    const start = performance.now();
    const response = await fetch(base + "/?gm_measure=" + Date.now());
    const headersMs = performance.now() - start;
    const html = await response.text();
    measurements.push({
      base,
      sample,
      headersMs: Math.round(headersMs * 10) / 10,
      totalMs: Math.round((performance.now() - start) * 10) / 10,
      htmlBytes: Buffer.byteLength(html),
    });
  }
}
const otherSites = await parallel(
  [
    "https://guiaproduto.com.br/api/health",
    "https://www.magodecasa.com.br/api/health",
  ],
  async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, url);
    const health = (await response.json()) as { status: string };
    assert.equal(health.status, "ok", url);
    return { url, status: response.status, ok: true };
  },
);
writeFileSync(
  "docs/migration/production-verification.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      deployedCommit: JSON.parse(
        readFileSync("docs/migration/prepared-release.json", "utf8"),
      ).commit,
      routes: routeChecks,
      redirects,
      sitemaps: sitemaps.map(({ path, xml }) => ({
        path,
        entries: (xml.match(/<loc>/g) || []).length,
      })),
      stories,
      media,
      security: {
        unauthenticatedPrivateApiDenied: true,
        productionLoginVerified: true,
        hostCookieSecureHttpOnlyStrict: true,
        privateResponsesNotCached: true,
      },
      measurements,
      measurementScope:
        "Cinco amostras locais e HTTP público até cabeçalhos/conclusão; não são Core Web Vitals de campo.",
      otherSites,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "PASS: login PROD, cookie seguro, respostas privadas sem cache e saúde dos três portais.",
);
