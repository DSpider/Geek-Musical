import { useState } from "react";
import { api } from "../api.js";
import { PageHeading, Panel, Notice, Loading, useLoad } from "../components.js";
type Entry = {
  id: string;
  url: string;
  store: string;
  articles: string[];
  revision: string;
  evidence: {
    accessibility?: string;
    product?: string;
    tracking?: string;
    source?: string;
    notes?: string;
  } | null;
};
export function AffiliatesPage() {
  const [refresh, setRefresh] = useState(0);
  const reload = () => setRefresh((value) => value + 1);
  const { data, error, loading } = useLoad<{
    items: Entry[];
    identifiers: Record<string, string>;
  }>("/affiliates", refresh);
  const [selected, setSelected] = useState<Entry | null>(null),
    [message, setMessage] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/affiliates/${selected.id}`, {
        method: "PUT",
        body: { ...values, revision: selected.revision },
      });
      setSelected(null);
      reload();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <>
      <PageHeading
        title="Afiliados"
        description="HTTP 200 comprova apenas acesso. Identidade do produto e rastreamento exigem evidências próprias."
      />
      <Notice error={error || message} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <Panel>
              <p>
                Amazon: geekmusical-20 · Mercado Livre: geekmusical · Shopee
                SubID: geekmusical
              </p>
              <p>
                {data.items.length} destinos distintos. Links históricos são
                preservados até revisão.
              </p>
            </Panel>
            {selected && (
              <Panel>
                <h2>Revisar evidências</h2>
                <p>{selected.url}</p>
                <form onSubmit={save}>
                  {(
                    [
                      [
                        "accessibility",
                        "Acessibilidade",
                        ["pending", "accessible", "inaccessible"],
                      ],
                      [
                        "product",
                        "Produto",
                        ["pending", "correct", "incorrect"],
                      ],
                      [
                        "tracking",
                        "Rastreamento",
                        ["pending", "officially-confirmed", "unconfirmed"],
                      ],
                    ] as const
                  ).map(([key, label, options]) => (
                    <label key={key}>
                      {label}
                      <select
                        name={key}
                        defaultValue={selected.evidence?.[key] || "pending"}
                      >
                        {options.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label>
                    Fonte oficial
                    <input
                      name="source"
                      defaultValue={selected.evidence?.source || ""}
                    />
                  </label>
                  <label>
                    Observações
                    <textarea
                      name="notes"
                      defaultValue={selected.evidence?.notes || ""}
                    />
                  </label>
                  <button>Salvar evidência</button>
                  <button type="button" onClick={() => setSelected(null)}>
                    Cancelar
                  </button>
                </form>
              </Panel>
            )}
            <Panel>
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Loja e destino</th>
                      <th>Artigos</th>
                      <th>Acesso / produto / tracking</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <strong>{e.store}</strong>
                          <br />
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {e.url.slice(0, 100)}
                          </a>
                        </td>
                        <td>{e.articles.length}</td>
                        <td>
                          {e.evidence?.accessibility || "pending"} /{" "}
                          {e.evidence?.product || "pending"} /{" "}
                          {e.evidence?.tracking || "pending"}
                        </td>
                        <td>
                          <button onClick={() => setSelected(e)}>
                            Revisar
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await api(`/affiliates/${e.id}/check`, {
                                  method: "POST",
                                  body: {},
                                });
                                reload();
                              } catch (error) {
                                setMessage((error as Error).message);
                              }
                            }}
                          >
                            Verificar acesso
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )
      )}
    </>
  );
}
