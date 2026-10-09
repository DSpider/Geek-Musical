# Geek Musical

- Exceção editorial autorizada expressamente em 09/10/2026 neste chat: rotina Geek Musical — publicação editorial, uma publicação durante a implementação e seg/qua/sex às 14h America/Sao_Paulo em produção, sem aprovação humana por artigo, SOMENTE após todos os gates documentados em docs/editorial-routine.md e na política privada. O servidor não mantém calendário de publicação; rodadas recorrentes não fazem deploy de código. Preservar a regra de rascunho/revisão para trabalhos fora dessa autorização.

Portal editorial musical independente. DEV: Windows, `http://localhost:3230`. PROD: `https://www.geekmusical.com.br`. Login `/gm-admin-login`, painel `/gm-admin`.

- Leia README.md, docs/architecture.md, docs/security.md, docs/seo.md, docs/design.md, docs/editorial.md e deploy/README.md conforme a área. Estas instruções centrais prevalecem sobre os perfis específicos.
- Preserve o acervo, URLs, datas, autoria, imagens, fontes e versões originais. Não resuma os artigos nem invente especificações, preços, experiências ou testes práticos.
- React/Express/TypeScript; Markdown/JSON editorial, SQLite administrativo. Conteúdo público renderizado no servidor; rascunhos privados.
- Home editorial: configuração inicial preservada de nove destaques manuais e três recentes por publicação original; o editor permite grades predefinidas conforme pedido de 09/10/2026 (docs/admin/grades-home.md). A chamada “O que você está procurando?” navega para categorias. Não implementar busca comercial ou voz.
- Somente DEV e PROD. Nenhuma homologação. Não alterar os projetos de referência, suas credenciais ou serviços.
- Amazon `geekmusical-20`; Mercado Livre `geekmusical`; Shopee SubID `geekmusical`. Rastreamento exige mecanismo oficial e evidência, separada da disponibilidade do destino.
- Segredos, bancos, sessões e backups fora do Git. Use contas próprias; nunca sobrescreva senhas existentes para testes.
- Novos textos ficam em rascunho/revisão. Não habilitar publicação automática ou calendário como consequência de uma alteração técnica.
- Após mudanças: testes pertinentes, typecheck, lint, build, content:validate, links:check, seo:check e check:secrets. Após reinício, confirmar processo, porta e saúde HTTP.
- Deploy com backup verificável, release do GitHub, checksums e rollback. Preservar WordPress para Stories e recursos legados. Alterar somente recursos Geek Musical.
- Documentar checkpoints, fatos verificados, pendências e evidências. Não declarar conclusão sem comprovação.
