import { z } from "zod";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { contentSnapshot } from "../../content/build.js";
import sharp from "sharp";
import { digest } from "../database.js";
import { adminUser, upsertAdminUser } from "../auth.js";
import { AdminError } from "../errors.js";
import type { AdminPluginDefinition } from "../registry.js";
import { readLegacyManifest } from "../../content/legacy.js";
import { passwordSchema } from "../../../shared/admin.js";
import { revisionSchema } from "../../../shared/admin.js";
import { authorSchema } from "../../../shared/content.js";
import { settingsApi } from "./settings-api.js";
const usersRevision = (ctx: import("../registry.js").PluginContext) =>
  digest(
    JSON.stringify(
      ctx.db.sql
        .prepare(
          "SELECT id,email,name,role_id,active,updated_at FROM users ORDER BY id",
        )
        .all(),
    ),
  );
export const governancePlugin: AdminPluginDefinition = {
  id: "governance",
  name: "Gestão editorial",
  description: "Mídia, SEO e contas próprias do Geek Musical.",
  version: "1.0.0",
  required: true,
  settings: [
    {
      key: "governance.editorialPolicy",
      schema: z
        .object({
          enabled: z.boolean(),
          site: z.literal("https://www.geekmusical.com.br"),
          timezone: z.literal("America/Sao_Paulo"),
          authorId: z.string(),
          authorizedBy: z.string(),
          authorizedAt: z.string(),
          contractVersion: z.literal("2026-10-09"),
          humanApprovalPerArticle: z.literal(false),
        })
        .strict(),
      defaultValue: {
        enabled: false,
        site: "https://www.geekmusical.com.br",
        timezone: "America/Sao_Paulo",
        authorId: "AUTHOR-DANIEL-LIMA",
        authorizedBy: "",
        authorizedAt: "",
        contractVersion: "2026-10-09",
        humanApprovalPerArticle: false,
      },
    },
  ],
  permissions: [
    { id: "governance.publish", roles: ["admin"] },
    { id: "media.read", roles: ["admin", "editor", "seo"] },
    { id: "media.manage", roles: ["admin", "editor"] },
    { id: "seo.read", roles: ["admin", "editor", "seo"] },
    { id: "users.manage", roles: [] },
  ],
  pages: [
    {
      label: "Mídia",
      path: "/gm-admin/media",
      page: "media",
      permission: "media.read",
      icon: "Image",
      position: 46,
    },
    {
      label: "SEO",
      path: "/gm-admin/seo",
      page: "seo",
      permission: "seo.read",
      icon: "Search",
      position: 47,
    },
    {
      label: "Usuários",
      path: "/gm-admin/users",
      page: "users",
      permission: "users.manage",
      icon: "Users",
      position: 65,
    },
  ],
  api: [
    ...settingsApi("governance", "governance.publish"),
    {
      method: "post",
      path: "/governance/published-snapshot",
      permission: "governance.publish",
      handle: (ctx, req, res) => {
        const input = z
          .object({ revision: revisionSchema })
          .strict()
          .parse(req.body);
        ctx.content.refresh();
        if (input.revision !== ctx.content.revision)
          throw new AdminError(
            "CONFLICT",
            "Conteúdo alterado antes do snapshot.",
          );
        const snapshot = contentSnapshot(
          ctx.content.snapshot(),
          ctx.web.environment || "development",
          false,
          ctx.web.siteUrl,
        );
        const directory = path.resolve(ctx.content.root, "../published");
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        const temporary = path.join(directory, randomUUID() + ".tmp");
        const serialized = JSON.stringify(snapshot);
        writeFileSync(temporary, serialized, { mode: 0o600, flag: "wx" });
        renameSync(temporary, path.join(directory, "catalog.json"));
        ctx.db.audit(
          adminUser(res).id,
          "PUBLISHED_SNAPSHOT",
          "content",
          ctx.content.revision,
        );
        res.json({
          revision: ctx.content.revision,
          posts: snapshot.posts.length,
          sha256: digest(serialized),
        });
      },
    },
    {
      method: "post",
      path: "/governance/authors",
      permission: "governance.publish",
      handle: (ctx, req, res) => {
        const input = z
          .object({ revision: revisionSchema, author: authorSchema })
          .strict()
          .parse(req.body);
        ctx.content.commit(
          input.revision,
          adminUser(res).id,
          "CREATE_AUTHOR",
          "authors",
          input.author.id,
          (state) => {
            if (
              state.registries.authors.some(
                (a) => a.id === input.author.id || a.name === input.author.name,
              )
            )
              throw new AdminError(
                "CONFLICT",
                "Autor já cadastrado. Preserve sua identidade existente.",
              );
            state.registries.authors.push(input.author);
          },
        );
        res.status(201).json({ revision: ctx.content.revision });
      },
    },
    {
      method: "get",
      path: "/governance/media",
      permission: "media.read",
      handle: (ctx, _req, res) =>
        res.json({ items: readLegacyManifest(ctx.content.root).media }),
    },
    {
      method: "post",
      path: "/governance/media",
      permission: "media.manage",
      handle: async (ctx, req, res) => {
        const input = z
          .object({
            data: z
              .string()
              .max(1_500_000)
              .regex(/^[A-Za-z0-9+/]+=*$/),
            alt: z.string().min(3).max(300),
          })
          .strict()
          .parse(req.body);
        const bytes = Buffer.from(input.data, "base64");
        const image = sharp(bytes, {
          limitInputPixels: 16_000_000,
          failOn: "error",
        });
        const metadata = await image.metadata().catch(() => {
          throw new AdminError(
            "VALIDATION_ERROR",
            "Arquivo de imagem inválido.",
          );
        });
        if (
          !["jpeg", "png", "webp"].includes(metadata.format || "") ||
          (metadata.pages || 1) > 1
        )
          throw new AdminError(
            "VALIDATION_ERROR",
            "Use uma imagem estática JPEG, PNG ou WebP.",
          );
        const output = await image
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer();
        const hash = digest(output.toString("base64")),
          filename = hash + ".webp",
          dir = path.resolve(ctx.content.root, "editorial-media");
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await writeFile(path.join(dir, filename), output, { mode: 0o600 });
        ctx.db.audit(
          adminUser(res).id,
          "UPLOAD_EDITORIAL_MEDIA",
          "media",
          hash,
        );
        res.json({
          url: "/editorial-media/" + filename,
          alt: input.alt,
          sha256: hash,
          bytes: output.length,
        });
      },
    },
    {
      method: "get",
      path: "/governance/seo",
      permission: "seo.read",
      handle: (ctx, _req, res) =>
        res.json({
          items: ctx.content.catalog(false).summaries.map((p) => {
            const post = ctx.content.catalog(false).getPost(p.id)!;
            return {
              id: p.id,
              url: p.url,
              title: post.seoTitle,
              description: post.seoDescription,
              publishedAt: post.publishedAt,
              source: post.origin?.sourceHash,
            };
          }),
          graph: ctx.content.graph(),
        }),
    },
    {
      method: "get",
      path: "/governance/users",
      permission: "users.manage",
      handle: (ctx, _req, res) =>
        res.json({
          items: ctx.db.sql
            .prepare(
              "SELECT id,email,name,role_id AS role,active FROM users ORDER BY name",
            )
            .all(),
          revision: usersRevision(ctx),
        }),
    },
    {
      method: "post",
      path: "/governance/users",
      permission: "users.manage",
      handle: async (ctx, req, res) => {
        const input = z
          .object({
            email: z.email(),
            name: z.string().min(2).max(100),
            password: passwordSchema,
            role: z.enum(["super_admin", "admin", "editor", "seo"]),
          })
          .strict()
          .parse(req.body);
        if (
          ctx.db.sql
            .prepare("SELECT id FROM users WHERE email=?")
            .get(input.email.toLowerCase())
        )
          throw new AdminError("CONFLICT", "E-mail já cadastrado.");
        await upsertAdminUser(ctx.db, input, false);
        ctx.db.audit(adminUser(res).id, "CREATE_USER", "users");
        res.status(201).json({ ok: true });
      },
    },
    {
      method: "put",
      path: "/governance/users/:id",
      permission: "users.manage",
      handle: (ctx, req, res) => {
        const input = z
          .object({
            revision: z.string().regex(/^[a-f0-9]{64}$/),
            role: z.enum(["super_admin", "admin", "editor", "seo"]),
            active: z.boolean(),
          })
          .strict()
          .parse(req.body);
        ctx.db.transaction(() => {
          if (input.revision !== usersRevision(ctx))
            throw new AdminError("CONFLICT", "Contas alteradas. Recarregue.");
          const row = ctx.db.sql
            .prepare("SELECT role_id,active FROM users WHERE id=?")
            .get(String(req.params.id));
          if (!row) throw new AdminError("NOT_FOUND", "Conta não encontrada.");
          if (
            row.role_id === "super_admin" &&
            row.active &&
            (!input.active || input.role !== "super_admin") &&
            Number(
              ctx.db.sql
                .prepare(
                  "SELECT COUNT(*) AS total FROM users WHERE role_id='super_admin' AND active=1",
                )
                .get()!.total,
            ) <= 1
          )
            throw new AdminError(
              "CONFLICT",
              "Preserve pelo menos um superadministrador ativo.",
            );
          ctx.db.sql
            .prepare(
              "UPDATE users SET role_id=?,active=?,updated_at=? WHERE id=?",
            )
            .run(
              input.role,
              Number(input.active),
              new Date().toISOString(),
              String(req.params.id),
            );
          ctx.db.sql
            .prepare("DELETE FROM sessions WHERE user_id=?")
            .run(String(req.params.id));
          ctx.db.audit(
            adminUser(res).id,
            "UPDATE_USER_ACCESS",
            "users",
            String(req.params.id),
          );
        });
        res.json({ revision: usersRevision(ctx) });
      },
    },
  ],
  publicMiddleware: (ctx) => {
    return (req, res, next) => {
      const match = /^\/editorial-media\/([a-f0-9]{64}\.webp)$/.exec(req.path);
      if (!match) return next();
      const published = ctx.content.catalog(false).summaries.some((summary) => {
        const post = ctx.content.catalog(false).getPost(summary.id);
        return (
          post?.coverImage?.path === req.path ||
          post?.editorialMedia?.some((media) => media.url === req.path)
        );
      });
      if (!published) {
        res.status(404).set("Cache-Control", "no-store").end();
        return;
      }
      res
        .set("Cache-Control", "public, max-age=86400")
        .sendFile(
          path.resolve(ctx.content.root, "editorial-media", match[1]),
          { dotfiles: "deny" },
          (error) => {
            if (error && !res.headersSent) res.status(404).end();
          },
        );
    };
  },
};
