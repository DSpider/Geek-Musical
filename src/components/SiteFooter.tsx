import { ArrowUpRight, Camera, Link, Mail, Send, Play } from "lucide-react";

import { pages, site } from "../../shared/site.js";

import { BrandLogo } from "./BrandLogo.js";

const icons = [Play, Camera, Send, Link];

const footerPages = [
  "/blog/",

  "/sobre/",

  "/contato/",

  "/affiliate-disclosure/",

  "/mapa-do-site/",

  "/politica-de-privacidade/",

  "/termos-de-uso/",
];

export function SiteFooter() {
  return (
    <footer className="site-footer page-width">
      <div className="footer-main">
        <div className="footer-identity">
          <a
            className="footer-logo"

            href="/"

            aria-label="Geek Musical — início"
          >
            <BrandLogo />
          </a>

          <p>Tudo sobre música você encontra aqui</p>

          <nav
            className="social-links"

            aria-label="Redes sociais do Geek Musical"
          >
            {site.social.map((social, index) => {
              const Icon = icons[index];

              return (
                <a
                  key={social.name}

                  href={social.url}

                  target="_blank"

                  rel="noopener noreferrer"

                  aria-label={`${social.name} — abre em nova aba`}

                  title={social.name}
                >
                  <Icon size={20} />
                </a>
              );
            })}
          </nav>
        </div>

        <nav className="footer-nav" aria-label="Informações institucionais">
          <strong>Conheça o Geek Musical</strong>

          {footerPages.map((path) => (
            <a key={path} href={path}>
              {pages[path].label}

              <ArrowUpRight size={14} />
            </a>
          ))}
        </nav>

        <address className="footer-company">
          <strong>{site.company}</strong>

          {site.cnpj && <span>CNPJ {site.cnpj}</span>}

          <span>{site.location}</span>

          <span className="contact-label">Fale conosco</span>

          <a href={`mailto:${site.email}`}>
            <Mail size={17} />

            {site.email}
          </a>
        </address>
      </div>

      <div className="footer-disclosure">
        <p>
          Podemos receber comissão pelas compras realizadas nos links, sem custo
          adicional para você. Como associado da Amazon, ganhamos com compras
          qualificadas.
        </p>

        <span>© {new Date().getFullYear()} Geek Musical.</span>

        <button
          type="button"

          className="cookie-preferences-link"

          data-cookie-preferences
        >
          Preferências de cookies
        </button>
      </div>
    </footer>
  );
}
