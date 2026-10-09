import type { SeoUrl } from "../../shared/analytics.js";
import type { ContentCatalog } from "../content/catalog.js";
import { publicManifest } from "./manifest.js";

export function urlInventory(
  catalog: ContentCatalog,
  origin: string,
): SeoUrl[] {
  return publicManifest(catalog).map((route) => {
    const post = route.postId ? catalog.getPost(route.postId) : undefined;
    const category = catalog.registries.categories.find(
      (c) => c.id === route.categoryId,
    );
    const indexable = route.indexable && category?.status !== "inactive";
    const type = route.type === "blog" ? "page" : route.type;
    return {
      url: origin + route.path,
      path: route.path,
      type,
      label: route.label,
      status:
        post?.status ||
        (category?.status === "inactive"
          ? "inactive"
          : indexable
            ? "published"
            : "empty"),
      canonical: origin + route.path,
      indexable,
      categoryId: route.categoryId || null,
      postId: post?.id || null,
      createdAt: post?.createdAt || null,
      updatedAt: post?.updatedAt || null,
      sitemap:
        indexable &&
        !route.path.includes("?") &&
        ["page", "category", "post"].includes(type)
          ? `/sitemaps/${type === "category" ? "categories" : type === "post" ? "posts" : "pages"}.xml`
          : null,
    };
  });
}
