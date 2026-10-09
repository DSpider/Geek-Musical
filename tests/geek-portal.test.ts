import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import { createApp } from "../server/app.js";
import { AdminRuntime } from "../server/admin/runtime.js";
import { upsertAdminUser } from "../server/admin/auth.js";
import { homeGrids } from "../server/content/discovery.js";
import { validateMusicalHome, type HomeLayout } from "../shared/home-editor.js";
import { publicImageAddress } from "../server/lib/remote-image.js";
import { renderMarkdown } from "../server/content/markdown.js";
import { affiliateInventory } from "../server/admin/plugins/affiliates.js";
import { editorialOfferChecks } from "../server/content/offer-checks.js";
import type { WebConfig } from "../server/config.js";
const root = mkdtempSync(path.join(tmpdir(), "geek-tests-"));
const web: WebConfig = {
  siteUrl: "https://www.geekmusical.com.br",
  publicSite: false,
  production: false,
  environment: "development",
  trustProxy: false,
  port: 3230,
  editorialPreview: false,
};
let admin: AdminRuntime,
  app: ReturnType<typeof createApp>,
  agent: ReturnType<typeof request.agent>,
  csrf: string;
beforeAll(async () => {
  cpSync("content", path.join(root, "content"), {
    recursive: true,
    filter: (s) => !s.includes("legacy-media") && !s.endsWith(".lock"),
  });
  admin = new AdminRuntime(
    {
      enabled: true,
      databaseFile: path.join(root, "admin.sqlite"),
      contentRoot: path.join(root, "content"),
      sessionSecret: "isolated-test-secret".repeat(3),
      sessionHours: 2,
      idleMinutes: 30,
    },
    web,
  );
  await upsertAdminUser(admin.db, {
    email: "admin@example.test",
    name: "Test Admin",
    role: "super_admin",
    password: "A-long-test-password-2026!",
  });
  app = createApp(web, admin);
  agent = request.agent(app);
  const token = await agent.get("/api/admin/auth/csrf");
  csrf = token.body.csrfToken;
  const login = await agent
    .post("/api/admin/auth/login")
    .set("Origin", "http://localhost:3230")
    .set("X-CSRF-Token", csrf)
    .send({
      email: "admin@example.test",
      password: "A-long-test-password-2026!",
    });
  expect(login.status).toBe(200);
  csrf = login.body.csrfToken;
}, 30000);
afterAll(() => {
  admin?.close();
  if (
    !path
      .resolve(root)
      .startsWith(path.resolve(tmpdir()) + path.sep + "geek-tests-")
  )
    throw new Error("Temporary scope invalid");
  rmSync(root, { recursive: true, force: true });
});
describe("Geek Musical: regras editoriais e segurança", () => {
  it("materializa nove destaques distintos e três recentes pela publicação original", () => {
    const catalog = admin.content.catalog(false),
      layout = admin.settings.get<HomeLayout>("home.layout");
    const grids = homeGrids(catalog, layout);
    expect(grids.map((g) => g.cards.length)).toEqual([9, 3]);
    expect(new Set(grids[0].cards.map((c) => c.id)).size).toBe(9);
    const expected = [...catalog.summaries]
      .sort((a, b) =>
        (
          catalog.getPost(b.id)?.origin?.sourcePublishedAt ||
          catalog.getPost(b.id)?.publishedAt ||
          ""
        ).localeCompare(
          catalog.getPost(a.id)?.origin?.sourcePublishedAt ||
            catalog.getPost(a.id)?.publishedAt ||
            "",
        ),
      )
      .slice(0, 3)
      .map((p) => p.id);
    expect(grids[1].cards.map((c) => c.id)).toEqual(expected);
  });
  it("recusa destaque duplicado e mantém estados vazios sem conteúdo fabricado", () => {
    const layout = structuredClone(
      admin.settings.get<HomeLayout>("home.layout"),
    );
    layout.grids[0].postIds[1] = layout.grids[0].postIds[0];
    expect(() =>
      validateMusicalHome(
        layout,
        new Set(admin.content.catalog(false).summaries.map((p) => p.id)),
      ),
    ).toThrow(/uma vez/);
    const empty = structuredClone(layout);
    empty.grids[0].postIds = [];
    expect(() => validateMusicalHome(empty, new Set())).not.toThrow();
  });
  it("recusa sobrescrita concorrente do layout", async () => {
    const before = (await agent.get("/api/admin/home")).body;
    const save = () =>
      agent
        .put("/api/admin/home")
        .set("Origin", "http://localhost:3230")
        .set("X-CSRF-Token", csrf)
        .send({
          layout: {
            ...before.layout,
            grids: before.layout.grids.map(
              (g: { id: string; title: string }) => ({
                ...g,
                title: g.title + " revisado",
              }),
            ),
          },
          revision: before.revision,
        });
    expect((await save()).status).toBe(200);
    expect((await save()).status).toBe(409);
  });
  it("exige substituição antes de despublicar um destaque", () => {
    const id =
      admin.settings.get<HomeLayout>("home.layout").grids[0].postIds[0];
    expect(() =>
      admin.content.commit(
        admin.content.revision,
        "test-admin",
        "TEST",
        "posts",
        id,
        (state) => {
          const post = state.posts.find((p) => p.id === id)!;
          post.status = "draft";
          delete post.publishedAt;
        },
      ),
    ).toThrow(/Substitua/);
  });
  it("salva os cinco tipos, reordena e remove grades sem alterar o acervo", async () => {
    const before = (await agent.get("/api/admin/home")).body;
    const postsBefore = admin.content.revision;
    const base = {
      title: "Nova grade",
      eyebrow: "",
      columns: 2,
      rows: 1,
      postIds: [],
    };
    const grids = [
      ...before.layout.grids,
      {
        ...base,
        id: "manual-extra",
        mode: "manual",
        postIds: [before.posts[0].id],
      },
      { ...base, id: "oldest-extra", mode: "oldest" },
      { ...base, id: "popular-extra", mode: "popular" },
      {
        ...base,
        id: "category-extra",
        mode: "category",
        categoryId: before.categories[0].id,
      },
    ].reverse();
    const save = (value: HomeLayout, revision: string) =>
      agent
        .put("/api/admin/home")
        .set("Origin", "http://localhost:3230")
        .set("X-CSRF-Token", csrf)
        .send({ layout: value, revision });
    const response = await save({ version: 1, grids }, before.revision);
    expect(response.status).toBe(200);
    expect(response.body.layout.grids.map((g: { id: string }) => g.id)).toEqual(
      grids.map((g) => g.id),
    );
    const latest = response.body.resolvedGrids.find(
      (g: { id: string }) => g.id === "recentes",
    );
    expect(latest.cards).toHaveLength(3);
    expect(admin.content.revision).toBe(postsBefore);
    const selected = before.posts[0].id;
    expect(() =>
      admin.content.commit(
        admin.content.revision,
        "test-admin",
        "TEST",
        "posts",
        selected,
        (state) => {
          const post = state.posts.find((p) => p.id === selected)!;
          post.status = "draft";
          delete post.publishedAt;
        },
      ),
    ).toThrow(/grades manuais/);
    // Removing a grid only changes the Home configuration.
    const empty = await save({ version: 1, grids: [] }, response.body.revision);
    expect(empty.status).toBe(200);
    expect(empty.body.resolvedGrids).toEqual([]);
    expect(admin.content.revision).toBe(postsBefore);
    expect((await save(before.layout, empty.body.revision)).status).toBe(200);
  });
  it("rejeita categoria inativa, IDs inexistentes e grades inválidas pela API", async () => {
    const before = (await agent.get("/api/admin/home")).body;
    const base = {
      id: "test",
      title: "Teste",
      eyebrow: "",
      columns: 1,
      rows: 1,
      postIds: [],
    };
    for (const grid of [
      { ...base, mode: "category", categoryId: "inexistente" },
      { ...base, mode: "manual", postIds: ["inexistente"] },
      { ...base, mode: "latest", postIds: [before.posts[0].id] },
      {
        ...base,
        mode: "manual",
        postIds: [before.posts[0].id, before.posts[0].id],
      },
    ]) {
      const response = await agent
        .put("/api/admin/home")
        .set("Origin", "http://localhost:3230")
        .set("X-CSRF-Token", csrf)
        .send({
          layout: { version: 1, grids: [grid] },
          revision: before.revision,
        });
      expect(response.status).toBe(400);
    }
    expect((await agent.get("/api/admin/home")).body.revision).toBe(
      before.revision,
    );
    expect((await request(app).get("/api/admin/home")).status).toBe(401);
    expect(
      (
        await agent
          .put("/api/admin/home")
          .send({ layout: before.layout, revision: before.revision })
      ).status,
    ).toBe(403);
  });
  it("exclui rascunhos do catálogo público", () => {
    const id = admin.content
      .catalog(false)
      .summaries.find(
        (p) =>
          !admin.settings
            .get<HomeLayout>("home.layout")
            .grids[0].postIds.includes(p.id),
      )!.id;
    admin.content.commit(
      admin.content.revision,
      "test-admin",
      "TEST",
      "posts",
      id,
      (state) => {
        const p = state.posts.find((p) => p.id === id)!;
        p.status = "draft";
        delete p.publishedAt;
      },
    );
    expect(admin.content.catalog(false).getPost(id)).toBeUndefined();
    expect(admin.content.catalog(true).getPost(id)).toBeDefined();
  });
  it("protege APIs, CSRF e conta de último superadministrador", async () => {
    expect((await request(app).get("/api/admin/governance/users")).status).toBe(
      401,
    );
    expect(
      (await agent.post("/api/admin/governance/users").send({})).status,
    ).toBe(403);
    const users = (await agent.get("/api/admin/governance/users")).body;
    const change = await agent
      .put("/api/admin/governance/users/" + users.items[0].id)
      .set("Origin", "http://localhost:3230")
      .set("X-CSRF-Token", csrf)
      .send({ revision: users.revision, role: "editor", active: false });
    expect(change.status).toBe(409);
  });
  it("emite cookie DEV HttpOnly/SameSite e não oferece busca comercial ou voz", async () => {
    const response = await request(app).get("/api/admin/auth/csrf");
    expect(response.headers["set-cookie"][0]).toMatch(
      /gm_admin_dev=.*HttpOnly; SameSite=Strict/,
    );
    expect((await request(app).get("/api/search?q=violao")).status).toBe(404);
    expect((await request(app).post("/api/transcribe").send({})).status).toBe(
      404,
    );
  });
  it("mantém inventário deduplicado sem considerar acesso como afiliação comprovada", () => {
    const links = affiliateInventory(admin.context);
    expect(links.length).toBeGreaterThan(100);
    expect(new Set(links.map((l) => l.url)).size).toBe(links.length);
    expect(links.every((l) => !l.evidence)).toBe(true);
  });
  it("suspende o CTA de um destino comprovadamente incorreto sem substituir o produto", async () => {
    const inventory = (await agent.get("/api/admin/affiliates")).body.items;
    const selected = inventory.find(
      (l: { store: string }) => l.store === "mercado-livre",
    );
    const response = await agent
      .put(`/api/admin/affiliates/${selected.id}`)
      .set("Origin", "http://localhost:3230")
      .set("X-CSRF-Token", csrf)
      .send({
        revision: selected.revision,
        accessibility: "accessible",
        product: "incorrect",
        tracking: "unconfirmed",
        source: "",
        notes: "Destino de outro produto: CTA suspenso para revisão.",
      });
    expect(response.status).toBe(200);
    const post = admin.content.catalog(false).getPost(selected.articles[0])!;
    const resolved = editorialOfferChecks(admin.context).resolvePost(post);
    const link = post.links!.find((l) => l.url === selected.url)!;
    expect(resolved.linkStates![link.id].blocked).toBe(true);
    expect(resolved.links!.find((l) => l.id === link.id)!.url).toBe(
      selected.url,
    );
  });
  it("não publica HTML executável e recusa imagens privadas por IPv4/IPv6", () => {
    const post = structuredClone(
      admin.content.catalog(false).getPost("WP-POST-730")!,
    );
    post.body = "<script>alert(1)</script>\n\n[malicioso](javascript:alert(1))";
    const html = renderMarkdown(post, () => undefined).html;
    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="javascript:');
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "192.168.0.1",
      "172.16.0.1",
      "100.64.0.1",
      "::1",
      "fc00::1",
      "2001:db8::1",
    ])
      expect(publicImageAddress(ip)).toBe(false);
  });
  it("recusa SVG em uploads editoriais", async () => {
    const response = await agent
      .post("/api/admin/governance/media")
      .set("Origin", "http://localhost:3230")
      .set("X-CSRF-Token", csrf)
      .send({
        data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString(
          "base64",
        ),
        alt: "Uma imagem de teste",
      });
    expect(response.status).toBe(400);
  });
  it("protege a política, preserva autores e rejeita revisões concorrentes no snapshot", async () => {
    expect((await request(app).get("/api/admin/governance")).status).toBe(401);
    const policy = await agent.get("/api/admin/governance");
    expect(policy.body.values["governance.editorialPolicy"].enabled).toBe(
      false,
    );
    const before = await agent.get("/api/admin/posts/new");
    const created = await agent
      .post("/api/admin/governance/authors")
      .set("Origin", "http://localhost:3230")
      .set("X-CSRF-Token", csrf)
      .send({
        revision: before.body.revision,
        author: {
          id: "AUTHOR-TEST-EDITORIAL",
          name: "Autor da validação editorial",
          type: "Person",
          description: "Autor do Geek Musical.",
        },
      });
    expect(created.status).toBe(201);
    const after = await agent.get("/api/admin/posts/new");
    expect(after.body.registries.authors.slice(0, -1)).toEqual(
      before.body.registries.authors,
    );
    const conflict = await agent
      .post("/api/admin/governance/published-snapshot")
      .set("Origin", "http://localhost:3230")
      .set("X-CSRF-Token", csrf)
      .send({ revision: before.body.revision });
    expect(conflict.status).toBe(409);
    const snapshot = await agent
      .post("/api/admin/governance/published-snapshot")
      .set("Origin", "http://localhost:3230")
      .set("X-CSRF-Token", csrf)
      .send({ revision: after.body.revision });
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
