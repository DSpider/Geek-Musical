import { useState } from "react";
import { api } from "../api.js";
import { PageHeading, Panel, Loading, Notice, useLoad } from "../components.js";
export function MediaPage() {
  const { data, error, loading } = useLoad<{
    items: { path: string; sha256: string; bytes: number }[];
  }>("/governance/media");
  const [q, setQ] = useState(""),
    [result, setResult] = useState(""),
    [failure, setFailure] = useState("");
  return (
    <>
      <PageHeading
        title="Mídia"
        description="Acervo preservado e uploads editoriais validados. Não envie imagens sem direito de uso."
      />
      <Notice error={error || failure} />
      <Panel>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget),
              file = form.get("file") as File;
            try {
              if (!file || file.size > 1_000_000)
                throw new Error("Use uma imagem de até 1 MB.");
              const bytes = new Uint8Array(await file.arrayBuffer());
              let text = "";
              for (const byte of bytes) text += String.fromCharCode(byte);
              const value = await api<{ url: string }>("/governance/media", {
                method: "POST",
                body: { data: btoa(text), alt: String(form.get("alt")) },
              });
              setResult(value.url);
            } catch (err) {
              setFailure((err as Error).message);
            }
          }}
        >
          <label>
            Imagem
            <input
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </label>
          <label>
            Descrição alternativa
            <input name="alt" required minLength={3} />
          </label>
          <button>Enviar imagem</button>
          {result && (
            <p>
              Arquivo:{" "}
              <a href={result} target="_blank" rel="noopener noreferrer">
                {result}
              </a>
            </p>
          )}
        </form>
      </Panel>
      <Panel>
        <label>
          Filtrar arquivo
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {loading ? (
          <Loading />
        ) : (
          <>
            <p>{data?.items.length} arquivos com checksum.</p>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Tamanho</th>
                    <th>SHA-256</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items
                    .filter((m) =>
                      m.path.toLowerCase().includes(q.toLowerCase()),
                    )
                    .slice(0, 100)
                    .map((m) => (
                      <tr key={m.path}>
                        <td>
                          <a
                            href={m.path}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {decodeURI(m.path)}
                          </a>
                        </td>
                        <td>{m.bytes}</td>
                        <td>{m.sha256.slice(0, 16)}…</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p>Mostrando até 100 resultados por filtro.</p>
          </>
        )}
      </Panel>
    </>
  );
}
export function SeoPage() {
  const { data, error, loading } = useLoad<{
    items: {
      id: string;
      url: string;
      title: string;
      description: string;
      publishedAt: string;
    }[];
  }>("/governance/seo");
  return (
    <>
      <PageHeading
        title="SEO"
        description="Metadados e canonicals dos artigos publicados. Edite título e descrição no editor do artigo."
      />
      <Notice error={error} />
      {loading ? (
        <Loading />
      ) : (
        <Panel>
          <p>
            <a href="/sitemap.xml">Sitemap</a> ·{" "}
            <a href="/gm-admin/link-building">Relações e páginas órfãs</a> ·{" "}
            <a href="/gm-admin/redirect">Redirecionamentos</a>
          </p>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Artigo / canonical</th>
                  <th>Descrição</th>
                  <th>Publicação original</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <a href={p.url}>{p.title}</a>
                      <br />
                      {p.url}
                    </td>
                    <td>{p.description}</td>
                    <td>{p.publishedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
export function UsersPage() {
  const [refresh, setRefresh] = useState(0),
    [failure, setFailure] = useState("");
  const { data, error, loading } = useLoad<{
    revision: string;
    items: {
      id: string;
      email: string;
      name: string;
      role: string;
      active: number;
    }[];
  }>("/governance/users", refresh);
  return (
    <>
      <PageHeading
        title="Usuários"
        description="Contas próprias do Geek Musical. Alterar acesso revoga as sessões anteriores."
      />
      <Notice error={error || failure} />
      <Panel>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            try {
              await api("/governance/users", {
                method: "POST",
                body: Object.fromEntries(new FormData(form)),
              });
              form.reset();
              setRefresh((r) => r + 1);
            } catch (err) {
              setFailure((err as Error).message);
            }
          }}
        >
          <h2>Criar conta</h2>
          <label>
            Nome
            <input name="name" required minLength={2} />
          </label>
          <label>
            E-mail
            <input type="email" name="email" required />
          </label>
          <label>
            Senha
            <input
              type="password"
              name="password"
              required
              minLength={15}
              autoComplete="new-password"
            />
          </label>
          <label>
            Perfil
            <select name="role">
              <option>editor</option>
              <option>seo</option>
              <option>admin</option>
              <option>super_admin</option>
            </select>
          </label>
          <button>Criar conta</button>
        </form>
      </Panel>
      {loading ? (
        <Loading />
      ) : (
        <Panel>
          {data?.items.map((u) => (
            <form
              key={u.id}
              onSubmit={async (e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                try {
                  await api("/governance/users/" + u.id, {
                    method: "PUT",
                    body: {
                      revision: data.revision,
                      role: String(values.get("role")),
                      active: values.get("active") === "on",
                    },
                  });
                  setRefresh((r) => r + 1);
                } catch (err) {
                  setFailure((err as Error).message);
                }
              }}
            >
              <h2>{u.name}</h2>
              <p>{u.email}</p>
              <select name="role" defaultValue={u.role}>
                <option>editor</option>
                <option>seo</option>
                <option>admin</option>
                <option>super_admin</option>
              </select>
              <label>
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={!!u.active}
                />
                Ativo
              </label>
              <button>Salvar acesso</button>
            </form>
          ))}
        </Panel>
      )}
    </>
  );
}
