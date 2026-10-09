import { randomUUID } from "node:crypto";
import type { AdminUser } from "../../shared/admin.js";
import type { Post, Category, EditorialProduct } from "./schema.js";
import { postUrl, categoryUrl } from "./catalog.js";
import { ContentRepository, type ContentState } from "./repository.js";
import { AdminError } from "../admin/errors.js";
import { can } from "../admin/auth.js";
import { references } from "./markdown.js";
export const editorialDate = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export function preserveUrls(before: ContentState, after: ContentState) {
  const remap = (from: string, to: string, published: boolean) => {
    if (from === to) return;
    for (const [key, value] of Object.entries(after.registries.redirects)) {
      if (key === to) delete after.registries.redirects[key];
      else if (value === from) after.registries.redirects[key] = to;
    }
    if (published) after.registries.redirects[from] = to;
  };
  for (const old of before.posts) {
    const updated = after.posts.find((p) => p.id === old.id);
    const from = postUrl(old, before.registries);
    if (!updated) {
      for (const [key, value] of Object.entries(after.registries.redirects))
        if (value === from) delete after.registries.redirects[key];
      continue;
    }
    const to = postUrl(updated, after.registries);
    remap(from, to, old.status === "published");
  }
  for (const old of before.registries.categories) {
    const published = before.posts.find(
      (post) => post.categoryId === old.id && post.status === "published",
    );
    const replacementPost =
      published && after.posts.find((post) => post.id === published.id);
    const updated =
      after.registries.categories.find((category) => category.id === old.id) ??
      (replacementPost &&
        after.registries.categories.find(
          (category) => category.id === replacementPost.categoryId,
        ));
    const from = categoryUrl(old.slug);
    if (updated) remap(from, categoryUrl(updated.slug), !!published);
    else
      for (const [key, value] of Object.entries(after.registries.redirects))
        if (value === from) delete after.registries.redirects[key];
  }
}
export function newPost(content: ContentRepository) {
  const state = content.snapshot();
  const category =
    state.registries.categories.find((c) => c.status === "active") ||
    state.registries.categories[0];
  const author = state.registries.authors[0];
  return {
    id: "POST-" + randomUUID(),
    title: "",
    slug: "",
    excerpt: "",
    categoryId: category?.id || "",
    kind: "supporting" as const,
    status: "draft" as const,
    authorId: author?.id || "",
    createdAt: editorialDate(),
    updatedAt: editorialDate(),
    seoTitle: "",
    seoDescription: "",
    relatedPostIds: category?.pillarPostId ? [category.pillarPostId] : [],
    ctaKey: category?.ctaKey || "",
    sources: [],
    body: "",
  };
}
export function savePost(
  content: ContentRepository,
  user: AdminUser,
  revision: string,
  post: Post,
  approve: boolean,
  creating: boolean,
  products: EditorialProduct[] = [],
) {
  const exists = content.snapshot().posts.find((p) => p.id === post.id);
  if (creating && exists) throw new AdminError("CONFLICT", "ID já utilizado.");
  if (!creating && !exists)
    throw new AdminError("NOT_FOUND", "Artigo não encontrado.");
  if (
    (post.status === "published" || exists?.status === "published") &&
    !can(user, "posts.publish")
  )
    throw new AdminError(
      "FORBIDDEN",
      "Alterar artigos publicados exige permissão de publicação.",
    );
  if (post.status === "published" && !approve)
    throw new AdminError(
      "VALIDATION_ERROR",
      "Confirme a revisão editorial antes de publicar ou atualizar um artigo publicado.",
    );
  const updated: Post = {
    ...post,
    createdAt: exists?.createdAt || editorialDate(),
    updatedAt: editorialDate(),
  };
  if (updated.status === "published")
    updated.publishedAt = exists?.publishedAt || editorialDate();
  else delete updated.publishedAt;
  content.commit(
    revision,
    user.id,
    creating
      ? "CREATE_POST"
      : post.status !== exists!.status
        ? "CHANGE_POST_STATUS"
        : "UPDATE_POST",
    "posts",
    post.id,
    (state) => {
      const before = structuredClone(state);
      const attached = new Set(updated.productIds || []);
      if (
        new Set(products.map((p) => p.id)).size !== products.length ||
        products.some((p) => !attached.has(p.id))
      )
        throw new AdminError(
          "VALIDATION_ERROR",
          "Edite somente produtos associados a este artigo.",
        );
      const affectedPublished = state.posts.some(
        (p) =>
          p.status === "published" &&
          p.productIds?.some((id) =>
            products.some((product) => product.id === id),
          ),
      );
      if (
        products.length &&
        affectedPublished &&
        (!can(user, "posts.publish") || !approve)
      )
        throw new AdminError(
          "FORBIDDEN",
          "Produtos compartilhados com artigos publicados exigem revisão e aprovação de publicação.",
        );
      state.registries.products ||= [];
      for (const product of products) {
        const index = state.registries.products.findIndex(
          (p) => p.id === product.id,
        );
        if (index < 0) state.registries.products.push(product);
        else state.registries.products[index] = product;
      }
      const category = state.registries.categories.find(
        (c) => c.id === updated.categoryId,
      );
      if (!category)
        throw new AdminError("VALIDATION_ERROR", "Categoria inexistente.");
      if (updated.status === "published" && category.status !== "active")
        throw new AdminError(
          "CONFLICT",
          "Ative a categoria antes de publicar.",
        );
      if (updated.kind === "supporting" && category.pillarPostId)
        updated.relatedPostIds = [
          ...new Set([...updated.relatedPostIds, category.pillarPostId]),
        ].filter((id) => id !== updated.id);
      if (exists)
        state.posts[state.posts.findIndex((p) => p.id === post.id)] = updated;
      else state.posts.push(updated);
      if (updated.kind === "pillar" && !category.pillarPostId)
        category.pillarPostId = updated.id;
      preserveUrls(before, state);
    },
  );
  return updated;
}
export function deletePost(
  content: ContentRepository,
  user: AdminUser,
  revision: string,
  id: string,
) {
  content.commit(revision, user.id, "DELETE_POST", "posts", id, (state) => {
    const existing = state.posts.find((p) => p.id === id);
    if (!existing) throw new AdminError("NOT_FOUND", "Artigo não encontrado.");
    if (existing.status === "published" && !can(user, "posts.publish"))
      throw new AdminError(
        "FORBIDDEN",
        "Excluir artigo publicado exige permissão de publicação.",
      );
    if (state.registries.categories.some((c) => c.pillarPostId === id))
      throw new AdminError(
        "CONFLICT",
        "Este é um guia central. Escolha outro guia na categoria antes de excluir.",
      );
    const linked = state.posts.filter(
      (p) =>
        p.id !== id &&
        (p.relatedPostIds.includes(id) ||
          references(p.body, p).posts.includes(id)),
    );
    if (linked.length)
      throw new AdminError(
        "CONFLICT",
        `Remova primeiro os links recebidos de: ${linked.map((p) => p.id).join(", ")}.`,
      );
    const before = structuredClone(state);
    state.posts = state.posts.filter((p) => p.id !== id);
    preserveUrls(before, state);
  });
}
export function changePostStatuses(
  content: ContentRepository,
  user: AdminUser,
  revision: string,
  ids: string[],
  status: "draft" | "archived",
) {
  content.commit(
    revision,
    user.id,
    "BULK_POST_STATUS",
    "posts",
    ids.join(","),
    (state) => {
      const posts = ids.map((id) => state.posts.find((post) => post.id === id));
      if (posts.some((post) => !post))
        throw new AdminError(
          "NOT_FOUND",
          "Um dos artigos não existe. Nenhuma alteração foi aplicada.",
        );
      if (
        posts.some((post) => post!.status === "published") &&
        !can(user, "posts.publish")
      )
        throw new AdminError(
          "FORBIDDEN",
          "Alterar artigos publicados exige permissão de publicação.",
        );
      for (const post of posts) {
        if (post!.status === status) continue;
        post!.status = status;
        post!.updatedAt = editorialDate();
        delete post!.publishedAt;
      }
    },
  );
}
export function saveCategory(
  content: ContentRepository,
  user: AdminUser,
  revision: string,
  category: Category,
  creating: boolean,
) {
  content.commit(
    revision,
    user.id,
    creating ? "CREATE_CATEGORY" : "UPDATE_CATEGORY",
    "categories",
    category.id,
    (state) => {
      const before = structuredClone(state);
      const index = state.registries.categories.findIndex(
        (c) => c.id === category.id,
      );
      if (creating && index >= 0)
        throw new AdminError("CONFLICT", "ID já utilizado.");
      if (!creating && index < 0)
        throw new AdminError("NOT_FOUND", "Categoria não encontrada.");
      if (category.pillarPostId) {
        const pillar = state.posts.find(
          (p) => p.id === category.pillarPostId && p.categoryId === category.id,
        );
        if (!pillar)
          throw new AdminError(
            "VALIDATION_ERROR",
            "O guia central precisa pertencer a esta categoria.",
          );
        for (const post of state.posts.filter(
          (p) => p.categoryId === category.id,
        )) {
          const previous = JSON.stringify(post);
          if (post.kind !== "legacy")
            post.kind = post.id === pillar.id ? "pillar" : "supporting";
          post.relatedPostIds = [
            ...new Set([
              ...post.relatedPostIds,
              ...(post.id !== pillar.id ? [pillar.id] : []),
            ]),
          ].filter((id) => id !== post.id);
          if (previous !== JSON.stringify(post))
            post.updatedAt = editorialDate();
        }
      } else if (
        state.posts.some(
          (p) => p.categoryId === category.id && p.kind === "pillar",
        )
      )
        throw new AdminError(
          "CONFLICT",
          "Selecione o guia central existente ou um substituto.",
        );
      if (index >= 0) state.registries.categories[index] = category;
      else state.registries.categories.push(category);
      preserveUrls(before, state);
    },
  );
}
export function deleteCategory(
  content: ContentRepository,
  user: AdminUser,
  revision: string,
  id: string,
  reassignTo?: string,
) {
  content.commit(
    revision,
    user.id,
    "DELETE_CATEGORY",
    "categories",
    id,
    (state) => {
      if (!state.registries.categories.some((c) => c.id === id))
        throw new AdminError("NOT_FOUND", "Categoria não encontrada.");
      const before = structuredClone(state);
      const posts = state.posts.filter((p) => p.categoryId === id);
      if (posts.length) {
        const target = state.registries.categories.find(
          (c) => c.id === reassignTo && c.id !== id,
        );
        if (!target)
          throw new AdminError(
            "CONFLICT",
            "Selecione uma categoria de destino para os artigos antes de excluir.",
          );
        if (!target.pillarPostId)
          target.pillarPostId = posts.find((p) => p.kind === "pillar")?.id;
        for (const post of posts) {
          post.categoryId = target.id;
          post.updatedAt = editorialDate();
          if (post.kind !== "legacy")
            post.kind =
              post.id === target.pillarPostId ? "pillar" : "supporting";
          if (target.pillarPostId && post.id !== target.pillarPostId)
            post.relatedPostIds = [
              ...new Set([...post.relatedPostIds, target.pillarPostId]),
            ];
        }
        if (target.pillarPostId)
          for (const post of state.posts.filter(
            (p) => p.categoryId === target.id && p.id !== target.pillarPostId,
          )) {
            if (!post.relatedPostIds.includes(target.pillarPostId)) {
              post.relatedPostIds.push(target.pillarPostId);
              post.updatedAt = editorialDate();
            }
          }
      }
      state.registries.categories = state.registries.categories.filter(
        (c) => c.id !== id,
      );
      preserveUrls(before, state);
    },
  );
}
