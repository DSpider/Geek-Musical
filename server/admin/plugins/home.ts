import { z } from "zod";
import {
  homeLayoutSchema,
  defaultHomeLayout,
  validateMusicalHome,
  type HomeLayout,
} from "../../../shared/home-editor.js";
import { revisionSchema } from "../../../shared/admin.js";
import {
  homeGrids,
  homePostCard,
  homePostCards,
} from "../../content/discovery.js";
import { homePopularity } from "../../content/home-popularity.js";
import { adminUser } from "../auth.js";
import { AdminError } from "../errors.js";
import type { AdminPluginDefinition, PluginContext } from "../registry.js";

function read(ctx: PluginContext) {
  const catalog = ctx.content.catalog(false);
  const layout =
    ctx.settings.get<HomeLayout | null>("home.layout") ??
    defaultHomeLayout(homePostCards(catalog));
  const { views, ...popularity } = homePopularity(ctx.db);
  popularity.available = catalog.summaries.some((p) => (views[p.url] || 0) > 0);
  return {
    layout,
    categories: catalog.registries.categories
      .filter((c) => c.status !== "inactive")
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    popularity,
    resolvedGrids: homeGrids(catalog, layout, { ...popularity, views }),
    revision: ctx.settings.revision("home"),
    posts: catalog.summaries
      .map((p) => homePostCard(catalog, p.id))
      .filter((p) => !!p)
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR")),
    environment: ctx.web.environment,
  };
}
export const homePlugin: AdminPluginDefinition = {
  id: "home",
  name: "Editor da Home",
  description: "Grades de artigos e ordem dos posts na página inicial.",
  version: "1.1.0",
  required: true,
  permissions: [{ id: "home.manage", roles: ["admin"] }],
  pages: [
    {
      label: "Editor da Home",
      path: "/gm-admin/home",
      page: "home",
      permission: "home.manage",
      icon: "LayoutDashboard",
      position: 25,
    },
  ],
  settings: [
    {
      key: "home.layout",
      schema: homeLayoutSchema.nullable(),
      defaultValue: null,
    },
  ],
  api: [
    {
      method: "get",
      path: "/home",
      permission: "home.manage",
      handle: (ctx, _req, res) => {
        ctx.content.refresh();
        res.json(read(ctx));
      },
    },
    {
      method: "put",
      path: "/home",
      permission: "home.manage",
      handle: (ctx, req, res) => {
        const input = z
          .object({ layout: homeLayoutSchema, revision: revisionSchema })
          .strict()
          .parse(req.body);
        ctx.content.refresh();
        const catalog = ctx.content.catalog(false);
        for (const grid of input.layout.grids) {
          if (
            grid.mode === "category" &&
            !catalog.registries.categories.some(
              (c) => c.id === grid.categoryId && c.status !== "inactive",
            )
          )
            throw new AdminError(
              "VALIDATION_ERROR",
              "Selecione uma categoria ativa. Recarregue a página para atualizar a lista.",
            );
          for (const id of grid.postIds)
            if (!homePostCard(catalog, id))
              throw new AdminError(
                "VALIDATION_ERROR",
                "Selecione somente posts publicados em categorias ativas. Recarregue a página para atualizar a lista.",
              );
        }
        try {
          validateMusicalHome(
            input.layout,
            new Set(
              catalog.summaries
                .filter((p) => !!homePostCard(catalog, p.id))
                .map((p) => p.id),
            ),
          );
        } catch (error) {
          throw new AdminError("VALIDATION_ERROR", (error as Error).message);
        }
        ctx.settings.update(
          "home",
          input.revision,
          { "home.layout": input.layout },
          adminUser(res).id,
        );
        res.json(read(ctx));
      },
    },
  ],
};
