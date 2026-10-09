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

Checkpoint de backup, release GitHub, checksums, verificação HTTP, preservação de estado e retorno de código serão registrados após a implantação. Nenhuma conclusão de deploy é inferida dos testes locais.
