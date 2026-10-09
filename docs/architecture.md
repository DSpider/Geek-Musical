# Arquitetura

O processo Express é a única autoridade de publicação e autenticação. `server/web` gera HTML editorial e metadados; `src/editorial.tsx` hidrata apenas controles de tema e preferências. O navegador não recebe rascunhos nem o SQLite. A API pública oferece saúde; a pesquisa ocorre exclusivamente sobre artigos publicados em `/blog/busca/`.

`content/blog` guarda artigos e referências; os JSON registram categorias, autoria, CTAs, produtos e rotas legadas. Conteúdo publicado é filtrado antes de renderização. Origem WordPress inclui ID, caminho, hash e datas integrais. A mídia legada usa arquivos nomeados por hash e um manifesto que valida tamanho e SHA-256.

`server/admin` mantém um registro de plugins com permissões, migrações versionadas e namespaces de API. O repositório editorial usa revisão otimista, journal recuperável e escritor único. A Home inicia com nove IDs manuais e três recentes; o editor permite até oito grades manuais, recentes, antigas, populares ou por categoria. Exige remover ou substituir seleções manuais antes de despublicar um artigo. Configurações, sessões e evidências comerciais permanecem em SQLite privado. Consulte [o editor de grades](admin/grades-home.md).

As dependências reaproveitadas e seus hashes da árvore de trabalho foram registrados em `migration/reuse-manifest.json`. O runtime e o estado do Geek Musical não dependem dos diretórios dos portais de referência.
