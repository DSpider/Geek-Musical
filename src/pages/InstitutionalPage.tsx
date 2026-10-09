import { ArrowRight } from "lucide-react";
import { institutional } from "../../shared/institutional.js";
import { notFoundPage, pages, site } from "../../shared/site.js";
import { SiteFooter } from "../components/SiteFooter.js";
import { SiteHeader } from "../components/SiteHeader.js";

export default function InstitutionalPage({ pathname }: { pathname: string }) {
  const content = institutional[pathname];
  const page = pages[pathname] || notFoundPage;
  return (
    <>
      <a className="skip-link" href="#page-content">
        Ir para o conteúdo
      </a>
      <SiteHeader editorial />
      <main id="page-content" className="document-page page-width">
        <div className="document-heading">
          <span className="eyebrow">
            {content?.eyebrow || "VAMOS RECOMEÇAR?"}
          </span>
          <h1>{page.label}</h1>
          <p className="document-intro">{content?.intro || page.description}</p>
          {content && (
            <p className="document-updated">
              Atualizado em{" "}
              <time dateTime={site.updatedAt}>8 de outubro de 2026</time>
            </p>
          )}
        </div>
        {content ? (
          <div className="document-layout">
            <nav className="document-toc" aria-label="Nesta página">
              <strong>Nesta página</strong>
              {content.sections.map((section, index) => (
                <a key={section.title} href={`#secao-${index + 1}`}>
                  {section.title}
                </a>
              ))}
            </nav>
            <article className="document-body" aria-label={page.label}>
              {content.sections.map((section, index) => (
                <section key={section.title} id={`secao-${index + 1}`}>
                  <h2>{section.title}</h2>
                  {section.paragraphs.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                  {section.bullets && (
                    <ul>
                      {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {section.links && (
                    <ul className="document-links">
                      {section.links.map((link) => (
                        <li key={link.href}>
                          <a
                            href={link.href}
                            {...(link.href.startsWith("https:")
                              ? { target: "_blank", rel: "noopener noreferrer" }
                              : {})}
                          >
                            {link.label}
                            <ArrowRight size={16} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
              <aside className="document-contact">
                <strong>Podemos ajudar?</strong>
                <p>
                  Fale com a equipe em{" "}
                  <a href={`mailto:${site.email}`}>{site.email}</a>.
                </p>
              </aside>
            </article>
          </div>
        ) : (
          <a className="search-submit" href="/">
            Explorar artigos musicais
            <ArrowRight size={18} />
          </a>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
