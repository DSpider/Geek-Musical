import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import {
  ContentCatalog,
  readSourceContent,
} from "../server/content/catalog.js";
import { renderMarkdown } from "../server/content/markdown.js";
import { publicManifest } from "../server/web/manifest.js";
import { editorialPage } from "../server/web/blog.js";

export function auditBlog(catalog: ContentCatalog) {
  const origin = "https://www.geekmusical.com.br";
  const byUrl = new Map(catalog.summaries.map((p) => [p.url, p.id]));
  const knownPaths = new Set(publicManifest(catalog).map((p) => p.path));
  const edges = new Map<string, Set<string>>();
  const broken: { id: string; href: string; reason: string }[] = [];
  const rows = catalog.summaries.map((summary) => {
    const post = catalog.getPost(summary.id)!;
    const rendered = renderMarkdown(
      post,
      (id) => catalog.resolvePost(id),
      (id) => catalog.resolveProduct(id),
    );
    const doc = new JSDOM(rendered.html).window.document;
    const outgoing = new Set<string>();
    const links = [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")].map(
      (a) => {
        const href = a.getAttribute("href")!;
        const url = new URL(href, origin + summary.url);
        const internal = [origin, "https://geekmusical.com.br"].includes(
          url.origin,
        );
        const target = internal ? byUrl.get(url.pathname) : undefined;
        if (target && target !== summary.id) outgoing.add(target);
        if (internal && !knownPaths.has(url.pathname))
          broken.push({
            id: summary.id,
            href,
            reason: "Destino interno inexistente",
          });
        if (href.startsWith("#") && !doc.getElementById(url.hash.slice(1)))
          broken.push({ id: summary.id, href, reason: "Âncora inexistente" });
        return {
          href,
          anchor: a.textContent?.replace(/\s+/g, " ").trim() || "",
          target,
          internal,
          sponsored: a.rel.split(/\s+/).includes("sponsored"),
          store: a.getAttribute("data-affiliate-store"),
          rel: a.rel,
          targetWindow: a.target,
          accessibleName: a.getAttribute("aria-label"),
          logo: (
            a.querySelector("img") ??
            a.closest("tr[data-offer-id]")?.querySelector("img")
          )?.getAttribute("src"),
        };
      },
    );
    const bodyOutgoing = [...outgoing];
    const effective = new JSDOM(
      editorialPage({ path: summary.url, originalUrl: summary.url }, catalog)!
        .html,
    ).window.document;
    const readingLinks = [
      ...effective.querySelectorAll<HTMLAnchorElement>(
        ".blog-related a[href], .blog-section article a[href]",
      ),
    ];
    for (const link of readingLinks) {
      const target = byUrl.get(
        new URL(link.getAttribute("href")!, origin).pathname,
      );
      if (target && target !== summary.id) outgoing.add(target);
    }
    edges.set(summary.id, outgoing);
    const row = {
      ...summary,
      bodySha256: createHash("sha256").update(rendered.html).digest("hex"),
      outgoing: [...outgoing].sort(),
      bodyOutgoing,
      readingLinks: [...outgoing].filter((id) => !bodyOutgoing.includes(id)),
      incoming: [] as string[],
      bodySearchLink: links.some((l) => l.href === "/#busca"),
      searchLink:
        !!effective.querySelector('.blog-cta a[href="/#busca"]') ||
        links.some((l) => l.href === "/#busca"),
      links,
      repeatedH2: rendered.headings.filter(
        (h) =>
          h.depth === 2 &&
          /^(?:\*\*)?(?:pr[oó]s|contras|vantagens|desvantagens)\s*[:?]?\s*(?:\*\*)?$/i.test(
            h.text,
          ),
      ).length,
      headings: rendered.headings,
    };
    doc.defaultView?.close();
    effective.defaultView?.close();
    return row;
  });
  for (const row of rows)
    row.incoming = rows
      .filter((p) => p.outgoing.includes(row.id))
      .map((p) => p.id)
      .sort();
  const reachable = (start: string) => {
    const found = new Set<string>(),
      queue = [start];
    while (queue.length) {
      const id = queue.pop()!;
      if (found.has(id)) continue;
      found.add(id);
      queue.push(...(edges.get(id) || []));
    }
    return found;
  };
  const reach = new Map(rows.map((r) => [r.id, reachable(r.id)]));
  const remaining = new Set(rows.map((r) => r.id));
  const components: string[][] = [];
  while (remaining.size) {
    const start = remaining.values().next().value!;
    const component = [...remaining].filter(
      (id) => reach.get(start)!.has(id) && reach.get(id)!.has(start),
    );
    component.forEach((id) => remaining.delete(id));
    components.push(component.sort());
  }
  return {
    summary: {
      posts: rows.length,
      bodyLinks: rows.reduce((n, r) => n + r.links.length, 0),
      contextualEdges: rows.reduce((n, r) => n + r.bodyOutgoing.length, 0),
      readingEdges: rows.reduce((n, r) => n + r.readingLinks.length, 0),
      orphans: rows.filter((r) => !r.incoming.length).map((r) => r.id),
      deadEnds: rows.filter((r) => !r.outgoing.length).map((r) => r.id),
      missingSearch: rows.filter((r) => !r.searchLink).map((r) => r.id),
      stronglyConnectedComponents: components.length,
      categoryComponents: catalog.registries.categories
        .filter((c) => rows.some((r) => r.categoryId === c.id))
        .map((c) => ({
          categoryId: c.id,
          components: components.filter((component) =>
            component.some(
              (id) => rows.find((r) => r.id === id)?.categoryId === c.id,
            ),
          ).length,
        })),
      brokenLinks: broken.length,
      sponsoredLinks: rows.reduce(
        (n, r) => n + r.links.filter((l) => l.sponsored).length,
        0,
      ),
      affiliateButtons: rows.reduce(
        (n, r) => n + r.links.filter((l) => l.store).length,
        0,
      ),
      repeatedH2: rows.reduce((n, r) => n + r.repeatedH2, 0),
    },
    components,
    broken,
    posts: rows,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const source = readSourceContent();
  const report = auditBlog(
    new ContentCatalog(source.registries, source.posts, false),
  );
  const output = process.argv[2] || "artifacts/blog-silos/audit.json";
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  if (
    process.argv.includes("--strict") &&
    (report.broken.length ||
      report.summary.orphans.length ||
      report.summary.deadEnds.length ||
      report.summary.missingSearch.length ||
      report.summary.repeatedH2 ||
      report.components.length !== 1)
  )
    process.exitCode = 1;
}
