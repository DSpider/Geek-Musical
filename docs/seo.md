# SEO editorial

Preservar `/<slug>/`, título, autoria e datas originais. Atualizações não mudam a publicação; anos, alegações de testes e especificações não são atualizados automaticamente. Canonical sempre aponta ao domínio `https://www.geekmusical.com.br`, sem parâmetros de busca ou tracking.

HTML público renderizado no servidor, com um H1, metadados, breadcrumbs e Article/BlogPosting coerentes com dados reais. Não atribuir estrelas, avaliações de clientes, experiência prática ou preço ao schema sem evidência. DEV e interfaces administrativas permanecem em noindex. Rascunhos não entram nas páginas, busca, feeds ou sitemaps públicos da aplicação.

`/sitemap.xml` agrega os sitemaps da aplicação e os legados de Stories e autores. Preservar `/sitemap_index.xml`, `/post-sitemap.xml`, `/page-sitemap.xml` e `/category-sitemap.xml`. Categorias editoriais são exibidas em `/blog/<categoria>/`; só criar 301 quando a categoria tiver destino equivalente. Autores, tags, feeds e categorias vazias permanecem no WordPress.

Validar canonicals, links internos, âncoras, busca editorial, paginação, páginas órfãs e duplicações com os scripts de checks e com HTTP após deploy. Tracking, disponibilidade e identidade do produto são estados independentes. CTAs usam `rel="sponsored noopener noreferrer"` e não apresentam preço sem verificação. Destino comprovadamente incorreto é suspenso até revisão, sem trocar o produto.
