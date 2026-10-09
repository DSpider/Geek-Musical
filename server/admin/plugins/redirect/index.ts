import { z } from "zod";
import { revisionSchema } from "../../../../shared/admin.js";
import {
  redirectListSchema,
  saveRedirectSchema,
} from "../../../../shared/redirect.js";
import { adminUser } from "../../auth.js";
import { AdminError } from "../../errors.js";
import type { AdminPluginDefinition } from "../../registry.js";
import { redirectMigration } from "./migrations/001-redirect.js";
import { RedirectService } from "./service.js";

export const redirectPlugin: AdminPluginDefinition = {
  id: "redirect",
  name: "Redirect",
  description:
    "Aliases internos e externos com destinos controlados e proteção contra loops.",
  version: "1.1.0",
  permissions: [
    { id: "redirect.read", roles: ["admin", "seo"] },
    { id: "redirect.manage", roles: ["admin", "seo"] },
  ],
  pages: [
    {
      label: "Redirect",
      path: "/gm-admin/redirect",
      page: "redirect",
      permission: "redirect.read",
      icon: "Link",
      position: 55,
    },
  ],
  migrations: [redirectMigration],
  services: {
    create: (ctx: ConstructorParameters<typeof RedirectService>[0]) =>
      new RedirectService(ctx),
  },
  publicMiddleware: (ctx) => new RedirectService(ctx).middleware(),
  widgets: [
    {
      id: "redirect.active",
      label: "Redirects ativos",
      permission: "redirect.read",
      read: (ctx) =>
        Number(
          ctx.db.sql
            .prepare(
              "SELECT COUNT(*) AS total FROM redirects WHERE status='active'",
            )
            .get()!.total,
        ),
    },
  ],
  api: [
    {
      method: "get",
      path: "/redirect",
      permission: "redirect.read",
      handle: (ctx, req, res) => {
        const input = redirectListSchema.parse(req.query);
        res.json(new RedirectService(ctx).repository.list(input));
      },
    },
    {
      method: "post",
      path: "/redirect",
      permission: "redirect.manage",
      handle: (ctx, req, res) => {
        const input = saveRedirectSchema.parse(req.body);
        if (input.revision)
          throw new AdminError(
            "VALIDATION_ERROR",
            "Um novo redirect não usa revisão anterior.",
          );
        res
          .status(201)
          .json(
            new RedirectService(ctx).save(input.redirect, adminUser(res).id),
          );
      },
    },
    {
      method: "put",
      path: "/redirect/:id",
      permission: "redirect.manage",
      handle: (ctx, req, res) => {
        const input = saveRedirectSchema.parse(req.body);
        if (!input.revision)
          throw new AdminError(
            "VALIDATION_ERROR",
            "Informe a revisão do redirect.",
          );
        res.json(
          new RedirectService(ctx).save(
            input.redirect,
            adminUser(res).id,
            String(req.params.id),
            input.revision,
          ),
        );
      },
    },
    {
      method: "delete",
      path: "/redirect/:id",
      permission: "redirect.manage",
      handle: (ctx, req, res) => {
        const input = z
          .object({ revision: revisionSchema })
          .strict()
          .parse(req.body);
        new RedirectService(ctx).remove(
          String(req.params.id),
          input.revision,
          adminUser(res).id,
        );
        res.json({ ok: true });
      },
    },
  ],
};
