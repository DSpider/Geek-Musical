import type { Registries, Post } from "./schema.js";
import type { BusinessEnvironment } from "./environment.js";
import { references } from "./markdown.js";
export function contentSnapshot(
  source: { registries: Registries; posts: Post[] },
  environment: BusinessEnvironment,
  preview: boolean,
  siteUrl: string,
) {
  if (environment === "production" && preview)
    throw new Error("Preview proibido no build de produção.");
  const posts = source.posts.filter(
    (p) =>
      (environment !== "production" && preview) || p.status === "published",
  );
  const products = new Set(
    posts.flatMap((post) => [
      ...references(post.body, post).products,
      ...(post.productIds ?? []),
    ]),
  );
  return {
    environment,
    siteUrl,
    registries: {
      ...source.registries,
      ...(source.registries.products
        ? {
            products: source.registries.products.filter((product) =>
              products.has(product.id),
            ),
          }
        : {}),
    },
    posts,
  };
}
