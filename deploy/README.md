# Operação do Geek Musical

Fluxo exclusivo DEV → GitHub → PROD. Repositório oficial: `https://github.com/DSpider/Geek-Musical.git`. Branch principal `main`; implementação `feature/reestruturacao-geek-musical`. Nunca publicar `.env`, exports WordPress, bancos, sessões ou backups.

## Preparar e publicar

Antes do corte, executar os checks do README e `python -X utf8 scripts/backup-discover.py --checkpoint`. O backup preserva arquivos, banco, vhost e a tabela MEMORY separadamente; o checksum e a cópia externa são verificados. A restauração deve ser ensaiada em MySQL descartável, sem rede ou conexão ao banco ativo.

Após publicar o commit no GitHub, executar `python -X utf8 deploy/prepare.py`. O script busca o SHA exato no repositório oficial, compara o SHA-256 de `git archive`, instala Node próprio com checksum do distribuidor oficial, faz `npm ci --include=dev` e build de produção. Inicializa contas e evidências sem substituir revisões existentes. Confirma o serviço antes de encaminhar tráfego.

Serviço `geek-musical`, usuário isolado `geek-musical-app`, bind `127.0.0.1:3230`; releases `/opt/geek-musical/releases/<commit>`, runtime `/opt/geek-musical/runtime`, symlink `/opt/geek-musical/current`, conteúdo e SQLite em `/var/lib/geek-musical`, segredos restritos em `/etc/geek-musical.env`. O runtime não usa os diretórios de outros portais. Somente `development` e `production` são aceitos.

Executar `python -X utf8 deploy/cutover.py` para a primeira migração do tráfego. O script altera apenas o vhost Geek Musical, valida Nginx, preserva integralmente o backend PHP e ensaia Node → WordPress → Node. Confere Stories, Contato, sitemap, saúde e integridade dos outros vhosts e processos. Não restaura nem redefine conteúdo ou SQLite durante o rollback de tráfego.

## Rollback

Executar `python -X utf8 deploy/rollback.py` do checkout validado. O script valida o checksum e repõe o vhost WordPress salvo em `/root/geekmusical-security/traffic-<timestamp>/vhost-wordpress.conf`, depois testa e recarrega Nginx. O Node continua ativo e todo o estado administrativo posterior permanece em `/var/lib/geek-musical`. A reversão de arquivos ou banco exige um incidente separado; nunca restaurar automaticamente o SQLite sobre edições recentes.

Antes do primeiro corte, a preparação pode trocar uma release ainda isolada. Depois do corte, o script recusa trocar um symlink existente por outro commit. Atualizações posteriores devem preparar uma nova release e selecionar explicitamente o commit aprovado, preservando o estado e guardando a release anterior. Não executar nova importação WordPress sobre edições administrativas de produção.

## Legado e cache

Continuam no WordPress: Web Stories e seus 106 registros, mídia original, Contato, administração e login legado, REST WordPress, feeds, autores, tags, categorias sem conteúdo e homepage histórica. Os agendamentos existentes são preservados; a descoberta inicial não encontrou `publish_future_post`, e nenhum evento novo é criado.

Cache Cloudflare: a regra Geek Musical ignora cache para `/gm-admin`, `/api`, WP Admin/login, cookies de sessão e previews. Invalidar apenas URLs afetadas pelo corte; nunca limpar zonas dos outros portais. Não alterar DNS nem firewall global.

## Diagnóstico

`systemctl status geek-musical`, `journalctl -u geek-musical`, `curl http://127.0.0.1:3230/api/health`. A conferência pública deve usar HTTPS e o domínio canônico. Não copiar segredos ou logs privados para relatórios públicos.
