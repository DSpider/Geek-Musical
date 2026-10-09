import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  ContentCatalog,
  readSourceContent,
} from "../server/content/catalog.js";
import { homeGrids } from "../server/content/discovery.js";
import { mountPages } from "../server/web/pages.js";
import {
  homeLayoutSchema,
  moveHomeGrid,
  moveHomePost,
  validateMusicalHome,
  type HomeGrid,
  type HomeLayout,
} from "../shared/home-editor.js";
import type { WebConfig } from "../server/config.js";

const source = readSourceContent();
const posts = structuredClone(source.posts.slice(0, 5));
const category = posts[0].categoryId;
posts.forEach((post, index) => {
  post.origin = undefined;
  post.publishedAt = `2020-01-0${index + 1}`;
  post.updatedAt = `2026-01-0${5 - index}`;
  post.status = index === 4 ? "draft" : "published";
  post.categoryId = index === 3 ? posts[1].categoryId : category;
});
// Use a distinct active category for the fourth public article.
posts[3].categoryId = source.registries.categories.find(
  (entry) => entry.id !== category && entry.status === "active",
)!.id;
posts[2].origin = {
  ...source.posts[2].origin!,
  sourcePublishedAt: "2019-01-01 10:00:00",
};
const catalog = new ContentCatalog(source.registries, posts, true);
const grid = (
  mode: HomeGrid["mode"],
  patch: Partial<HomeGrid> = {},
): HomeGrid => ({
  id: "test",
  title: "Grade",
  eyebrow: "",
  columns: 2,
  rows: 1,
  mode,
  postIds: [],
  ...patch,
});
const layout = (...grids: HomeGrid[]): HomeLayout => ({ version: 1, grids });
const ids = (value: HomeLayout) =>
  homeGrids(catalog, value)[0].cards.map((p) => p.id);

describe("Grades configuráveis da Home", () => {
  it("usa publicação original em recentes/antigos e filtra categoria e rascunhos", () => {
    expect(ids(layout(grid("latest")))).toEqual([posts[3].id, posts[1].id]);
    expect(ids(layout(grid("oldest")))).toEqual([posts[2].id, posts[0].id]);
    expect(ids(layout(grid("category", { categoryId: category })))).toEqual([
      posts[1].id,
      posts[0].id,
    ]);
    expect(
      ids(layout(grid("category", { categoryId: "inexistente" }))),
    ).toEqual([]);
  });
  it("usa visualizações locais e recorre aos recentes quando não há métricas", () => {
    const value = layout(grid("popular"));
    const popularity = {
      from: "2026-09-09",
      to: "2026-10-08",
      available: true,
      partial: true,
      views: {
        [catalog.summaries.find((p) => p.id === posts[0].id)!.url]: 100,
      },
    };
    const resolved = homeGrids(catalog, value, popularity)[0];
    expect(resolved.cards.map((p) => p.id)).toEqual([posts[0].id]);
    expect(ids(value)).toEqual([posts[3].id, posts[1].id]);
    expect(resolved).not.toHaveProperty("mode");
    expect(resolved).not.toHaveProperty("postIds");
  });
  it("valida limites, IDs únicos, elegibilidade e contratos automáticos", () => {
    const manual = grid(undefined, { postIds: [posts[0].id] });
    expect(() =>
      validateMusicalHome(layout(manual), new Set([posts[0].id])),
    ).not.toThrow();
    expect(() => validateMusicalHome(layout(manual), new Set())).toThrow(
      /publicados/,
    );
    expect(
      homeLayoutSchema.safeParse(
        layout(grid("manual", { postIds: ["a", "a"] })),
      ).success,
    ).toBe(false);
    expect(
      homeLayoutSchema.safeParse(layout(grid("latest", { postIds: ["a"] })))
        .success,
    ).toBe(false);
    expect(homeLayoutSchema.safeParse(layout(grid("category"))).success).toBe(
      false,
    );
    expect(
      homeLayoutSchema.safeParse(
        layout(grid("latest", { categoryId: category })),
      ).success,
    ).toBe(false);
    expect(
      homeLayoutSchema.safeParse(
        layout(grid("manual", { columns: 1, postIds: ["a", "b"] })),
      ).success,
    ).toBe(false);
    expect(
      homeLayoutSchema.safeParse(
        layout(
          ...Array.from({ length: 9 }, (_, i) =>
            grid("latest", { id: `grid-${i}` }),
          ),
        ),
      ).success,
    ).toBe(false);
    expect(homeLayoutSchema.safeParse(layout(manual, manual)).success).toBe(
      false,
    );
    expect(homeLayoutSchema.safeParse(layout()).success).toBe(true);
  });
  it("move artigos e grades sem perder posts nem exceder capacidade", () => {
    const value = layout(
      grid("manual", { id: "a", postIds: ["post-a", "post-b"] }),
      grid("manual", { id: "b", postIds: ["post-c"] }),
      grid("latest", { id: "c" }),
    );
    const moved = moveHomePost(value, "a", "post-a", "b", 1);
    expect(moved.grids.map((g) => g.postIds)).toEqual([
      ["post-b"],
      ["post-c", "post-a"],
      [],
    ]);
    expect(moveHomePost(moved, "a", "post-b", "b", 0)).toBe(moved);
    expect(moveHomePost(value, "a", "post-a", "c", 0)).toBe(value);
    expect(moveHomeGrid(value, 0, -1)).toBe(value);
    expect(moveHomeGrid(value, 0, 1).grids.map((g) => g.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(value.grids[0].postIds).toEqual(["post-a", "post-b"]);
  });
  it("renderiza o ranking no HTML público com os mesmos cards do payload", async () => {
    const app = express();
    const value = layout(grid("popular"));
    const selected = catalog.summaries.find((p) => p.id === posts[0].id)!;
    const web: WebConfig = {
      siteUrl: "https://www.geekmusical.com.br",
      publicSite: false,
      production: false,
      environment: "development",
      trustProxy: false,
      port: 3230,
      editorialPreview: false,
    };
    mountPages(
      app,
      async () =>
        "<html><head><!--seo:start--><!--seo:end--></head><body><!--editorial--></body></html>",
      web,
      undefined,
      catalog,
      undefined,
      false,
      undefined,
      undefined,
      () => value,
      () => ({
        from: "2026-09-09",
        to: "2026-10-08",
        available: true,
        partial: true,
        views: { [selected.url]: 100 },
      }),
    );
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    const payload = JSON.parse(
      response.text.match(/id="gm-home-layout"[^>]*>([\s\S]*?)<\/script>/)![1],
    );
    expect(payload[0].cards.map((p: { id: string }) => p.id)).toEqual([
      selected.id,
    ]);
    const hrefs = [
      ...response.text.matchAll(/class="home-post-card" href="([^"]+)"/g),
    ].map((match) => match[1]);
    expect(hrefs).toEqual([selected.url]);
    expect(response.text).not.toContain(posts[4].title);
  });
});
