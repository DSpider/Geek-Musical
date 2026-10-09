import type { ReactNode } from "react";
import { SiteHeader } from "../SiteHeader.js";
import { SiteFooter } from "../SiteFooter.js";
import type {
  Breadcrumb,
  Category,
  Cta,
  PostSummary,
} from "../../../server/content/schema.js";

export function BlogShell({
  children,
  preview,
}: {
  children: ReactNode;
  preview: boolean;
}) {
  return (
    <>
      <a className="skip-link" href="#page-content">
        Ir para o conteúdo
      </a>
      <SiteHeader editorial />
      {preview && (
        <div className="editorial-preview" role="note">
          Prévia editorial · acesso restrito
        </div>
      )}
      <main id="page-content" className="blog-page page-width">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav className="blog-breadcrumbs" aria-label="Caminho de navegação">
      <ol>
        {items.map((item, index) => (
          <li key={item.url}>
            {index === items.length - 1 ? (
              <span aria-current="page">{item.label}</span>
            ) : (
              <a href={item.url}>{item.label}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function CategoryNavigation({ categories }: { categories: Category[] }) {
  return (
    <nav className="blog-categories" aria-label="Categorias do blog">
      {categories.map((category) => (
        <a key={category.id} href={`/blog/${category.slug}/`}>
          {category.name}
        </a>
      ))}
    </nav>
  );
}
export function PostCard({
  post,
  category,
  featured = false,
}: {
  post: PostSummary;
  category: Category;
  featured?: boolean;
}) {
  return (
    <article className={`blog-card${featured ? " blog-card-featured" : ""}`}>
      <div className="blog-card-meta">
        <span>{category.name}</span>
        <span>{post.readingMinutes} min de leitura</span>
      </div>
      <h3>
        <a href={post.url}>{post.title}</a>
      </h3>
      <p>{post.excerpt}</p>
      <a className="blog-card-link" href={post.url}>
        Ler {post.kind === "pillar" ? "guia completo" : "artigo"}
        <span aria-hidden="true"> ↗</span>
      </a>
    </article>
  );
}
export function BlogCTA({ cta, text }: { cta: Cta; text?: string }) {
  return (
    <aside
      className="blog-cta"
      aria-label="Encontre opções para sua necessidade"
    >
      <div>
        <span className="eyebrow">CONTINUE EXPLORANDO</span>
        <h2>Mais música, mais conhecimento</h2>
        <p>{text || cta.text}</p>
      </div>
      <a className="search-submit" href="/blog/" data-analytics-cta={cta.id}>
        {cta.label}
        <span aria-hidden="true"> ↗</span>
      </a>
    </aside>
  );
}
export function Pagination({
  base,
  page,
  pages,
  parameter = "page",
  anchor = "",
}: {
  base: string;
  page: number;
  pages: number;
  parameter?: string;
  anchor?: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="blog-pagination" aria-label="Paginação">
      {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
        <a
          key={number}
          href={`${base}${number === 1 ? "" : `${base.includes("?") ? "&" : "?"}${parameter}=${number}`}${anchor}`}
          aria-current={page === number ? "page" : undefined}
        >
          Página {number}
        </a>
      ))}
    </nav>
  );
}
