import type { Post } from "./schema.js";

// Applies to reader-facing copy, not provenance, offer methods or source URLs.
export function assertConsumerArticle(post: Post) {
  // Historical wording is preserved during import; new writing follows our policy.
  if (post.kind === "legacy") return;
  const visible = [
    post.title,
    post.excerpt,
    post.seoTitle,
    post.seoDescription,
    post.ctaText,
    post.coverImage?.alt,
    post.coverImage?.credit,
    ...post.sources.map((source) => source.title),
    ...(post.media ?? []).map((media) => media.alt),
    post.body.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"),
  ]
    .filter(Boolean)
    .join("\n");
  assertConsumerText(visible, post.id);
}

export function assertConsumerText(value: string, id: string) {
  const visible = value.normalize("NFKD").replace(/\p{M}/gu, "");
  const forbidden = [
    /\bAPIs?\b|\bbackend\b|\bfrontend\b|\bendpoint\b|\bscraping\b|\bwebscrap\w*\b/i,
    /gerador oficial|conversao (?:do|de) links?|(?:destino|link|pagina).{0,100}(?:rejeitad|aceit[oa] pelo (?:programa|gerador))/i,
    /\bestoque\b|preco historico|promessa de disponibilidade/i,
    /sem custo adicional para voce/i,
    /(?:esta|nesta|a) revisao.{0,100}(?:retir|remove|substitu|nao mede|nao confirma)|sem testes proprios|nao (?:testamos|fizemos medicoes)|modelos herdados/i,
  ];
  if (forbidden.some((pattern) => pattern.test(visible)))
    throw new Error(
      `Linguagem editorial inválida: ${id}. Escreva para quem escolhe o produto; remova detalhes de implementação e avisos comerciais repetidos.`,
    );
}
