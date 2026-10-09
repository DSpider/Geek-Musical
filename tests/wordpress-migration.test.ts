import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import request from "supertest";
import { readFile, mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  convertWordpressPost,
  type WordpressPost,
} from "../scripts/wordpress-convert.js";
import {
  readSourceContent,
  ContentCatalog,
} from "../server/content/catalog.js";
import { renderMarkdown, references } from "../server/content/markdown.js";
import {
  readLegacyManifest,
  mountLegacyMedia,
  validateLegacyTargets,
} from "../server/content/legacy.js";
import { createApp } from "../server/app.js";
import { mountPages } from "../server/web/pages.js";
import { fixtureMode, type WebConfig } from "../server/config.js";
import {
  safeContentLink,
  safeMediaPath,
  type Post,
} from "../shared/content.js";
import type { LegacyManifest } from "../shared/legacy.js";

const source = readSourceContent();
const basePost = source.posts.find((p) => p.status === "published")!;
const original: WordpressPost = {
  id: 123,
  slug: "exemplo-preservado",
  title: "Exemplo de artigo preservado",
  authorId: 2,
  publishedAt: "2024-01-01",
  updatedAt: "2024-02-01",
  excerpt: "",
  body: "",
  sourceHash: "a".repeat(64),
};
const web: WebConfig = {
  siteUrl: "https://www.geekmusical.com.br",
  production: true,
  publicSite: true,
  environment: "production",
  trustProxy: "loopback",
  port: 3230,
  editorialPreview: false,
};
const resolve = (u: string) =>
  u.startsWith("https://loja.example.org/") ? u : undefined;
