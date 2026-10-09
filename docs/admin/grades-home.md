# Editor da Home

O Geek Musical usa o mesmo editor visual do Guia Produto, adaptado às rotas e à identidade do portal. A configuração existente é preservada: nove destaques manuais e três recentes por publicação original. Agora é possível editar essa composição e adicionar grades predefinidas, conforme solicitação de 09/10/2026.

Escolha o tipo em **Tipo da nova grade** e clique em **Adicionar grade**. Novas grades começam com três colunas e duas linhas. Edite título, chamada, colunas (1–4) e linhas (1–6). São permitidas até oito grades. Use **Subir** e **Descer** para ordenar as grades e **Salvar Home** para aplicar. Cada ambiente mantém sua própria configuração.

| Tipo | Seleção |
| --- | --- |
| Grade manual | Artigos escolhidos, substituídos e ordenados individualmente |
| Últimos posts | Publicação original mais recente primeiro |
| Posts mais antigos | Publicação original mais antiga primeiro |
| Posts mais vistos | Visualizações locais do GA4 nos 30 dias encerrados ontem, pelo calendário de Brasília |
| Determinada categoria | Artigos publicados da categoria ativa selecionada, mais recentes primeiro |

Atualizar um artigo não muda sua publicação original. O ranking por visualizações utiliza dados já sincronizados; acessar a Home não inicia sincronização. Sem métricas utilizáveis, mostra recentes e informa essa condição no editor. Dados parciais podem preencher menos posições.

Na grade manual, pesquise por título ou categoria, adicione ou substitua artigos e arraste os cards. Os botões de posição e o seletor de destino permitem as mesmas mudanças por teclado. Um artigo pode aparecer em grades distintas, mas apenas uma vez em cada grade. Diminuir a capacidade não remove artigos: primeiro remova ou mova os excedentes. Antes de despublicar um artigo selecionado ou desativar sua categoria, remova ou substitua sua seleção nas grades manuais.

**Atualizar lista de posts** preserva as alterações pendentes e a revisão carregada. Uma edição concorrente gera conflito ao salvar, evitando sobrescrita. **Desfazer alterações** retorna à configuração carregada/salva. Remover uma grade altera apenas sua exibição na Home após salvar; os artigos permanecem no blog. Grades vazias ficam ocultas publicamente.

Somente artigos publicados em categorias ativas são elegíveis. A seleção automática das grades não publica rascunhos nem cria agendamentos editoriais. A Home continua renderizada no servidor, responsiva e com a chamada de navegação por categorias.

O contrato permanece em `version: 1`, sem migração SQLite. Configurações existentes e manuais sem `mode` continuam aceitas. A release anterior já lê os cinco modos e as dimensões configuráveis; o rollback de código preserva a Home salva, mas seu editor antigo não consegue salvar grades fora do formato fixo. Para editar essas grades após um rollback, retorne à release nova. Nunca restaure o SQLite inteiro sobre edições recentes.
