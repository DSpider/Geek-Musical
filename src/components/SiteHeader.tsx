import { ArrowUpRight, Search } from "lucide-react";
import { ThemeControl } from "./ThemeControl.js";
import { BrandLogo } from "./BrandLogo.js";
interface Props {
  onReset?: () => void;
  onHow?: () => void;
  searched?: boolean;
  editorial?: boolean;
}
export function SiteHeader({ onReset, onHow, searched, editorial }: Props) {
  return (
    <header className={`site-header${editorial ? " editorial-header" : ""}`}>
      <div className="header-inner">
        <a
          className="brand"
          href="/"
          onClick={
            onReset
              ? (event) => {
                  event.preventDefault();
                  onReset();
                }
              : undefined
          }
          aria-label="Geek Musical — início"
        >
          <BrandLogo />
        </a>
        <nav aria-label="Navegação principal">
          <a
            className="nav-explore"
            href={onReset ? "#explorar" : "/#explorar"}
            onClick={() => {
              if (searched) onReset?.();
            }}
          >
            Explorar
          </a>
          {onHow ? (
            <button onClick={onHow}>
              Sobre o portal <ArrowUpRight size={14} />
            </button>
          ) : (
            <a className="nav-how" href="/sobre/">
              Sobre o portal
            </a>
          )}
          <a
            className="nav-blog"
            href="/blog/"
            aria-current={editorial ? "page" : undefined}
          >
            Blog
          </a>
        </nav>
        <div className="header-tools">
          <form
            className="header-blog-search"
            action="/blog/busca/"
            method="get"
            role="search"
            aria-label="Buscar artigos no blog"
          >
            <label className="sr-only" htmlFor="header-blog-query">
              Buscar artigos no blog
            </label>
            <input
              id="header-blog-query"
              name="q"
              type="search"
              placeholder="Buscar no blog"
              maxLength={120}
            />
            <button type="submit" aria-label="Buscar artigos no blog">
              <Search size={18} />
            </button>
          </form>
          <div {...(editorial ? { "data-theme-island": "" } : {})}>
            <ThemeControl />
          </div>
        </div>
      </div>
    </header>
  );
}
