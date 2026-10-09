# Geek Musical — implementação e evidências

Checkpoint de 09/10/2026. O portal independente está operacional em **https://www.geekmusical.com.br**, com WordPress preservado para Stories, mídia original, Contato e recursos legados. A implantação técnica e os ajustes visuais estão comprovados; a revisão factual integral do acervo ainda possui pendências descritas abaixo.

Atualização posterior em 09/10/2026: o [Editor da Home com grades predefinidas](admin/home-editor-checkpoint.md) foi entregue em DEV e PROD na release `ca6c9b4dabd74a8338c0db88a1d2d58d1483f5ea`. Em seguida, o [bloco de categorias foi movido para depois dos artigos](admin/home-order-checkpoint.md) na release `d22c7b117e972c5ea272d458be2a9714b672cc0b`, com 72 testes aprovados, backup verificado e preservação do estado. O registro abaixo descreve a migração inicial; os checkpoints vinculados registram as atualizações e suas conferências.

## Release e administração na migração inicial

- Commit implantado: `eb44faf28ba198c8bc339530928a9a254f6d8017`, obtido exclusivamente de `https://github.com/DSpider/Geek-Musical.git`.
- SHA-256 de `git archive`: `c9bb815fff167609537c3e6479304f1997facf2f67983da77e54c7ba5f270f50`.
- Release: `/opt/geek-musical/releases/eb44faf28ba198c8bc339530928a9a254f6d8017`; runtime próprio Node `v22.23.1`; serviço `geek-musical` ativo em `127.0.0.1:3230`.
- Estado privado em `/var/lib/geek-musical`; ambiente restrito em `/etc/geek-musical.env`. Somente DEV e PROD. Contas próprias, sem importar senhas WordPress.
- Login `/gm-admin-login`, painel `/gm-admin`, API `/api/admin`. Login de produção verificado com cookie `__Host-gm_admin`, Secure, HttpOnly, SameSite=Strict e Path=/; respostas privadas sem cache.
- SQLite de produção íntegro, com seis migrações versionadas e checksums registrados em [production-state.json](migration/production-state.json).

## Interface entregue

A Home utiliza o tema claro por padrão e preserva escolhas explícitas do visitante. A chamada tem duas linhas: “O que você” e “está procurando?”, com “procurando” em degradê roxo e azul. O tema escuro usa cinza, logo transparente e topo em degradê até a cor da página, conforme a aprovação do usuário.

São nove destaques manuais e três recentes pela publicação original, com resumo nos cards. O painel permite substituir e reordenar os destaques; valida nove IDs distintos e publicados e exige substituição antes de despublicar um destaque. Busca pública exclusivamente editorial, categorias com conteúdo e paginação.

