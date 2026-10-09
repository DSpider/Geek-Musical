# Checkpoint da ordem da Home — 09/10/2026

Pedido: colocar o bloco “Explore por assunto / A música começa pela sua curiosidade” abaixo dos artigos, em DEV e PROD.

## Resultado verificado

- `EditorialHome` apresenta a chamada inicial, todas as grades de artigos na ordem salva, as categorias e a apresentação do portal.
- Os 26 links de categoria e a âncora `#explorar` continuam funcionando. A navegação “Explorar” foi conferida no navegador de produção.
- DEV mantém nove destaques e três recentes; produção já tinha três recentes antes dos nove destaques. A configuração salva em produção foi preservada integralmente, confirmada pelo hash do SQLite anterior ao upgrade. Nenhuma grade foi editada para o teste.
- O verificador operacional deixou de exigir a ordem inicial fixa 9+3. Confere limites, IDs únicos, ausência de duplicações na mesma grade, equivalência de títulos e URLs entre payload e HTML e categorias depois das grades.

## Validação

- 72 testes em oito arquivos, typecheck, lint, build, `content:validate`, `links:check`, `seo:check` e `check:secrets` aprovados. Links e SEO: 203 URLs por HTTP; conteúdo: 149 artigos e 29 categorias. Typecheck e lint novamente aprovados após ajustar o verificador operacional.
- DEV conferido em 320, 390, 768 e 1440 pixels, nos dois temas; `scrollWidth` 305/375/753/1425, zero imagens quebradas e categorias após todas as grades em cada largura. Capturas de desktop e celular inspecionadas nos dois temas. [Medições](home-order-dev-visual.json).
- HTML renderizado no servidor de DEV e PROD: 12 cards, 26 categorias, canonical correto e a nova ordem. HTTPS público respondeu 200 e `CF-Cache-Status: DYNAMIC`. [Conferência HTTP](home-order-http.json).
- Inspeção visual da Home pública confirmou artigos logo após a chamada inicial e categorias abaixo da última grade. Capturas locais em `artifacts/home-order-production.jpg` e `artifacts/home-order-categories-after-articles.jpg`.
- Verificação de produção: 203 rotas, 26 redirecionamentos, dez sitemaps, 96 Stories, 689 imagens editoriais, login, cookie seguro e respostas privadas sem cache. [Relatório](../migration/production-verification.json).
- DEV: processo Node PID 33152, escuta `127.0.0.1:3230` e saúde `development`. PROD: serviço e processo ativos após reinício, mesma porta interna e saúde interna/pública `production`.

## Release, backup e preservação

- Release implantada: `d22c7b117e972c5ea272d458be2a9714b672cc0b`, por `deploy/prepare.py --upgrade`. [Release GitHub](https://github.com/DSpider/Geek-Musical/releases/tag/home-order-2026-10-09) com fonte e checksum; SHA-256 do arquivo implantado e do asset GitHub: `8b717fd035abe5c0ee89ee29a0f312e923831e379ce0fbcda4fea64025e2d3cf`.
- Checkpoint `/root/geekmusical-security/home-order-20261009T133058Z`, com cópia externa em `D:/GeekMusical-backups/home-order/home-order-20261009T133058Z`. Backup adicional do upgrade em `/root/geekmusical-security/release-20261009T133746Z`, copiado para `D:/GeekMusical-backups/releases/release-20261009T133746Z`. SQLite íntegro, arquivos editoriais legíveis e checksums iguais nas cópias. ACLs limitadas ao proprietário, Administradores e SYSTEM. [Backup da release](../migration/release-backup.json).
- SQLite, contas, layout, ambiente e migrações preservados; 6.831 arquivos editoriais com hashes idênticos aos do checkpoint. Vhosts e PIDs dos projetos de referência permaneceram iguais. [Conferência de estado](home-order-production.json).

## Rollback

A release anterior permanece em `/opt/geek-musical/releases/ca6c9b4dabd74a8338c0db88a1d2d58d1483f5ea`. O upgrade usa symlink atômico e recuperação automática se a saúde falhar. Para retorno manual, valide esse diretório e a ausência de `current-rollback`, crie o symlink `/opt/geek-musical/current-rollback` apontando para ele, troque-o com `mv -Tf` para `/opt/geek-musical/current` e reinicie somente `geek-musical`. Confirme processo, porta e saúde interna/pública. Não restaure banco ou conteúdo sobre edições posteriores. Não há alteração de esquema nesta entrega.

Pedido concluído sem pendências técnicas de escopo. A revisão factual histórica do acervo continua registrada em `docs/IMPLEMENTACAO.md`.
