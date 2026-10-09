import { readFile, writeFile, readdir } from "node:fs/promises";
import { categorySchema, registriesSchema } from "../server/content/schema.js";
const [kind, id, slug, categoryId] = process.argv.slice(2);
const registries = registriesSchema.parse({
  categories: JSON.parse(await readFile("content/categories.json", "utf8")),
  authors: JSON.parse(await readFile("content/authors.json", "utf8")),
  ctas: JSON.parse(await readFile("content/ctas.json", "utf8")),
  redirects: JSON.parse(await readFile("content/redirects.json", "utf8")),
});
const posts = await Promise.all(
  (await readdir("content/blog"))
    .filter((p) => p.endsWith(".md"))
    .map(async (p) => {
      const text = (await readFile(`content/blog/${p}`, "utf8")).replaceAll(
        "\r\n",
        "\n",
      );
      return JSON.parse(text.match(/^---\n([\s\S]*?)\n---/)![1]) as {
        id: string;
        slug: string;
      };
    }),
);
const source = { registries, posts };
const valid = (value?: string) =>
  !!value && /^[a-zA-Z][a-zA-Z0-9-]*$/.test(value);
if (
  !valid(id) ||
  !valid(slug) ||
  !/^[a-z0-9-]+$/.test(slug || "") ||
  !["post", "category"].includes(kind)
)
  throw new Error(
    "Uso: npm run content:new -- post ID slug categoryId | category id slug pillarPostId",
  );
if (kind === "post") {
  const category = source.registries.categories.find(
    (c) => c.id === categoryId,
  );
  if (!category || source.posts.some((p) => p.id === id || p.slug === slug))
    throw new Error("Categoria inválida ou ID/slug já existe.");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const template = await readFile("docs/templates/post.md", "utf8");
  const metadata = {
    id,
    slug,
    categoryId,
    title: "Título descritivo a definir",
    excerpt: "Descreva a resposta e a decisão que este artigo ajuda a tomar.",
    kind: category.pillarPostId === id ? "pillar" : "supporting",
    status: "draft",
    authorId: source.registries.authors[0].id,
    createdAt: today,
    updatedAt: today,
    seoTitle: "Título descritivo a definir",
    seoDescription:
      "Explique de forma específica a utilidade deste guia para quem pretende escolher um produto.",
    relatedPostIds: category.pillarPostId === id ? [] : [category.pillarPostId],
    ctaKey: category.ctaKey,
    sources: [],
  };
  await writeFile(
    `content/blog/${slug}.md`,
    `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${template}`,
    { flag: "wx" },
  );
  console.log(
    "Rascunho criado. Complete texto, fontes e metadados antes de content:validate; não altere o status sem revisão.",
  );
} else {
  if (!valid(categoryId))
    throw new Error(
      "Informe o ID de um guia central real ou a criar junto com a categoria.",
    );
  if (source.registries.categories.some((c) => c.id === id || c.slug === slug))
    throw new Error("Categoria já existe.");
  const ctaKey = source.registries.ctas[0].id;
  const category = categorySchema.parse({
    id,
    slug,
    name: "Nome a definir",
    description:
      "Descreva exclusivamente a necessidade atendida pelos guias desta categoria e as decisões de compra que ela organiza.",
    seoTitle: "Guias da categoria a definir",
    seoDescription:
      "Descreva os critérios que os guias desta categoria ajudam a avaliar antes de escolher um produto.",
    pillarPostId: categoryId,
    ctaKey,
  });
  await writeFile(
    "content/categories.json",
    JSON.stringify([...source.registries.categories, category], null, 2) + "\n",
  );
  console.log(
    "Categoria criada. Cadastre o guia central e personalize metadados/CTA antes da validação e build.",
  );
}
