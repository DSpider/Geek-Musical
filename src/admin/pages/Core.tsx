import { useState } from "react";
import {
  Activity,
  FileText,
  ShieldCheck,
  Blocks,
  ChevronRight,
} from "lucide-react";
import type {
  AdminPluginInfo,
  AuditEntry,
  DashboardWidget,
  PageResult,
} from "../../../shared/admin.js";
import { api } from "../api.js";
import { useAdmin } from "../context.js";
import {
  Confirm,
  DataTable,
  Empty,
  Loading,
  Notice,
  PageHeading,
  Pager,
  Panel,
  SearchBox,
  Status,
  useLoad,
  useTask,
} from "../components.js";
export function DashboardPage() {
  const { session } = useAdmin();
  const { data, error, loading } = useLoad<{
    widgets: DashboardWidget[];
    environment: string;
  }>("/dashboard");
  return (
    <>
      <PageHeading
        title="Dashboard"
        description={`Bem-vindo, ${session.user.name}. Acompanhe o conteúdo e os módulos do Geek Musical.`}
      />
      <Notice error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="admin-widgets">
              {data.widgets.map((widget) => (
                <article className="admin-widget" key={widget.id}>
                  <span className="admin-widget-icon">
                    {widget.id.startsWith("posts") ? (
                      <FileText size={21} />
                    ) : widget.id.startsWith("plugins") ? (
                      <Blocks size={21} />
                    ) : (
                      <Activity size={21} />
                    )}
                  </span>
                  <span>{widget.label}</span>
                  <strong>{widget.value}</strong>
                </article>
              ))}
            </div>
            <div className="admin-config-grid">
              <Panel title="Acessos rápidos">
                <div className="admin-shortcuts">
                  {session.menu
                    .filter(
                      (item) => item.path !== "/gm-admin" && item.position < 90,
                    )
                    .map((item) => (
                      <a href={item.path} key={item.path}>
                        <span>{item.label}</span>
                        <ChevronRight size={18} />
                      </a>
                    ))}
                </div>
              </Panel>
              <Panel title="Área administrativa">
                <div className="admin-info-icon">
                  <ShieldCheck size={28} />
                </div>
                <h3>Um núcleo, módulos independentes</h3>
                <p className="admin-help">
                  Gerencie o conteúdo do portal em um único lugar, com
                  permissões e registro das operações.
                </p>
                <p className="admin-help">
                  Ambiente atual: <strong>{data.environment}</strong>. A
                  publicação do domínio e a migração do WordPress são operações
                  separadas.
                </p>
              </Panel>
            </div>
          </>
        )
      )}
    </>
  );
}
interface PluginsData {
  plugins: AdminPluginInfo[];
  revision: string;
}
export function PluginsPage() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useLoad<PluginsData>("/plugins", refresh);
  const [changing, setChanging] = useState<AdminPluginInfo>();
  const task = useTask();
  const { refresh: refreshSession } = useAdmin();
  return (
    <>
      <PageHeading
        title="Plugins"
        description="Módulos internos registrados no Geek Musical. O núcleo mantém autenticação, permissões e navegação."
      />
      <Notice error={error || task.error} success={task.success} />
      <Panel>
        {loading ? (
          <Loading />
        ) : (
          data && (
            <DataTable
              label="Plugins administrativos"
              headers={["Plugin", "Status", "Versão", "Ações"]}
            >
              {data.plugins.map((plugin) => (
                <tr key={plugin.id}>
                  <td>
                    <strong>{plugin.name}</strong>
                    <small>{plugin.description}</small>
                  </td>
                  <td>
                    <Status value={plugin.enabled ? "active" : "inactive"} />
                  </td>
                  <td>{plugin.version}</td>
                  <td>
                    {plugin.required ? (
                      <span className="admin-help">Módulo essencial</span>
                    ) : (
                      <button
                        disabled={task.busy}
                        onClick={() => setChanging(plugin)}
                      >
                        {plugin.enabled ? "Desativar" : "Ativar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          )
        )}
      </Panel>
      <Panel title="Próximos módulos">
        <p className="admin-help">
          Redirect e Analytics já usam o contrato de plugins. SEO avançado,
          afiliados, produtos e automações poderão usar os mesmos pontos de
          extensão.
        </p>
      </Panel>
      {changing && data && (
        <Confirm
          title={`${changing.enabled ? "Desativar" : "Ativar"} ${changing.name}?`}
          confirmLabel={changing.enabled ? "Desativar módulo" : "Ativar módulo"}
          busy={task.busy}
          onClose={() => setChanging(undefined)}
          onConfirm={() =>
            void task.run(async () => {
              await api("/plugins/" + changing.id, {
                method: "PUT",
                body: { enabled: !changing.enabled, revision: data.revision },
              });
              setChanging(undefined);
              setRefresh((n) => n + 1);
              await refreshSession();
            }, "Estado do módulo atualizado.")
          }
        >
          <p>
            A mudança controla o acesso às páginas e APIs administrativas do
            módulo. As configurações e o conteúdo são preservados.
          </p>
          <Notice error={task.error} />
        </Confirm>
      )}
    </>
  );
}
interface SystemData {
  status: string;
  version: string;
  node: string;
  environment: string;
  publicSite: boolean;
  storage: string;
  migrations: { id: string; appliedAt: string }[];
  users: { name: string; role: string; active: number }[];
}
export function SystemPage() {
  const { data, error, loading } = useLoad<SystemData>("/system");
  return (
    <>
      <PageHeading
        title="Sistema"
        description="Informações operacionais básicas, migrations e perfis cadastrados."
      />
      <Notice error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="admin-config-grid">
              <Panel title="Aplicação">
                <dl className="admin-definition-list">
                  {Object.entries({
                    Status: data.status,
                    Versão: data.version,
                    "Node.js": data.node,
                    Ambiente: data.environment,
                    Armazenamento: data.storage,
                    "Indexação liberada": data.publicSite ? "Sim" : "Não",
                  }).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
              <Panel title="Perfis de acesso">
                <DataTable
                  label="Usuários cadastrados"
                  headers={["Nome", "Perfil", "Status"]}
                >
                  {data.users.map((user, index) => (
                    <tr key={index}>
                      <td>{user.name}</td>
                      <td>{user.role}</td>
                      <td>{user.active ? "Ativo" : "Inativo"}</td>
                    </tr>
                  ))}
                </DataTable>
                <p className="admin-help">
                  Criação e recuperação de usuários são realizadas pelo comando
                  administrativo no servidor.
                </p>
              </Panel>
            </div>
            <Panel title="Migrations aplicadas">
              <DataTable
                label="Migrations"
                headers={["Identificador", "Aplicada em"]}
              >
                {data.migrations.map((migration) => (
                  <tr key={migration.id}>
                    <td>{migration.id}</td>
                    <td>
                      {new Date(migration.appliedAt).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          </>
        )
      )}
    </>
  );
}
export function AuditPage() {
  const [q, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad<PageResult<AuditEntry>>(
    "/audit?" + new URLSearchParams({ q, page: String(page) }),
  );
  return (
    <>
      <PageHeading
        title="Auditoria"
        description="Histórico das operações importantes. Senhas, tokens, credenciais e conteúdo não entram nos eventos."
      />
      <Notice error={error} />
      <Panel>
        <SearchBox
          placeholder="Pesquisar ação"
          onSearch={(q) => {
            setQuery(q);
            setPage(1);
          }}
        />
        {loading ? (
          <Loading />
        ) : (
          data && (
            <>
              <DataTable
                label="Eventos de auditoria"
                headers={["Data", "Usuário", "Ação", "Recurso", "Resultado"]}
              >
                {data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString("pt-BR")}</td>
                    <td>
                      <small>{entry.userId || "Não autenticado / CLI"}</small>
                    </td>
                    <td>{entry.action}</td>
                    <td>
                      {entry.resource}
                      <small>{entry.resourceId}</small>
                    </td>
                    <td>
                      <Status value={entry.result} />
                    </td>
                  </tr>
                ))}
              </DataTable>
              {!data.items.length && (
                <Empty>Nenhum evento corresponde à pesquisa.</Empty>
              )}
              <Pager
                page={page}
                pages={data.pages}
                total={data.total}
                onPage={setPage}
              />
            </>
          )
        )}
      </Panel>
    </>
  );
}
