import { describe, it, expect } from "vitest";
import { cpSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  eligibleSlot,
  lockedRun,
  sealPackage,
} from "../server/content/routine-run.js";
import { postSchema } from "../shared/content.js";
import { references, renderMarkdown } from "../server/content/markdown.js";
import { assertConsumerArticle } from "../server/content/editorial-policy.js";
import { ContentRepository } from "../server/content/repository.js";
import { AdminDatabase } from "../server/admin/database.js";
import { builtinPlugins } from "../server/admin/plugins/index.js";
import { governancePlugin } from "../server/admin/plugins/governance.js";
import { SettingsService } from "../server/admin/settings.js";

describe("rotina editorial", () => {
  it("recupera somente o horário do dia em São Paulo", () => {
    expect(eligibleSlot(new Date("2026-10-09T16:59:59Z"))).toBeNull();
    expect(eligibleSlot(new Date("2026-10-09T17:00:00Z"))).toBe(
      "2026-10-09T14:00:00-03:00",
    );
    expect(eligibleSlot(new Date("2026-10-10T02:59:00Z"))).toBe(
      "2026-10-09T14:00:00-03:00",
    );
    expect(eligibleSlot(new Date("2026-10-10T03:00:00Z"))).toBeNull();
    expect(eligibleSlot(new Date("2026-10-12T17:00:00Z"))).toBe(
      "2026-10-12T14:00:00-03:00",
    );
  });
  it("retoma o mesmo pacote, recusa troca e libera a trava após falha", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "gm-routine-"));
    try {
      const slot = "2026-10-09T14:00:00-03:00",
        packet = { post: { id: "POST-A" } },
        raw = JSON.stringify(packet);
      await lockedRun(root, slot, async (run, folder) => {
        sealPackage(run, folder, packet, raw);
      });
      await expect(
        lockedRun(root, slot, async (run, folder) => {
          sealPackage(run, folder, { post: { id: "POST-B" } }, "changed");
        }),
      ).rejects.toThrow(/selado/);
      await lockedRun(root, slot, async (run, folder) => {
        expect(sealPackage(run, folder, packet, raw)).toBe(run.packageHash);
        expect(run.articleId).toBe("POST-A");
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("mantém a política desativada e persiste novos autores sem mudar os históricos", () => {
    const root = mkdtempSync(path.join(tmpdir(), "gm-authors-"));
    cpSync("content", path.join(root, "content"), {
      recursive: true,
      filter: (s) => !s.includes("legacy-media") && !s.endsWith(".lock"),
    });
    const db = new AdminDatabase(path.join(root, "admin.sqlite"));
    try {
      const registry = builtinPlugins();
      registry.initialize(db);
      const settings = new SettingsService(db, governancePlugin.settings || []);
      expect(settings.get<any>("governance.editorialPolicy").enabled).toBe(
        false,
      );
      const repo = new ContentRepository(path.join(root, "content"), db),
        before = repo.snapshot();
      repo.commit(
        repo.revision,
        "test",
        "CREATE_AUTHOR",
        "authors",
        "AUTHOR-DANIEL-LIMA",
        (state) =>
          state.registries.authors.push({
            id: "AUTHOR-DANIEL-LIMA",
            name: "Daniel Lima",
            type: "Person",
            description: "Autor do Geek Musical.",
          }),
      );
      const after = JSON.parse(
        readFileSync(path.join(root, "content/authors.json"), "utf8"),
      );
      expect(after.slice(0, -1)).toEqual(before.registries.authors);
      expect(
        new ContentRepository(path.join(root, "content"), db)
          .snapshot()
          .registries.authors.at(-1)?.name,
      ).toBe("Daniel Lima");
      expect(() =>
        repo.commit(
          "0".repeat(64),
          "test",
          "CREATE_AUTHOR",
          "authors",
          "AUTHOR-B",
          () => {},
        ),
      ).toThrow(/mudou/);
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejeita mídia arbitrária e só renderiza imagens editoriais registradas", () => {
    const media = {
      id: "DIAGRAM",
      url: "/editorial-media/" + "a".repeat(64) + ".webp",
      alt: "Diagrama dos caminhos de áudio",
      width: 1200,
      height: 600,
      credit: "Geek Musical",
      license: "Produção própria autorizada",
    };
    const post: any = {
      id: "P",
      kind: "supporting",
      editorialMedia: [media],
      sources: [],
      body: "![Diagrama](media:DIAGRAM)",
    };
    expect(() => references(post.body, post)).not.toThrow();
    expect(() =>
      references("![x](https://loja.invalid/image.jpg)", post),
    ).toThrow(/referência/);
    const html = renderMarkdown(post, () => undefined).html;
    expect(html).toContain(media.url);
    expect(html).toContain("Geek Musical");
    expect(
      postSchema.shape.editorialMedia.safeParse([
        { ...media, url: "/editorial-media/../../secret.webp" },
      ]).success,
    ).toBe(false);
    expect(() =>
      assertConsumerArticle({ ...post, title: "Conteúdo gerado por IA" }),
    ).toThrow(/Linguagem editorial/);
  });
});
