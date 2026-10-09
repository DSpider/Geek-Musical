import type { ContentCatalog } from "../../server/content/catalog.js";
import type { HomeGridContent } from "../../shared/home-editor.js";
import { SiteHeader } from "./SiteHeader.js";
import { SiteFooter } from "./SiteFooter.js";
import { HomeBlogGrids } from "./HomeBlogCards.js";
import { Music2, ArrowUpRight } from "lucide-react";

export function EditorialHome({
  catalog,
  grids,
}: {
  catalog: ContentCatalog;
  grids: HomeGridContent[];
}) {
  const categories = catalog
    .listCategories()
    .filter((category) =>
      catalog.summaries.some((post) =>
        (catalog.getPost(post.id)?.categoryIds || [post.categoryId]).includes(
          category.id,
        ),
      ),
    );
  return (
    <>
      <SiteHeader editorial />
      <main id="conteudo">
        <section className="musical-hero page-width">
          <span className="eyebrow">
            <Music2 size={17} /> MÚSICA, INSTRUMENTOS E CONHECIMENTO
          </span>
          <h1>
            O que você
            <br />
            está <span className="musical-hero-gradient">procurando</span>?
          </h1>
          <p>
            Encontre seu ritmo. Explore instrumentos, equipamentos e guias para
            aprender, criar e fazer boas escolhas.
          </p>
          <a className="musical-hero-link" href="/blog/">
            Explore nossos artigos <ArrowUpRight size={18} />
          </a>
        </section>
        <section
          className="musical-categories page-width"
          id="explorar"
          aria-labelledby="musical-categories-title"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">EXPLORE POR ASSUNTO</span>
              <h2 id="musical-categories-title">
                A música começa pela sua curiosidade
              </h2>
            </div>
          </div>
          <nav
            className="musical-category-grid"
            aria-label="Categorias musicais"
          >
            {categories.map((category) => (
              <a
                href={`/blog/${category.slug}/`}
                className="musical-category"
                key={category.id}
              >
                <Music2 aria-hidden size={22} />
                <span>{category.name}</span>
                <ArrowUpRight aria-hidden size={18} />
              </a>
            ))}
          </nav>
        </section>
        <HomeBlogGrids grids={grids} />
        <section className="musical-about page-width">
          <span className="eyebrow">GEEK MUSICAL</span>
          <h2>Mais informação para a sua jornada musical</h2>
          <p>
            Reviews, rankings, guias de compra e aprendizado musical. Conheça os
            recursos, as diferenças e as possibilidades de cada instrumento.
          </p>
          <a href="/sobre/">
            Conheça o portal <ArrowUpRight size={16} />
          </a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
