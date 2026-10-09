import { ArrowUpRight, Clock3 } from "lucide-react";
import type { HomePostCard } from "../../shared/home.js";
import type { HomeGridContent } from "../../shared/home-editor.js";
import { CategoryArt } from "./CategoryArt.js";

export function readHomePostCards(): HomePostCard[] {
  try {
    const cards: unknown = JSON.parse(
      document.getElementById("gm-home-content")?.textContent || "[]",
    );
    if (!Array.isArray(cards)) return [];
    return cards
      .filter(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          typeof c.category === "string" &&
          typeof c.url === "string" &&
          /^\/[a-z0-9/-]+\/$/.test(c.url),
      )
      .slice(0, 6);
  } catch {
    return [];
  }
}
export function readHomeGrids(): HomeGridContent[] {
  try {
    const value: unknown = JSON.parse(
      document.getElementById("gm-home-layout")?.textContent || "null",
    );
    if (Array.isArray(value))
      return value.filter(
        (g) =>
          g &&
          typeof g.id === "string" &&
          typeof g.title === "string" &&
          Number.isInteger(g.columns) &&
          g.columns >= 1 &&
          g.columns <= 4 &&
          Array.isArray(g.cards),
      );
  } catch {
    /* Fall back to the previous six-card payload. */
  }
  return [
    {
      id: "principal",
      title: "Sua próxima escolha começa aqui",
      eyebrow: "ENTENDA ANTES DE COMPRAR",
      columns: 3,
      rows: 2,
      cards: readHomePostCards(),
    },
  ];
}
export function HomeBlogGrids({ grids }: { grids: HomeGridContent[] }) {
  return (
    <>
      {grids.map((grid) => (
        <HomeBlogCards key={grid.id} cards={grid.cards} grid={grid} />
      ))}
    </>
  );
}
export function HomeBlogCards({
  cards,
  grid,
}: {
  cards: HomePostCard[];
  grid?: HomeGridContent;
}) {
  if (!cards.length) return null;
  return (
    <section
      className="home-posts page-width"
      aria-labelledby={`home-posts-${grid?.id ?? "principal"}-title`}
    >
      <div className="section-heading">
        <div>
          {(!grid || grid.eyebrow) && (
            <span className="eyebrow">
              {grid?.eyebrow ?? "ENTENDA ANTES DE COMPRAR"}
            </span>
          )}
          <h2 id={`home-posts-${grid?.id ?? "principal"}-title`}>
            {grid?.title ?? "Sua próxima escolha começa aqui"}
          </h2>
        </div>
        <a className="home-posts-all" href="/blog/">
          Explorar o blog <ArrowUpRight size={17} />
        </a>
      </div>
      <div
        className={`home-posts-grid home-posts-columns-${grid?.columns ?? 3}`}
      >
        {cards.map((post) => (
          <a className="home-post-card" href={post.url} key={post.id}>
            <div className="home-post-image">
              {post.image ? (
                <img
                  src={post.image.url}
                  alt={post.image.alt}
                  loading="lazy"
                  width="600"
                  height="360"
                />
              ) : (
                <CategoryArt kind={post.art} />
              )}
              <span className="home-post-category">{post.category}</span>
            </div>
            <div className="home-post-copy">
              <h3>{post.title}</h3>
              {post.excerpt && <p>{post.excerpt}</p>}
              <div className="home-post-bottom">
                <span>
                  <Clock3 size={14} />
                  {post.readingMinutes} min de leitura
                </span>
                <span className="home-post-read">
                  Ler artigo <ArrowUpRight size={16} />
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
