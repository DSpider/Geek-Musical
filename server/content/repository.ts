import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  openSync,
  closeSync,
  fsyncSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ContentCatalog,
  readSourceContent,
  validateContent,
} from "./catalog.js";
import {
  registriesSchema,
  postSchema,
  type Registries,
  type Post,
  type EditorialProduct,
} from "./schema.js";
import { AdminDatabase, digest } from "../admin/database.js";
import { AdminError } from "../admin/errors.js";
import { references } from "./markdown.js";
export interface ContentState {
  registries: Registries;
  posts: Post[];
}
type FileChange = { file: string; value: string | null };
export class ContentRepository {
  private state!: ContentState;
  private revisionValue = "";
  private publicCatalog!: ContentCatalog;
  private previewCatalog!: ContentCatalog;
  private fileNames = new Map<string, string>();
  private pageSize = 12;
  private offerResolver?: (product: EditorialProduct) => EditorialProduct;
  private postResolver?: (post: Post) => Post;
  setPostResolver(resolver: (post: Post) => Post) {
    this.postResolver = resolver;
    this.publicCatalog.postResolver = resolver;
    this.previewCatalog.postResolver = resolver;
  }
  setOfferResolver(resolver: (product: EditorialProduct) => EditorialProduct) {
    this.offerResolver = resolver;
    this.publicCatalog.offerResolver = resolver;
    this.previewCatalog.offerResolver = resolver;
  }
  constructor(
    readonly root: string,
    readonly db: AdminDatabase,
  ) {
    this.recover();
    this.refresh();
  }
  setPageSize(size: number) {
    if (size !== this.pageSize) {
      this.pageSize = size;
      this.refresh();
    }
  }
  private assertFeaturedVisible(state: ContentState) {
    const row = this.db.sql
      .prepare("SELECT value FROM settings WHERE key='home.layout'")
      .get();
    if (!row) return;
    const layout = JSON.parse(String(row.value)) as {
      grids: { mode?: string; postIds: string[] }[];
    } | null;
    const selected =
      layout?.grids
        .filter((grid) => !grid.mode || grid.mode === "manual")
        .flatMap((grid) => grid.postIds) || [];
    for (const id of new Set(selected)) {
      const post = state.posts.find((p) => p.id === id);
      if (
        !post ||
        post.status !== "published" ||
        !state.registries.categories.some(
          (c) => c.id === post.categoryId && c.status === "active",
        )
      )
        throw new AdminError(
          "CONFLICT",
          "Substitua ou remova o artigo das grades manuais da Home antes de retirar sua publicação ou desativar sua categoria.",
        );
    }
  }
  private install(state: ContentState) {
    this.state = state;
    this.revisionValue = digest(JSON.stringify(state));
    this.publicCatalog = new ContentCatalog(
      state.registries,
      state.posts,
      false,
      this.pageSize,
    );
    this.previewCatalog = new ContentCatalog(
      state.registries,
      state.posts,
      true,
      this.pageSize,
    );
    this.publicCatalog.offerResolver = this.offerResolver;
    this.previewCatalog.offerResolver = this.offerResolver;
    this.publicCatalog.postResolver = this.postResolver;
    this.previewCatalog.postResolver = this.postResolver;
  }
  refresh() {
    if (this.db.sql.prepare("SELECT id FROM content_journal").get())
      throw new AdminError(
        "INTERNAL_ERROR",
        "Existe uma escrita editorial pendente. Reinicie para recuperar antes de editar.",
      );
    this.install(readSourceContent(this.root));
    this.fileNames = new Map(
      readdirSync(path.join(this.root, "blog"))
        .filter((f) => f.endsWith(".md"))
        .map((file) => {
          const value = readFileSync(
            path.join(this.root, "blog", file),
            "utf8",
          );
          const meta = JSON.parse(
            value
              .replace(/^\uFEFF/, "")
              .match(/^---\r?\n([\s\S]*?)\r?\n---/)![1],
          );
          return [String(meta.id), file];
        }),
    );
  }
  snapshot() {
    return structuredClone(this.state);
  }
  get revision() {
    return this.revisionValue;
  }
  commitAutomation(
    expected: string,
    post: Post,
    baseHash: string | null = null,
  ) {
    if (
      post.status !== "review" ||
      post.publishedAt !== undefined ||
      post.reviewerId !== undefined
    )
      throw new AdminError(
        "FORBIDDEN",
        "A automação só pode salvar conteúdo em revisão, sem aprovação ou publicação.",
      );
    return this.commit(
      expected,
      "automation",
      "EDITORIAL_DRAFT",
      "posts",
      post.id,
      (state) => {
        const previous = state.posts.find((p) => p.id === post.id);
        if (previous?.status === "published" || previous?.status === "archived")
          throw new AdminError(
            "FORBIDDEN",
            "A automação não altera artigos públicos ou arquivados. Crie uma proposta de revisão.",
          );
        if (
          (previous &&
            (!baseHash || digest(JSON.stringify(previous)) !== baseHash)) ||
          (!previous && baseHash)
        )
          throw new AdminError(
            "CONFLICT",
            "O artigo mudou desde a pesquisa. Preserve a edição humana e revise a proposta.",
          );
        if (previous)
          state.posts[state.posts.findIndex((p) => p.id === post.id)] =
            structuredClone(post);
        else state.posts.push(structuredClone(post));
      },
    );
  }
  catalog(preview: boolean) {
    return preview ? this.previewCatalog : this.publicCatalog;
  }
  private target(file: string) {
    if (
      !/^(?:categories\.json|authors\.json|redirects\.json|products\.json|blog\/[A-Za-z0-9-]+\.md)$/.test(
        file,
      )
    )
      throw new Error("Caminho editorial inválido.");
    const target = path.resolve(this.root, file);
    if (!target.startsWith(path.resolve(this.root) + path.sep))
      throw new Error("Caminho fora do conteúdo.");
    return target;
  }
  private apply(files: FileChange[]) {
    for (const change of files) {
      const target = this.target(change.file);
      if (change.value === null) {
        if (existsSync(target)) unlinkSync(target);
        continue;
      }
      const temp = target + "." + randomUUID() + ".tmp";
      try {
        writeFileSync(temp, change.value, { mode: 0o600, flag: "wx" });
        const descriptor = openSync(temp, "r+");
        try {
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
        renameSync(temp, target);
      } finally {
        if (existsSync(temp)) unlinkSync(temp);
      }
      if (process.platform !== "win32") {
        const directory = openSync(path.dirname(target), "r");
        try {
          fsyncSync(directory);
        } finally {
          closeSync(directory);
        }
      }
    }
  }
  recover() {
    const pending = this.db.sql
      .prepare("SELECT files, audit_id FROM content_journal WHERE id=1")
      .get();
    if (!pending) return;
    const changes = JSON.parse(String(pending.files)) as FileChange[];
    this.apply(changes);
    // Não servir estado parcialmente materializado, mesmo após crash.
    readSourceContent(this.root);
    this.db.transaction(() => {
      this.db.sql
        .prepare("UPDATE audit_log SET result='SUCCESS' WHERE id=?")
        .run(Number(pending.audit_id));
      this.db.sql.prepare("DELETE FROM content_journal WHERE id=1").run();
    });
  }
  commit(
    expected: string,
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    change: (state: ContentState) => void,
  ) {
    this.refresh();
    if (expected !== this.revision)
      throw new AdminError(
        "CONFLICT",
        "O conteúdo mudou desde a leitura. Recarregue antes de salvar.",
      );
    const next = this.snapshot();
    change(next);
    try {
      next.registries = registriesSchema.parse(next.registries);
      for (const post of next.posts) {
        const { body: _body, ...metadata } = post;
        postSchema.parse(metadata);
      }
      this.assertFeaturedVisible(next);
      validateContent(next.registries, next.posts, this.root);
    } catch (error) {
      throw new AdminError(
        "VALIDATION_ERROR",
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Conteúdo inválido.",
      );
    }
    const files: FileChange[] = [];
    for (const name of [
      "categories",
      "authors",
      "redirects",
      "products",
    ] as const)
      if (
        JSON.stringify(next.registries[name]) !==
        JSON.stringify(this.state.registries[name])
      )
        files.push({
          file: name + ".json",
          value: JSON.stringify(next.registries[name], null, 2) + "\n",
        });
    for (const post of next.posts) {
      if (
        JSON.stringify(post) ===
        JSON.stringify(this.state.posts.find((p) => p.id === post.id))
      )
        continue;
      const { body, ...metadata } = post;
      files.push({
        file: "blog/" + (this.fileNames.get(post.id) || post.id + ".md"),
        value: `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${body}\n`,
      });
    }
    for (const previous of this.state.posts)
      if (!next.posts.some((p) => p.id === previous.id))
        files.push({
          file: "blog/" + this.fileNames.get(previous.id)!,
          value: null,
        });
    if (!files.length) return this.revision;
    this.db.transaction(() => {
      if (this.db.sql.prepare("SELECT id FROM content_journal").get())
        throw new AdminError(
          "CONFLICT",
          "Há uma alteração editorial em andamento.",
        );
      const auditId = this.db.audit(
        userId,
        action,
        resource,
        resourceId,
        "PENDING",
      );
      this.db.sql
        .prepare("INSERT INTO content_journal VALUES (1, ?, ?)")
        .run(JSON.stringify(files), auditId);
    });
    this.recover();
    this.refresh();
    return this.revision;
  }
  graph() {
    const catalog = new ContentCatalog(
      this.state.registries,
      this.state.posts,
      true,
    );
    const entries = this.state.posts.map((p) => {
      const category = this.state.registries.categories.find(
        (c) => c.id === p.categoryId,
      )!;
      const bodyLinks = references(p.body, p).posts;
      const outgoing = [
        ...new Set([
          ...p.relatedPostIds,
          ...bodyLinks,
          ...(p.kind === "supporting" && category.pillarPostId
            ? [category.pillarPostId]
            : []),
          ...(p.kind === "pillar"
            ? this.state.posts
                .filter(
                  (other) =>
                    other.categoryId === p.categoryId && other.id !== p.id,
                )
                .map((other) => other.id)
            : []),
        ]),
      ];
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        url: catalog.summaries.find((s) => s.id === p.id)?.url || "",
        incoming: [] as string[],
        outgoing,
        bodyLinks,
        relatedPostIds: p.relatedPostIds,
        orphan: false,
      };
    });
    for (const entry of entries) {
      entry.incoming = entries
        .filter((other) => other.outgoing.includes(entry.id))
        .map((other) => other.id);
      entry.orphan = !entry.incoming.length;
    }
    return entries;
  }
}
