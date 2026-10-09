# Segurança e privacidade

Senhas próprias usam scrypt com salt aleatório, N=32768, r=8 e p=3. Não se importam hashes WordPress. Cookies HttpOnly e SameSite=Strict: `gm_admin_dev` em DEV e `__Host-gm_admin`, Secure e Path=/, em PROD. A API exige sessão, RBAC e token CSRF com origem permitida. Login tem limitação de trabalho e tentativas. Alterações de acesso revogam sessões e o último superadministrador ativo é preservado.

Consultas SQL utilizam parâmetros; revisão de conteúdo e configurações impede sobrescrita concorrente. Auditoria não registra senhas, cabeçalhos de autorização ou corpos de respostas dos provedores. Banco, ambiente e backups ficam fora dos diretórios públicos e têm permissões restritas.

Markdown editorial não executa HTML ou URLs de script. Uploads aceitam imagens estáticas JPEG, PNG e WebP, com limite de tamanho e pixels; o servidor decodifica e regrava WebP. Verificação de fontes resolve e valida todos os endereços DNS, fixa o IP público para a requisição, limita tempo, resposta e redirects e rejeita credenciais e redes privadas.

DEV permanece em noindex; previews de texto passam pela API autenticada. Rascunhos não aparecem no HTML público, busca ou sitemaps. Analytics inicia desativado. O vhost e as regras Cloudflare precisam excluir API, autenticação, cookies de sessão e respostas privadas do cache.