As ofertas importadas usam o padrão dos outros portais: loja à esquerda, CTA à direita e logo em tamanho controlado. Blocos com título, logo e botão passam a formar uma tabela compacta. A apresentação evita logos duplicados e espaços excessivos; texto, fotografias editoriais e links continuam na fonte original. O artigo [Tipos de Baquetas](https://www.geekmusical.com.br/tipos-de-baquetas/#marcas-brasileiras) foi conferido em produção nos dois temas e nas quatro larguras previstas.

## Preservação e cobertura editorial

| Item | Evidência |
| --- | --- |
| Artigos | 149 publicados, com URLs originais `/<slug>/`, títulos, datas e autoria preservados |
| Blocos de texto | 12.505 blocos originais conferidos; zero omissões |
| Taxonomia | 29 categorias e 15 tags inventariadas; relações de categorias preservadas; 26 categorias com conteúdo na navegação |
| Páginas | Oito páginas originais preservadas no inventário/backup e encaminhamentos; políticas próprias atualizadas; Contato no WordPress |
| Mídia | 1.299 registros e 6.943 arquivos de uploads no backup; 6.731 imagens registradas na cópia da aplicação; URLs legadas preservadas |
| Stories | 96 publicadas verificadas por HTTP; dez agendadas preservadas no WordPress; nenhum agendamento criado |
| Templates | 46 reviews, 98 rankings, quatro guias e um tutorial, mantendo os blocos do acervo |
| Importação repetível | Duas execuções isoladas, 6.984 arquivos com hashes idênticos |

[content-audit.json](migration/content-audit.json), [preservation-check.json](migration/preservation-check.json), [repeat-import.json](migration/repeat-import.json) e [article-review-ledger.json](migration/article-review-ledger.json) registram a origem e as verificações por artigo. O reaproveitamento seletivo dos projetos de referência tem hashes da árvore de trabalho em [reuse-manifest.json](migration/reuse-manifest.json).

## Afiliados e pendências verificáveis

O painel centraliza lojas, URLs deduplicadas, histórico e revisão concorrente. Acesso ao destino, identidade do produto e rastreamento são estados independentes; HTTP 200 não comprova afiliação. CTAs não exibem preço sem valor verificável e usam `rel="sponsored nofollow noopener noreferrer"`.

Amazon: 426 identidades consultadas pelo mecanismo oficial; 418 retornadas, oito não retornadas. Houve correspondência exata de título em 86 registros, utilizada para corrigir 90 ocorrências de links para `geekmusical-20`. Outras 332 identidades retornadas continuam aguardando conferência individual de título/modelo/variante. Os candidatos oficiais ainda pendentes não foram aplicados automaticamente.

Mercado Livre: gerador oficial autenticado conferido com a tag `geekmusical`; os destinos históricos ainda precisam ser associados aos anúncios corretos antes de gerar novos links. Um link de Roland FP10 que levava a uma lista genérica foi registrado como produto incorreto; o CTA fica em revisão e o histórico é preservado.

Shopee: SubID `geekmusical` configurado; os links históricos exigem resolução e comprovação pelo mecanismo autorizado. Magalu e outras lojas históricas continuam preservadas, sem nova integração comercial.

**A revisão factual completa dos 149 artigos não está concluída.** Permanecem pendentes a confirmação de modelos/variantes, especificações, alegações de testes e créditos/licenças de imagens por fontes primárias. A preservação e a revisão estrutural/metadados não são tratadas como comprovação factual. Anos, datas e produtos não foram substituídos automaticamente. Consulte [review-differences.json](migration/review-differences.json), [official-affiliate-verification.json](migration/official-affiliate-verification.json) e [manual-affiliate-verification.json](migration/manual-affiliate-verification.json).

## Testes e conferência pública

- 62 testes automatizados aprovados; typecheck, lint, build, validação editorial, links, SEO, preservação e verificação de segredos aprovados.
- Cobertura de Home 9+3, publicação original, IDs distintos, estados vazios, concorrência, bloqueio da retirada de destaque, privacidade de rascunhos, RBAC, CSRF, cookies, último superadministrador, XSS, upload inválido, SSRF e evidências de afiliados.
- 203 rotas públicas verificadas por HTTP, com títulos/canonicals/JSON-LD; 26 redirecionamentos equivalentes, dez sitemaps, 96 Stories e 689 imagens efetivamente usadas nos artigos.
- Inspeções em 320, 390, 768 e 1440 pixels, nos dois temas, para Home, blog, categoria, review, ranking, guia e tutorial. As dimensões reais foram registradas; nenhum overflow ou imagem visível quebrada nas verificações.
- Saúde pública e serviços de Geek Musical, Guia Produto e Mago de Casa confirmados após implantação.

[production-verification.json](migration/production-verification.json), [responsive-checks.json](migration/responsive-checks.json), [offer-responsive-checks.json](migration/offer-responsive-checks.json) e [production-responsive-checks.json](migration/production-responsive-checks.json) contêm os resultados.

Cinco amostras por origem: mediana até receber cabeçalhos de **97,3 ms em DEV local** e **215,5 ms no HTTPS público**. HTML da Home: aproximadamente 55 KB descomprimidos. Essas medições incluem o caminho de rede da máquina de execução e **não são Core Web Vitals de campo**.

## Backups, cache e rollback

O backup WordPress anterior ao corte tem cópia externa verificada em `D:/GeekMusical-backups/wordpress-precut-20261009T030716Z`, SHA-256 `6f2009019d462df10fa8e4ffce253e9027407c95c73f4d3f64dd0672c50526d5`. A restauração isolada anterior comprovou 104 tabelas, 149 artigos, oito páginas, 1.299 mídias e 106 Stories. A tabela MEMORY foi preservada separadamente, com estrutura e zero linhas na leitura. O MySQL descartável foi parado após a conferência.

O backup de conteúdo e SQLite anterior à atualização está em `/root/geekmusical-security/release-20261009T040317Z`, com cópia em `D:/GeekMusical-backups/releases/release-20261009T040317Z`. Checksums, leitura do arquivo e integridade do SQLite confirmados. Os backups locais possuem ACL restrita à conta proprietária, Administradores e SYSTEM. Evidências: [precut-backup.json](migration/precut-backup.json), [backup-restoration.json](migration/backup-restoration.json) e [release-backup.json](migration/release-backup.json).

O corte alterou somente o vhost Geek Musical. O ensaio **Node → WordPress → Node** passou, preservando estado administrativo, Stories e Contato. Os outros vhosts e PIDs dos portais de referência foram conferidos sem alterações. A proteção de origem por IPs Cloudflare permaneceu ativa; o verificador aguarda a efetiva troca de workers Nginx antes de concluir.

Cloudflare: regra de bypass para autenticação/API/sessões/previews ativa; a antiga regra global Cache Everything foi desativada. Limpeza seletiva de 237 URLs exatas em oito lotes, somente na zona Geek Musical. Nenhuma alteração de DNS, firewall global ou zona dos outros portais. Registro: [cloudflare-cache.json](migration/cloudflare-cache.json).

Para devolver o tráfego ao WordPress, execute `python -X utf8 deploy/rollback.py`. O script valida os checksums do vhost salvo em `/root/geekmusical-security/traffic-20261009T035215Z`, testa e recarrega Nginx. O Node e o SQLite permanecem ativos e preservados; o procedimento não restaura banco sobre edições posteriores. A release anterior também permanece em `/opt/geek-musical/releases/fcf42b790b879941e41a401fa5880c672ae38dcb`.

Atualizações de código usam `deploy/prepare.py --upgrade`, com commit publicado, backup, symlink atômico e recuperação da release anterior em falha crítica. Alterações de esquema/migração SQLite exigem revisão de compatibilidade específica. Veja [operação](../deploy/README.md) e [production-cutover.json](migration/production-cutover.json).

## Próximo checkpoint editorial

Retomar pelo ledger por artigo, preservando o estado administrativo de produção. Conferir cada modelo/variante com fonte primária, registrar diferenças e evidências, resolver os destinos históricos de Mercado Livre/Shopee pelo mecanismo oficial e confirmar os créditos das imagens. Não executar novamente a importação sobre conteúdo editado no painel. A implantação operacional não encerra essas pendências de auditoria.
