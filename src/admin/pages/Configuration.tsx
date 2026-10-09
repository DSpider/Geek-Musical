import { useEffect, useState } from "react";
import { Save, Palette } from "lucide-react";
import type { SettingsEnvelope } from "../../../shared/admin.js";
import { api } from "../api.js";
import {
  Field,
  Loading,
  Notice,
  PageHeading,
  Panel,
  useLoad,
  useTask,
} from "../components.js";
interface ConfigField {
  key: string;
  label: string;
  kind: "text" | "number" | "textarea" | "select" | "checkbox";
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}
interface ConfigurationData extends SettingsEnvelope {
  infrastructure?: Record<string, unknown>;
}
export function ConfigurationPage({
  namespace,
  title,
  description,
  fields,
  appearance = false,
}: {
  namespace: string;
  title: string;
  description: string;
  fields: ConfigField[];
  appearance?: boolean;
}) {
  const { data, error, loading } = useLoad<ConfigurationData>("/" + namespace);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [revision, setRevision] = useState("");
  const task = useTask();
  useEffect(() => {
    if (data) {
      setValues(data.values);
      setRevision(data.revision);
    }
  }, [data]);
  return (
    <>
      <PageHeading title={title} description={description} />
      <Notice error={error || task.error} success={task.success} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <div className="admin-config-grid">
            <Panel title="Configuração funcional">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void task.run(async () => {
                    const updated = await api<SettingsEnvelope>(
                      "/" + namespace,
                      { method: "PUT", body: { values, revision } },
                    );
                    setValues(updated.values);
                    setRevision(updated.revision);
                  });
                }}
              >
                {fields.map((field) => (
                  <Field key={field.key} label={field.label} help={field.help}>
                    {field.kind === "checkbox" ? (
                      <span className="admin-check">
                        <input
                          type="checkbox"
                          checked={!!values[field.key]}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [field.key]: e.target.checked,
                            })
                          }
                        />
                        Habilitado
                      </span>
                    ) : field.kind === "select" ? (
                      <select
                        value={String(values[field.key] ?? "")}
                        onChange={(e) =>
                          setValues({ ...values, [field.key]: e.target.value })
                        }
                      >
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : field.kind === "textarea" ? (
                      <textarea
                        rows={7}
                        value={String(values[field.key] ?? "")}
                        minLength={50}
                        maxLength={5000}
                        onChange={(e) =>
                          setValues({ ...values, [field.key]: e.target.value })
                        }
                        required
                      />
                    ) : (
                      <input
                        type={field.kind}
                        value={String(values[field.key] ?? "")}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        maxLength={200}
                        onChange={(e) =>
                          setValues({
                            ...values,
                            [field.key]:
                              field.kind === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                          })
                        }
                        required
                      />
                    )}
                  </Field>
                ))}
                <button className="admin-button" disabled={task.busy}>
                  <Save size={18} />
                  {task.busy ? "Salvando…" : "Salvar configurações"}
                </button>
              </form>
            </Panel>
            <div>
              {appearance && (
                <Panel title="Aparência do portal">
                  <div
                    className={`admin-theme-preview preview-${values["themes.active"]}`}
                  >
                    <Palette size={28} />
                    <strong>Geek Musical</strong>
                    <p>Tudo sobre música você encontra aqui</p>
                    <span>Conheça nossos artigos musicais</span>
                  </div>
                  <p className="admin-help">
                    O tema aplica tokens de marca e leitura à home e ao blog. A
                    escolha Claro/Escuro/Sistema continua disponível ao
                    visitante.
                  </p>
                </Panel>
              )}
              {data.credentials && (
                <Panel title="Credenciais">
                  <dl className="admin-definition-list">
                    {Object.entries(data.credentials).map(
                      ([name, configured]) => (
                        <div key={name}>
                          <dt>{name}</dt>
                          <dd>
                            {configured ? "Configurada" : "Não configurada"}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                  <p className="admin-help">
                    Credenciais são definidas no ambiente do servidor. A
                    administração recebe apenas o estado da configuração.
                  </p>
                </Panel>
              )}
              <Panel title="Ambiente">
                <p className="admin-environment-label">{data.environment}</p>
                {data.infrastructure && (
                  <dl className="admin-definition-list">
                    {Object.entries(data.infrastructure).map(([key, value]) => (
                      <div key={key}>
                        <dt>
                          {(
                            {
                              siteName: "Nome",
                              siteUrl: "URL canônica",
                              publicSite: "Indexação liberada",
                              preview: "Preview editorial",
                              environment: "Ambiente",
                              timeoutMs: "Timeout JEV (ms)",
                              perMinute: "Limite JEV por minuto",
                              perDay: "Limite JEV por dia",
                              monthlyBudgetBrl: "Teto mensal de reservas (R$)",
                            } as Record<string, string>
                          )[key] || key}
                        </dt>
                        <dd>
                          {typeof value === "boolean"
                            ? value
                              ? "Sim"
                              : "Não"
                            : String(value ?? "Não definido")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="admin-help">
                  Infraestrutura, publicação do domínio, limites financeiros e
                  segredos são mantidos na configuração do ambiente.
                </p>
              </Panel>
            </div>
          </div>
        )
      )}
    </>
  );
}
export function ThemesPage() {
  return (
    <ConfigurationPage
      namespace="themes"
      title="Temas"
      description="Identidade e leitura centralizadas em tokens compartilhados."
      appearance
      fields={[
        {
          key: "themes.active",
          label: "Tema ativo",
          kind: "select",
          options: [
            { value: "guia", label: "Geek Musical — original" },
            { value: "editorial", label: "Geek Musical — editorial" },
          ],
        },
        {
          key: "themes.font",
          label: "Tipografia",
          kind: "select",
          options: [
            { value: "manrope", label: "Manrope" },
            { value: "system", label: "Fonte do sistema" },
          ],
        },
        {
          key: "themes.readingWidth",
          label: "Largura de leitura (px)",
          kind: "number",
          min: 600,
          max: 900,
        },
        {
          key: "themes.readingSize",
          label: "Tamanho do texto dos artigos (px)",
          kind: "number",
          min: 16,
          max: 24,
        },
        {
          key: "themes.lineHeight",
          label: "Altura de linha",
          kind: "number",
          min: 1.6,
          max: 2.2,
          step: 0.1,
        },
      ]}
    />
  );
}
export function AiPage() {
  return (
    <ConfigurationPage
      namespace="ai"
      title="Inteligência Artificial"
      description="Interpretação da busca: parser local primeiro, JEV quando útil e fallback preservado."
      fields={[
        {
          key: "ai.enabled",
          label: "Interpretação com JEV",
          kind: "checkbox",
          help: "Desabilitar mantém a interpretação local e evita novas chamadas JEV.",
        },
        {
          key: "ai.model",
          label: "Modelo JEV",
          kind: "text",
          help: "Use um modelo autorizado para a integração. Alterar o nome não concede acesso a novos modelos.",
        },
        {
          key: "ai.confidence",
          label: "Confiança mínima",
          kind: "number",
          min: 0.7,
          max: 1,
          step: 0.01,
        },
        {
          key: "ai.probability",
          label: "Probabilidade mínima da escolha",
          kind: "number",
          min: 0.75,
          max: 1,
          step: 0.01,
        },
        {
          key: "ai.categoryInstructions",
          label: "Instruções de categoria",
          kind: "textarea",
          help: "A proteção fixa para tratar pedidos como dados continua aplicada no servidor.",
        },
        {
          key: "ai.searchInstructions",
          label: "Instruções de consulta",
          kind: "textarea",
          help: "A JEV responde com opções validadas; temperatura não se aplica a este contrato.",
        },
      ]}
    />
  );
}
export function SettingsPage() {
  return (
    <ConfigurationPage
      namespace="settings"
      title="Configurações do portal"
      description="Parâmetros globais, separados de configurações dos módulos e do ambiente."
      fields={[
        {
          key: "settings.blog.postsPerPage",
          label: "Artigos por página no blog",
          kind: "number",
          min: 6,
          max: 48,
          help: "Controla as listagens do blog; URLs com parâmetros não entram nos sitemaps.",
        },
      ]}
    />
  );
}
