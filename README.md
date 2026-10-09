# Geek Musical

Portal editorial independente em React, TypeScript, Vite e Express. O HTML de Home, artigos, categorias e páginas institucionais é renderizado no servidor. Markdown e JSON preservam o acervo; SQLite privado mantém sessões, configurações, evidências e auditoria.

## Desenvolvimento

Use Node 22.13 ou superior. Configure um `.env` privado a partir de `.env.example`, com credenciais próprias. Execute `npm ci`, `npm run admin:bootstrap` e `npm run dev`. O portal usa `http://127.0.0.1:3230`. Login: `/gm-admin-login`; painel: `/gm-admin`. A criação inicial não redefine senhas de contas existentes.

Somente `development` e `production` são aceitos. DEV sempre permanece em noindex. A sequência de entrega é DEV → GitHub → PROD. Não há busca comercial, voz ou recomendações dinâmicas no portal público.

## Validação

Execute `npm run typecheck`, `npm test`, `npm run build`, `npm run lint`, `npm run content:validate`, `npm run links:check`, `npm run seo:check` e `npm run check:secrets`. A importação do WordPress exige o export privado e a cópia verificada de uploads; execute `npm run migration:import` e `npm run migration:verify`. Nunca publique exports, banco, `.env` ou backups.

## Acervo e operação

As Web Stories, o formulário de Contato e a administração WordPress permanecem no legado. As rotas e os dados originais são preservados no inventário. A Home inicia com nove destaques manuais e três recentes por publicação original. O [editor visual de grades](docs/admin/grades-home.md) permite configurar até oito grades com seleção manual, recentes, antigos, mais vistos ou determinada categoria. Artigos selecionados manualmente exigem remoção ou substituição na Home antes de despublicação. Revisões não alteram a ordem da publicação original.

Consulte [arquitetura](docs/architecture.md), [segurança](docs/security.md), [diretrizes editoriais](docs/editorial.md) e [operação](deploy/README.md). Os relatórios de migração ficam em `docs/migration/`; evidências privadas e temporárias ficam em `artifacts/`.