describe("migração seletiva de WordPress", () => {
  it("não encaminha artigos retirados do Rank Math para a home", () => {
    const manifest = readLegacyManifest("content");
    expect(
      manifest.routes.filter(
        (r) => r.source === "rank-math" && r.destination === "/",
      ),
    ).toEqual([]);
  });
  it("recusa iniciar com imagens publicadas ausentes no inventário", () => {
    const catalog = new ContentCatalog(source.registries, source.posts, false);
    expect(() =>
      validateLegacyTargets({ version: 1, routes: [], media: [] }, catalog),
    ).toThrow("Imagem publicada fora do inventário");
    expect(() =>
      validateLegacyTargets(readLegacyManifest("content"), catalog),
    ).not.toThrow();
  });
  it("resolve templates Elementor, tabelas e FAQ e elimina HTML executável e preços dos blocos de ofertas", () => {
    const converted = convertWordpressPost(
      original,
      {
        metas: {
          "123": {
            _elementor_data: JSON.stringify([
              {
                widgetType: "heading",
                settings: { title: "Comparação", header_size: "h2" },
              },
              { widgetType: "global", templateID: 9 },
              {
                widgetType: "saswp-faq-block",
                settings: {
                  list: [
                    {
                      saswp_faq_question: "Como escolher?",
                      saswp_faq_answer: "<p>Confira a documentação.</p>",
                    },
                  ],
                },
              },
            ]),
          },
          "9": {
            _elementor_data: JSON.stringify([
              {
                widgetType: "text-editor",
                settings: {
                  editor:
                    '<script>SECRET</script><p onclick="attack()">Texto <strong>útil</strong> [content-egg-block template=offers]</p><table><tr><th>Modelo</th><th>Condição</th></tr><tr><td>Original</td><td>Não confirmado</td></tr></table><img src="/wp-content/uploads/2024/01/foto.jpg" alt="Foto original"><a href="javascript:attack()">Inválido</a>',
                },
              },
            ]),
          },
        },
        templates: {},
        offers: {
          "123": [
            {
              title: "Produto original",
              url: "https://loja.example.org/produto",
              img: "https://m.media-amazon.com/produto.jpg",
            },
          ],
        },
      },
      resolve,
    );
    expect(converted.body).toContain("## Comparação");
    expect(converted.body).toContain("### Como escolher?");
    expect(converted.body).toContain("| Modelo | Condição |");
    expect(converted.body).toContain("media:M-");
    expect(converted.body).not.toMatch(
      /SECRET|onclick|javascript|content-egg|<script/,
    );
    const post = {
      ...basePost,
      kind: "legacy",
      media: converted.media,
      links: converted.links,
      body: converted.body,
    } as Post;
    expect(() => references(post.body, post)).not.toThrow();
    const html = renderMarkdown(post, () => undefined).html;
    expect(html).toContain('rel="sponsored nofollow noopener"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("onclick");
  });
  it("recusa ciclos em templates globais", () => {
    expect(() =>
      convertWordpressPost(
        original,
        {
          metas: {
            "123": {
              _elementor_data: '[{"widgetType":"global","templateID":9}]',
            },
            "9": {
              _elementor_data: '[{"widgetType":"global","templateID":9}]',
            },
          },
          templates: {},
          offers: {},
        },
        resolve,
      ),
    ).toThrow(/ciclo/);
  });
  it("rejeita imagens e links locais, travessia e credenciais", () => {
    for (const u of [
      "/wp-content/uploads/../wp-config.php",
      "/wp-content/uploads/a%2fb.jpg",
      "/wp-content/uploads/x.php",
      "/wp-content/uploads/%2e%2e/x.jpg",
    ])
      expect(safeMediaPath(u), u).toBe(false);
    for (const u of [
      "javascript:alert(1)",
      "https://secret@site.org/",
      "https://172.16.0.1/a",
      "https://127.0.0.1/a",
      "//evil.org/",
      "/gm-admin-login",
    ])
      expect(safeContentLink(u), u).toBe(false);
  });
  it("serve artigo na URL original, Story 301 equivalente, retirada 410 e desconhecida 404", async () => {
    const legacyPost: Post = {
      ...basePost,
      id: "WP-POST-123",
      status: "published",
      publishedAt: basePost.createdAt,
      kind: "legacy",
      canonicalPath: "/exemplo-preservado/",
      origin: {
        system: "wordpress",
        postId: 123,
        sourcePath: "/exemplo-preservado/",
        sourceHash: "a".repeat(64),
        importedAt: "2026-10-02",
      },
      media: [],
      links: [],
      sources: [],
      body: "## Exemplo preservado\n\nTexto completo de um artigo de teste preservado, sem referências a imagens ou links não cadastrados.",
    };
    const catalog = new ContentCatalog(
      source.registries,
      [...source.posts, legacyPost],
      false,
    );
    const legacy: LegacyManifest = {
      version: 1,
      media: [],
      routes: [
        {
          path: "/web-stories/exemplo-preservado/",
          status: 301,
          destination: "/exemplo-preservado/",
          forwardQuery: true,
          source: "web-story",
        },
        {
          path: "/retirado/",
          status: 410,
          forwardQuery: false,
          source: "wordpress",
        },
      ],
    };
    const app = createApp(web);
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
    const get = (p: string) =>
      request(app)
        .get(p)
        .set("Host", "www.geekmusical.com.br")
        .set("X-Forwarded-Proto", "https");
    const page = await get("/exemplo-preservado/");
    expect(page.status).toBe(200);
    expect(page.text).toContain(
      'href="https://www.geekmusical.com.br/exemplo-preservado/"',
    );
    const rendered = new JSDOM(page.text);
    expect(
      rendered.window.document
        .querySelector(".blog-byline time")
        ?.getAttribute("datetime"),
    ).toBe(legacyPost.publishedAt || legacyPost.createdAt);
    rendered.window.close();
    expect(page.text).toContain(
      source.registries.authors.find((a) => a.id === legacyPost.authorId)!.name,
    );
    expect(page.text).not.toContain('class="blog-editorial-note"');
    expect(page.text).not.toContain("Fontes consultadas");
    const story = await get(
      "/web-stories/exemplo-preservado/?utm_source=teste",
    );
    expect(story.status).toBe(301);
    expect(story.headers.location).toBe(
      "/exemplo-preservado/?utm_source=teste",
    );
    const removed = await get("/retirado/");
    expect(removed.status).toBe(410);
    expect(removed.text).toContain("Esta publicação foi retirada");
    expect(removed.headers["x-robots-tag"]).toContain("noindex");
    expect((await get("/nao-existe/")).status).toBe(404);
    const apex = await request(app)
      .get("/exemplo-preservado/?a=b")
      .set("Host", "geekmusical.com.br")
      .set("X-Forwarded-Proto", "https");
    expect(apex.status).toBe(308);
    expect(apex.headers.location).toBe(
      "https://www.geekmusical.com.br/exemplo-preservado/?a=b",
    );
  });
  it("serve apenas imagens inventariadas e verifica seus hashes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gp-media-"));
    try {
      const bytes = Buffer.from("imagem-validada-fixture");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await mkdir(path.join(root, "legacy-media"));
      await writeFile(path.join(root, "legacy-media", sha256 + ".jpg"), bytes);
      const manifest: LegacyManifest = {
        version: 1,
        routes: [],
        media: [
          {
            path: "/wp-content/uploads/2024/01/foto.jpg",
            file: sha256 + ".jpg",
            sha256,
            bytes: bytes.length,
          },
        ],
      };
      await writeFile(
        path.join(root, "legacy-routes.json"),
        JSON.stringify(manifest),
      );
      const app = createApp(web);
      mountLegacyMedia(app, root, readLegacyManifest(root));
      const get = (p: string) =>
        request(app).get(p).set("Host", "localhost:3230");
      expect((await get(manifest.media[0].path)).status).toBe(200);
      expect((await get("/wp-content/uploads/config.jpg")).status).toBe(404);
      await writeFile(
        path.join(root, "legacy-media", sha256 + ".jpg"),
        "alterado",
      );
      expect(() => mountLegacyMedia(app, root, manifest)).toThrow(/inventário/);
    } finally {
      if (
        !path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep) ||
        !path.basename(root).startsWith("gp-media-")
      )
        throw new Error("Diretório temporário fora do escopo.");
      await rm(root, { recursive: true, force: true });
    }
  });
  it("fixtures e homologação não são permitidas", () => {
    expect(() => fixtureMode("true", "production")).toThrow(
      /não são permitidas/,
    );
    expect(() => fixtureMode("true", "staging")).toThrow(/não são permitidas/);
    expect(fixtureMode(undefined, "development")).toBe(false);
  });
});
