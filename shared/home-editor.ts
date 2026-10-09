import { z } from "zod";
import type { HomePostCard } from "./home.js";

export const homeGridModes = {
  manual: "Grade manual",
  latest: "Últimos posts",
  oldest: "Posts mais antigos",
  popular: "Posts mais vistos",
  category: "Determinada categoria",
} as const;
export type HomeGridMode = keyof typeof homeGridModes;
export interface HomePopularity {
  from: string;
  to: string;
  views: Readonly<Record<string, number>>;
  available: boolean;
  partial: boolean;
}

export const homeGridSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
    title: z.string().trim().min(1).max(120),
    eyebrow: z.string().trim().max(80),
    columns: z.number().int().min(1).max(4),
    rows: z.number().int().min(1).max(6),
    mode: z
      .enum(["manual", "latest", "oldest", "popular", "category"])
      .optional(),
    categoryId: z
      .string()
      .regex(/^[a-zA-Z0-9-]{1,100}$/)
      .optional(),
    postIds: z.array(z.string().regex(/^[a-zA-Z0-9-]{1,100}$/)).max(24),
  })
  .strict()
  .superRefine((grid, ctx) => {
    if (grid.mode && grid.mode !== "manual" && grid.postIds.length)
      ctx.addIssue({
        code: "custom",
        message: "Grades automáticas não aceitam seleção manual de posts.",
        path: ["postIds"],
      });
    if ((grid.mode === "category") !== !!grid.categoryId)
      ctx.addIssue({
        code: "custom",
        message: "Selecione uma categoria somente para a grade por categoria.",
        path: ["categoryId"],
      });
    if (grid.postIds.length > grid.columns * grid.rows)
      ctx.addIssue({
        code: "custom",
        message:
          "A grade não comporta todos os posts. Aumente as linhas ou remova posts.",
        path: ["postIds"],
      });
    if (new Set(grid.postIds).size !== grid.postIds.length)
      ctx.addIssue({
        code: "custom",
        message: "Um post só pode aparecer uma vez em cada grade.",
        path: ["postIds"],
      });
  });
export const homeLayoutSchema = z
  .object({
    version: z.literal(1),
    grids: z.array(homeGridSchema).max(8),
  })
  .strict()
  .superRefine((layout, ctx) => {
    if (new Set(layout.grids.map((g) => g.id)).size !== layout.grids.length)
      ctx.addIssue({
        code: "custom",
        message: "As grades precisam ter IDs únicos.",
        path: ["grids"],
      });
  });
export type HomeGrid = z.infer<typeof homeGridSchema>;
export type HomeLayout = z.infer<typeof homeLayoutSchema>;
export interface HomeGridContent extends Omit<
  HomeGrid,
  "postIds" | "mode" | "categoryId"
> {
  cards: HomePostCard[];
}
export interface HomeEditorData {
  layout: HomeLayout;
  revision: string;
  posts: HomePostCard[];
  environment: string;
  categories: { id: string; name: string }[];
  popularity: Omit<HomePopularity, "views">;
  resolvedGrids: HomeGridContent[];
}
export function defaultHomeLayout(cards: HomePostCard[]): HomeLayout {
  return {
    version: 1,
    grids: [
      {
        id: "destaques",
        title: "Destaques para sua jornada musical",
        eyebrow: "SELEÇÃO EDITORIAL",
        columns: 3,
        rows: 3,
        mode: "manual",
        postIds: cards.slice(0, 9).map((p) => p.id),
      },
      {
        id: "recentes",
        title: "Últimos artigos",
        eyebrow: "DO BLOG",
        columns: 3,
        rows: 1,
        mode: "latest",
        postIds: [],
      },
    ],
  };
}
export function validateMusicalHome(
  layout: HomeLayout,
  publishedIds: ReadonlySet<string>,
) {
  const [featured, latest] = layout.grids;
  if (
    layout.grids.length !== 2 ||
    featured?.id !== "destaques" ||
    latest?.id !== "recentes" ||
    featured.mode !== "manual" ||
    latest.mode !== "latest" ||
    featured.columns !== 3 ||
    featured.rows !== 3 ||
    latest.columns !== 3 ||
    latest.rows !== 1 ||
    latest.postIds.length ||
    featured.categoryId ||
    latest.categoryId
  )
    throw new Error(
      "A Home exige uma grade manual 3×3 e uma grade de três artigos recentes, nesta ordem.",
    );
  const expected = Math.min(9, publishedIds.size);
  if (
    featured.postIds.length !== expected ||
    new Set(featured.postIds).size !== expected ||
    featured.postIds.some((id) => !publishedIds.has(id))
  )
    throw new Error(
      `Selecione ${expected} artigos publicados distintos para os destaques.`,
    );
}

// The same move serves pointer drag/drop and the accessible position controls.
export function moveHomePost(
  layout: HomeLayout,
  fromId: string,
  postId: string,
  toId: string,
  index: number,
): HomeLayout {
  const source = layout.grids.find((g) => g.id === fromId);
  const target = layout.grids.find((g) => g.id === toId);
  if (
    !source?.postIds.includes(postId) ||
    !target ||
    (source.mode && source.mode !== "manual") ||
    (target.mode && target.mode !== "manual")
  )
    return layout;
  if (
    fromId !== toId &&
    (target.postIds.includes(postId) ||
      target.postIds.length >= target.columns * target.rows)
  )
    return layout;
  const grids = layout.grids.map((g) => ({ ...g, postIds: [...g.postIds] }));
  const from = grids.find((g) => g.id === fromId)!;
  const to = grids.find((g) => g.id === toId)!;
  from.postIds.splice(from.postIds.indexOf(postId), 1);
  to.postIds.splice(Math.max(0, Math.min(index, to.postIds.length)), 0, postId);
  return { ...layout, grids };
}

export function moveHomeGrid(
  layout: HomeLayout,
  index: number,
  direction: -1 | 1,
): HomeLayout {
  const target = index + direction;
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= layout.grids.length ||
    target < 0 ||
    target >= layout.grids.length
  )
    return layout;
  const grids = [...layout.grids];
  [grids[index], grids[target]] = [grids[target], grids[index]];
  return { ...layout, grids };
}
