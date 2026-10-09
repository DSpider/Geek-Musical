import type { AnalyticsOverview } from "../../../../shared/analytics.js";
import { Field, Notice, PageHeading, Panel } from "../../components.js";

export function GoogleConnection({
  data,
  error,
  onBack,
}: {
  data: AnalyticsOverview | undefined;
  error: string;
  onBack: () => void;
}) {
  return (
    <>
      <PageHeading
        title="Conectar Google"
        description="Autenticação do servidor para Search Console e relatórios do GA4."
        action={
          <button className="admin-button secondary" onClick={onBack}>
            Voltar ao Analytics
          </button>
        }
      />
      <Notice error={error} />
      <Panel title="Configuração atual do ambiente">
        <p>
          Origem consultada nos relatórios:{" "}
          {data?.reportSiteUrl || "Não informada"}. A origem do site e a coleta
          permanecem próprias de cada ambiente.
        </p>
        <div className="admin-toolbar">
          <Field label="Propriedade Search Console (GSC_SITE_URL)">
            <input
              readOnly
              value={data?.properties.gscSite || ""}
              placeholder="Não configurada"
            />
          </Field>
          <Field label="ID da propriedade GA4 (GA4_PROPERTY_ID)">
            <input
              readOnly
              value={data?.properties.ga4Property || ""}
              placeholder="Não configurado"
            />
          </Field>
          <Field label="ID do fluxo web (GA4_MEASUREMENT_ID)">
            <input
              readOnly
              value={data?.properties.measurementId || ""}
              placeholder="Não configurado"
            />
          </Field>
        </div>
        <p>
          Arquivo de autenticação:{" "}
          {data?.configured.authentication
            ? "Indicado no ambiente; acesso ainda precisa ser validado."
            : "Não indicado. Credenciais padrão do ambiente (ADC) também são aceitas e precisam ser validadas."}
        </p>
        <p className="admin-help">
          Estes identificadores são consultados no ambiente do servidor. Uma
          chave de API simples não autoriza acesso aos relatórios. O arquivo
          JSON contém uma chave privada e deve ficar fora do Admin, do banco e
          do Git.
        </p>
      </Panel>
      <Panel title="Como autorizar a conexão">
        <ol>
          <li>
            Entre no{" "}
            <a href="https://console.cloud.google.com/">Google Cloud</a>,
            selecione um projeto e habilite a Search Console API e a Google
            Analytics Data API em “APIs e serviços”.
          </li>
          <li>
            Em “IAM e administrador → Contas de serviço”, crie uma conta
            dedicada. Prefira uma identidade de workload quando a infraestrutura
            permitir. Para conexão por arquivo, gere uma chave JSON na aba
            “Chaves” e guarde-a em local privado.
          </li>
          <li>
            No{" "}
            <a href="https://search.google.com/search-console">
              Search Console
            </a>
            , abra a propriedade → Configurações → Usuários e permissões.
            Adicione o e-mail da conta de serviço com acesso aos relatórios.
            Copie o identificador exato da propriedade: domínio
            <code> sc-domain:geekmusical.com.br</code> ou prefixo HTTPS com
            barra final.
          </li>
          <li>
            No <a href="https://analytics.google.com/">Google Analytics</a>,
            abra Administrador → Gerenciamento de acesso à propriedade e conceda
            “Leitor” à mesma conta. Copie o ID numérico da propriedade e o ID
            <code> G-…</code> do fluxo web; são identificadores diferentes.
          </li>
          <li>
            Na VPS, coloque o JSON em
            <code> /var/lib/geek-musical/google/credentials.json</code>, com
            leitura apenas pelo usuário do serviço. Configure
            <code> GOOGLE_APPLICATION_CREDENTIALS</code> com esse caminho e
            informe os três identificadores acima em
            <code> /etc/geek-musical.env</code>. Em desenvolvimento, configure o
            <code> .env</code> local e mantenha o JSON fora do repositório.
          </li>
          <li>
            No diretório da aplicação, com o ambiente privado carregado, execute
            <code> npm run gsc:test</code> e <code>npm run ga4:test</code>.
            Reinicie o serviço após mudar o ambiente e confirme sua saúde. Ative
            sincronizações somente depois de validar os acessos. A coleta no
            navegador depende de consentimento e permanece desligada na
            homologação.
          </li>
        </ol>
        <p className="admin-help">
          Instruções operacionais: docs/SEARCH-CONSOLE.md. Referências oficiais:{" "}
          <a href="https://developers.google.com/webmaster-tools/v1/how-tos/authorizing">
            autenticação Search Console
          </a>{" "}
          e{" "}
          <a href="https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart">
            conexão GA4
          </a>
          .
        </p>
      </Panel>
    </>
  );
}
