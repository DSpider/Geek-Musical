# Checkpoint do Editor da Home — 09/10/2026

Pedido: refazer `/gm-admin/home` em DEV e PROD seguindo o editor do Guia Produto e as duas capturas fornecidas, incluindo grades predefinidas. A consulta ao projeto de referência foi somente de leitura; a adaptação mantém rotas, dados, ambiente e identidade do Geek Musical. SHA-256 do editor consultado: `a5aaef32a0ab2da060f785c245e7089cdf7b2af048a1e3a7e9553c81d59a2e77`.

## Implementação verificada em DEV

- Editor visual com imagens, busca administrativa por título/categoria, criação e edição de posts por permissão, substituição, arraste, controles de posição, movimentação entre grades, ordenação e remoção de grades.
- Cinco tipos: manual, recentes, antigos, mais vistos e determinada categoria. Até oito grades, quatro colunas e seis linhas; novas grades em 3×2.
- Configuração existente preservada em 9+3. O pedido atual amplia o formato editável; não muda a publicação, autoria, datas, URLs ou conteúdo dos artigos.
- CSRF, RBAC, revisão otimista, elegibilidade e proteção das seleções manuais mantidos. Rascunhos e categorias inativas continuam privados. Atualização da lista preserva edições pendentes; redução de capacidade não descarta posts.
- Ranking popular usa os mesmos cards no HTML renderizado no servidor e no payload público. Não inicia sincronização de analytics. Sem visualizações utilizáveis, utiliza recentes.
- Contrato `version: 1` preservado, sem mudança em esquema ou migração SQLite. A release anterior lê os layouts novos, mas seu editor fixo não consegue editá-los; detalhes em [grades-home.md](grades-home.md).

## Evidências

- 72 testes aprovados em oito arquivos, incluindo dez testes adicionais de interface, API, regras de seleção, limites, concorrência, segurança e SSR.
- Typecheck, lint, build, `content:validate`, `links:check`, `seo:check` e `check:secrets` aprovados. Acervo: 149 artigos e 29 categorias. Links e SEO conferiram 203 URLs por HTTP em execução isolada.
- Salvamento real de uma grade manual vazia em DEV confirmado após recarregar o editor. A grade temporária foi removida e a configuração inicial restaurada pelo próprio editor.
- Editor inspecionado em 320, 390, 768 e 1440 pixels, nos temas claro e escuro. Larguras reais 320/390/768/1440; `scrollWidth` 305/375/753/1425; zero imagens quebradas. Colunas 1/1/2/3. Capturas inspecionadas visualmente em desktop e celular; apresentação equivalente à referência.
- DEV: processo Node identificado, escuta `127.0.0.1:3230`, `/api/health` retorna `ok: true`, `site: Geek Musical`, `environment: development`.

## Entrega em produção

- Release implantada: `ca6c9b4dabd74a8338c0db88a1d2d58d1483f5ea`, via `deploy/prepare.py --upgrade`, obtida do repositório oficial. [Release GitHub](https://github.com/DSpider/Geek-Musical/releases/tag/home-editor-2026-10-09) inclui o arquivo de fonte e `SHA256SUMS`. SHA-256 do `git archive`: `d8c1eb76644b7d519703ed83f4ff64a67b6ccc63ee4e122b6c9c74aa54e96c16`.
- Checkpoint anterior à implantação: `/root/geekmusical-security/home-editor-20261009T131104Z`, com cópia externa em `D:/GeekMusical-backups/home-editor/home-editor-20261009T131104Z`. SQLite íntegro, arquivo editorial legível e checksums conferidos nas duas cópias. O procedimento de upgrade também criou `/root/geekmusical-security/release-20261009T131431Z`, copiado para `D:/GeekMusical-backups/releases/release-20261009T131431Z`; evidência em [release-backup.json](../migration/release-backup.json). ACLs das duas cópias limitadas à conta proprietária, Administradores e SYSTEM.
- Pós-reinício: processo e serviço `geek-musical` ativos, bind `127.0.0.1:3230`, saúde HTTP interna e HTTPS público confirmadas em `production`. SQLite íntegro, layout, contas, segredos de ambiente e migrações preservados; 6.831 arquivos editoriais com hashes iguais aos do checkpoint. Vhosts e PIDs de Guia Produto e Mago de Casa idênticos aos anteriores. Evidência em [home-editor-production.json](home-editor-production.json).
- HTTP autenticado: plugin `home` na versão `1.2.0`, 149 posts elegíveis, Home 9+3, painel/API sem cache e painel em noindex. Bundle público `/assets/admin-20nNkgzZ.js` contém os cinco tipos e o novo editor; SHA-256 `b35b28816b6735964cad1c2dbcc42a836d7935f744f0028b7fe01604690268c0`, idêntico ao build validado localmente. Verificação de produção por HTTP; inspeção visual e teste de edição feitos em DEV. Evidência em [home-editor-http.json](home-editor-http.json).
- Verificador público aprovado: 203 rotas, títulos/canonicals/JSON-LD, 26 redirecionamentos, dez sitemaps, 96 Stories e 689 imagens usadas nos artigos; login de produção, cookie seguro e respostas privadas sem cache. Evidência em [production-verification.json](../migration/production-verification.json).
- Nenhum artigo, grade de produção, credencial, integração, agendamento ou serviço de referência foi editado para os testes. O bootstrap confirmou zero novas evidências comerciais e preservou as contas existentes.

## Rollback de código

A release anterior permanece em `/opt/geek-musical/releases/eb44faf28ba198c8bc339530928a9a254f6d8017`. A troca usa symlink atômico e o serviço do Geek Musical; não envolve os vhosts de referência. Para retorno operacional, no servidor, valide esse diretório, execute `ln -s /opt/geek-musical/releases/eb44faf28ba198c8bc339530928a9a254f6d8017 /opt/geek-musical/current-rollback`, `mv -Tf /opt/geek-musical/current-rollback /opt/geek-musical/current` e `systemctl restart geek-musical`. Confirme processo, bind e saúde HTTP interna/pública. Se `current-rollback` já existir, investigue antes de executar; não reutilize um symlink sem validar seu destino.

O layout e o SQLite permanecem atuais. Não restaure banco nem conteúdo sobre edições posteriores. A compatibilidade de leitura dos cinco modos já existia na release anterior; para continuar editando grades configuráveis, volte à release nova. A recuperação automática em falha de saúde faz parte do procedimento de upgrade; não houve necessidade de acioná-la nesta entrega.
