import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import {
  readSourceContent,
  ContentCatalog,
} from "../server/content/catalog.js";
import { renderMarkdown } from "../server/content/markdown.js";
import { affiliateStore } from "../shared/affiliate.js";
import { plainWordpressText } from "./wordpress-convert.js";
const data = JSON.parse(
  readFileSync("artifacts/wordpress/export.private.json", "utf8"),
);
const source = readSourceContent();
const catalog = new ContentCatalog(source.registries, source.posts, true);
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const records = [];
const links = [];
for (const p of data.posts.filter(
  (p: { status: string }) => p.status === "publish",
)) {
  const post = catalog.getPost("WP-POST-" + p.id)!;
  const output = JSDOM.fragment(
    renderMarkdown(post, (id) => catalog.resolvePost(id)).html,
  );
  // Store buttons add UI text between preserved anchor labels and article prose.
  output.querySelectorAll(".editorial-price-button").forEach((n) => n.remove());
  const actual = normalize(output.textContent || "");
  const html = JSDOM.fragment(p.body);
  html
    .querySelectorAll("script,style,form,noscript")
    .forEach((n) => n.remove());
  const paragraphs = [
    ...html.querySelectorAll("p,h1,h2,h3,h4,li,td,th,figcaption"),
  ]
    .map((n) => (n.textContent || "").trim())
    .filter((s) => s.length > 35 && !/\[(?:content-egg|su_|caption)/.test(s));
  const missing = [
    ...new Set(paragraphs.filter((s) => !actual.includes(normalize(s)))),
  ];
  const record = {
    id: p.id,
    path: post.canonicalPath,
    titlePreserved:
      normalize(post.title) === normalize(plainWordpressText(p.title)),
    publishedAtPreserved: post.publishedAt === p.publishedAt.slice(0, 10),
    updatedAtPreserved: post.updatedAt === p.updatedAt.slice(0, 10),
    sourceParagraphs: paragraphs.length,
    missingParagraphs: missing,
  };
  records.push(record);
  for (const l of post.links || [])
    if (affiliateStore(l.url))
      links.push({
        postId: p.id,
        id: l.id,
        url: l.url,
        store: affiliateStore(l.url),
        state: "pending-live-verification",
      });
}
writeFileSync(
  "docs/migration/preservation-check.json",
  JSON.stringify(records, null, 2) + "\n",
);
if (!process.argv.includes("--preservation-only"))
  writeFileSync(
    "docs/migration/affiliate-audit.json",
    JSON.stringify(links, null, 2) + "\n",
  );
console.log(
  JSON.stringify({
    articles: records.length,
    sourceParagraphs: records.reduce((s, p) => s + p.sourceParagraphs, 0),
    missingParagraphs: records.reduce(
      (s, p) => s + p.missingParagraphs.length,
      0,
    ),
    affiliateLinks: links.length,
  }),
);
if (
  records.some(
    (p) =>
      p.missingParagraphs.length ||
      !p.titlePreserved ||
      !p.publishedAtPreserved ||
      !p.updatedAtPreserved,
  )
)
  process.exitCode = 1;
