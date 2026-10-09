import type { ContentCatalog } from "../content/catalog.js";
import { urlInventory } from "./inventory.js";

const header = '<?xml version="1.0" encoding="UTF-8"?>';
const namespace = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
export const sitemapPaths = [
  "/sitemaps/pages.xml",
  "/sitemaps/categories.xml",
  "/sitemaps/posts.xml",
] as const;
export function sitemapDocuments(
  catalog: ContentCatalog,
  origin: string,
  enabled = true,
) {
  const inventory = enabled
    ? urlInventory(catalog, origin).filter((url) => url.sitemap)
    : [];
  const children = sitemapPaths.map((path) => {
    const urls = inventory.filter((url) => url.sitemap === path);
    return {
      path,
      urls: urls.map((url) => url.url),
      xml: `${header}<urlset ${namespace}>${urls.map((url) => `<url><loc>${escapeXml(url.url)}</loc>${url.updatedAt ? `<lastmod>${escapeXml(url.updatedAt)}</lastmod>` : ""}</url>`).join("")}</urlset>`,
    };
  });
  return [
    {
      path: "/sitemap.xml",
      urls: enabled ? children.map((child) => origin + child.path) : [],
      xml: `${header}<sitemapindex ${namespace}>${enabled ? children.map((child) => `<sitemap><loc>${escapeXml(origin + child.path)}</loc></sitemap>`).join("") + `<sitemap><loc>${escapeXml(origin + "/web-story-sitemap.xml")}</loc></sitemap><sitemap><loc>${escapeXml(origin + "/author-sitemap.xml")}</loc></sitemap>` : ""}</sitemapindex>`,
    },
    ...children,
  ];
}
