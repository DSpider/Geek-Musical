import { useState } from "react";
import type {
  EditorialOffer,
  EditorialProduct,
  Post,
} from "../../../shared/content.js";
import {
  affiliateStores,
  affiliateStore,
  editorialStoreInfo,
  offerStatusLabels,
  type PostAffiliateStatus,
} from "../../../shared/affiliate.js";
import { api } from "../api.js";
import { Field, Panel, Notice, useLoad, useTask } from "../components.js";
import { usePermission } from "../context.js";
import { ProductImageEditor } from "./ProductImageEditor.js";

export function PostAffiliateLinks({
  post,
  products,
  update,
  dirty,
  changeProducts,
  changePost,
}: {
  post: Post;
  products: EditorialProduct[];
  update: boolean;
  dirty: boolean;
  changeProducts: (products: EditorialProduct[]) => void;
  changePost: <K extends keyof Post>(key: K, value: Post[K]) => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const reload = () => setRefresh((previous) => previous + 1);
  const { data, error } = useLoad<PostAffiliateStatus>(
    "/posts/" + encodeURIComponent(post.id) + "/affiliate-links",
    refresh,
  );
  const ml = useLoad<{
    configured: boolean;
    connected: boolean;
    error: boolean;
    connectedAt: string | null;
    credentialsReference: string;
    environment: string;
  }>("/posts/mercado-livre", refresh);
  const task = useTask(),
    publish = usePermission("posts.publish");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("new");
  const [candidates, setCandidates] = useState<
    Array<{ offer: EditorialOffer; variant: Record<string, string> }>
  >([]);
  const [confirmed, setConfirmed] = useState(false);
  const attached = products.filter((p) => post.productIds?.includes(p.id));
  const alter = (product: EditorialProduct) =>
    changeProducts(products.map((p) => (p.id === product.id ? product : p)));
  const offerChange = (
    product: EditorialProduct,
    offerId: string,
    patch: Partial<EditorialOffer>,
  ) =>
    alter({
      ...product,
      offers: product.offers.map((o) =>
        o.id === offerId
          ? {
              ...o,
              ...patch,
              checkedAt: new Date().toISOString(),
              method: o.store === "awin" ? "awin-feed" : "manual-review",
            }
          : o,
      ),
    });
  const status = (id: string) => {
    const check = data?.checks.find((c) => c.id === id);
    return (
      <>
        <p className="admin-help">
          {offerStatusLabels[check?.status || "pending"] || check?.status}
          {check?.stock === "out_of_stock"
            ? " · Sem estoque informado pela fonte"
            : check?.stock === "in_stock"
              ? " · Em estoque informado pela fonte"
              : ""}
          <br />
          {check?.checkedAt
            ? "Verificado em " +
              new Date(check.checkedAt).toLocaleString("pt-BR")
            : "Ainda sem verificação automática"}
          {check?.validUntil && (
            <>
              <br />
              Validade da informação:{" "}
              {new Date(check.validUntil).toLocaleString("pt-BR")}
            </>
          )}
          {check?.updatedLink
            ? " · Link atualizado automaticamente para o mesmo anúncio"
            : ""}
          {check && (
            <>
              <br />
              Próxima verificação:{" "}
              {new Date(check.nextAt).toLocaleString("pt-BR")}
            </>
          )}
        </p>
        {check?.updatedLink && (
          <Field label="Link usado na oferta pública">
            <input type="url" value={check.currentUrl || ""} readOnly />
          </Field>
        )}
        {!!check?.history.length && (
          <details>
            <summary>Últimas verificações</summary>
            <ul>
              {check.history.map((h, index) => (
                <li key={index}>
                  {new Date(h.checkedAt).toLocaleString("pt-BR")} ·{" "}
                  {offerStatusLabels[h.status] || h.status}
                  {h.stock === "unknown"
                    ? ""
                    : h.stock === "in_stock"
                      ? " · Em estoque na verificação"
                      : " · Sem estoque na verificação"}
                </li>
              ))}
            </ul>
          </details>
        )}
      </>
    );
  };
  return (
    <Panel title="Links de afiliados">
      <p>
        Edite aqui o link de compra e a URL direta do produto. As fontes do
        artigo ficam na seção abaixo. Cada produto usa uma referência{" "}
        <code>offers:ID</code>; a alteração vale para todos os artigos que usam
        esse produto.
      </p>
      <Notice error={error || task.error} success={task.success} />
      <details>
        <summary>Conexão com a API do Mercado Livre</summary>
        <p>
          {ml.data?.connected
            ? "Conta conectada"
            : ml.data?.configured
              ? "Credenciais configuradas; autorização da conta pendente"
              : "Credenciais privadas pendentes"}
          .{" "}
          {ml.data?.error
            ? "Confira o arquivo privado e a conta configurada."
            : ""}
        </p>
        <p className="admin-help">
          {ml.data?.credentialsReference}. O token é renovado pelo backend;
          nenhum segredo é exibido aqui. A autorização é centralizada em
          produção para preservar a renovação do acesso.
        </p>
        {publish && (
          <button
            type="button"
            className="admin-button secondary"
            disabled={
              dirty ||
              task.busy ||
              !ml.data?.configured ||
              ml.data?.connected ||
              ml.data?.environment !== "production"
            }
            onClick={() =>
              void task.run(async () => {
                const result = await api<{ url: string }>(
                  "/posts/mercado-livre/connect",
                  { method: "POST", body: {} },
                );
                window.location.assign(result.url);
              }, "Autorização iniciada.")
            }
          >
            Conectar conta no Mercado Livre
          </button>
        )}
      </details>
      <div className="admin-inline-actions">
        <button
          type="button"
          className="admin-button secondary"
          disabled={!update || dirty || task.busy}
          onClick={() =>
            void task.run(async () => {
              await api(
                "/posts/" + encodeURIComponent(post.id) + "/check-links",
                { method: "POST", body: {} },
              );
              reload();
            }, "Verificações agendadas. Atualize o diagnóstico para acompanhar.")
          }
        >
          Verificar links deste artigo
        </button>
        <button
          type="button"
          className="admin-button secondary"
          onClick={reload}
        >
          Atualizar diagnóstico
        </button>
        {publish && data && (
          <button
            type="button"
            className="admin-button secondary"
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                await api("/posts/offer-settings", {
                  method: "PUT",
                  body: {
                    revision: data.settingsRevision,
                    values: { "posts.weeklyOfferChecks": !data.weeklyEnabled },
                  },
                });
                reload();
              }, "Rotina semanal atualizada.")
            }
          >
            {data.weeklyEnabled ? "Pausar" : "Ativar"} verificação semanal
          </button>
        )}
      </div>
      <p className="admin-help">
        Rotina semanal {data?.weeklyEnabled ? "ativa" : "pausada"} para o blog
        inteiro. Salve alterações antes de verificar. Estoque desconhecido e
        falta de acesso são tratados como pendências. A troca automática
        conserva o mesmo anúncio; outro modelo exige revisão.
      </p>
      {attached.map((product) => (
        <section className="admin-affiliate-product" key={product.id}>
          <h3>{product.name}</h3>
          <p className="admin-help">
            <code>offers:{product.id}</code>
          </p>
          <Field label="Nome do produto">
            <input
              value={product.name}
              maxLength={300}
              disabled={!update}
              onChange={(e) => alter({ ...product, name: e.target.value })}
            />
          </Field>
          <ProductImageEditor
            product={product}
            disabled={!update}
            change={alter}
          />
          {product.offers.map((offer) => {
            const info = editorialStoreInfo(offer);
            return (
              <div className="admin-affiliate-offer" key={offer.id}>
                <div className="admin-affiliate-store" data-store={offer.store}>
                  <span>
                    <img src={info.logo} alt="" width={96} height={40} />
                  </span>
                  <strong>{info.name}</strong>
                </div>
                {offer.method === "manual-review" && (
                  <Field label="Loja desta oferta">
                    <select
                      value={offer.store}
                      disabled={!update}
                      onChange={(e) =>
                        offerChange(product, offer.id, {
                          store: e.target.value as EditorialOffer["store"],
                        })
                      }
                    >
                      {Object.entries(affiliateStores)
                        .filter(([key]) => key !== "awin")
                        .map(([key, info]) => (
                          <option value={key} key={key}>
                            {info.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <Field
                  label="Link de afiliado"
                  help={
                    offer.store === "awin"
                      ? "Fornecido pelo catálogo oficial. Revalidação usa conta, loja e produto configurados."
                      : "Preserve os parâmetros de atribuição da sua conta. Não cole a URL de uma pesquisa."
                  }
                >
                  <input
                    type="url"
                    value={offer.url}
                    maxLength={2000}
                    disabled={!update || offer.store === "awin"}
                    onChange={(e) =>
                      offerChange(product, offer.id, { url: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="URL direta do produto"
                  help="Usada para identificar o anúncio na API. Uma URL encurtada, sozinha, não confirma produto ou estoque."
                >
                  <input
                    type="url"
                    value={offer.productUrl}
                    maxLength={2000}
                    disabled={!update || offer.store === "awin"}
                    onChange={(e) =>
                      offerChange(product, offer.id, {
                        productUrl: e.target.value,
                      })
                    }
                  />
                </Field>
                {status(offer.id)}
                <button
                  type="button"
                  className="admin-button secondary"
                  disabled={!update}
                  onClick={() =>
                    alter({
                      ...product,
                      offers: product.offers.filter((o) => o.id !== offer.id),
                    })
                  }
                >
                  Retirar esta oferta do produto
                </button>
              </div>
            );
          })}
          <div className="admin-inline-actions">
            <button
              type="button"
              className="admin-button secondary"
              disabled={!update || product.offers.length >= 30}
              onClick={() => {
                const id = "O-" + crypto.randomUUID();
                alter({
                  ...product,
                  offers: [
                    ...product.offers,
                    {
                      id,
                      store: "amazon",
                      url: "https://www.amazon.com.br/",
                      productUrl: "https://www.amazon.com.br/",
                      title: product.name,
                      checkedAt: new Date().toISOString(),
                      tracking: "geekmusical",
                      method: "manual-review",
                    },
                  ],
                });
              }}
            >
              Adicionar oferta
            </button>
            {!post.body.includes("offers:" + product.id) && (
              <button
                type="button"
                className="admin-button secondary"
                disabled={!update}
                onClick={() =>
                  changePost(
                    "body",
                    post.body + `\n\n[Onde encontrar](offers:${product.id})`,
                  )
                }
              >
                Inserir referência no conteúdo
              </button>
            )}
          </div>
        </section>
      ))}
      <Field label="Associar produto já cadastrado">
        <select
          value=""
          disabled={!update}
          onChange={(e) =>
            changePost("productIds", [
              ...new Set([...(post.productIds || []), e.target.value]),
            ])
          }
        >
          <option value="">Selecione um produto</option>
          {products
            .filter((p) => !post.productIds?.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </Field>
      <details className="admin-affiliate-catalog">
        <summary>Incluir uma oferta do catálogo Awin</summary>
        <p>
          Pesquise o modelo exato. Confirme voltagem, capacidade, cor, tamanho e
          kit antes de associá-lo ao produto do texto.
        </p>
        <Field label="Produto do artigo">
          <select
            value={target}
            disabled={!update}
            onChange={(e) => {
              setTarget(e.target.value);
              setConfirmed(false);
            }}
          >
            <option value="new">
              Criar cadastro do modelo selecionado e inserir no artigo
            </option>
            {attached.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Modelo no catálogo Awin">
          <input
            value={query}
            maxLength={150}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <button
          type="button"
          className="admin-button secondary"
          disabled={!update || task.busy || query.trim().length < 2}
          onClick={() =>
            void task.run(async () => {
              const found = await api<{ items: typeof candidates }>(
                "/posts/awin-catalog?q=" + encodeURIComponent(query.trim()),
              );
              setCandidates(found.items);
            }, "Catálogo local consultado.")
          }
        >
          Buscar ofertas elegíveis
        </button>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Revisei o modelo e a variante do artigo
        </label>
        {candidates.map(({ offer, variant }) => (
          <div className="admin-affiliate-offer" key={offer.id}>
            <div className="admin-affiliate-store" data-store="awin">
              <span>
                <img
                  src={editorialStoreInfo(offer).logo}
                  alt=""
                  width={96}
                  height={40}
                />
              </span>
              <strong>{offer.awin?.storeName}</strong>
            </div>
            <strong>{offer.title}</strong>
            <p>
              {Object.entries(variant)
                .map(([k, v]) => `${k}: ${v}`)
                .join("; ") || "Variante não detalhada pela fonte"}
            </p>
            <button
              type="button"
              className="admin-button secondary"
              disabled={
                !update ||
                !confirmed ||
                !target ||
                products
                  .find((p) => p.id === target)
                  ?.offers.some(
                    (o) => o.awin?.advertiserId === offer.awin?.advertiserId,
                  )
              }
              onClick={() => {
                if (target === "new") {
                  const product = products.find((p) =>
                    p.offers.some(
                      (o) => o.awin?.catalogId === offer.awin?.catalogId,
                    ),
                  ) || {
                    id: "P-" + crypto.randomUUID(),
                    name: offer.title.slice(0, 300),
                    offers: [offer],
                  };
                  if (!products.some((p) => p.id === product.id))
                    changeProducts([...products, product]);
                  changePost("productIds", [
                    ...new Set([...(post.productIds || []), product.id]),
                  ]);
                  if (!post.body.includes("offers:" + product.id))
                    changePost(
                      "body",
                      post.body + `\n\n[Onde encontrar](offers:${product.id})`,
                    );
                } else {
                  const product = products.find((p) => p.id === target)!;
                  alter({ ...product, offers: [...product.offers, offer] });
                }
              }}
            >
              Associar oferta revisada
            </button>
          </div>
        ))}
      </details>
      {!!post.links?.filter(
        (link) => link.sponsored || affiliateStore(link.url),
      ).length && <h3>Links preservados do artigo original</h3>}
      {post.links
        ?.filter((link) => link.sponsored || affiliateStore(link.url))
        .map((link) => {
          const store = affiliateStore(link.url),
            info = store && affiliateStores[store];
          return (
            <div className="admin-affiliate-offer" key={link.id}>
              {info?.logo && (
                <div className="admin-affiliate-store" data-store={store}>
                  <span>
                    <img src={info.logo} alt="" width={96} height={40} />
                  </span>
                  <strong>{info.name}</strong>
                </div>
              )}
              <strong>
                Referência <code>link:{link.id}</code>
              </strong>
              <Field label="Link de afiliado">
                <input
                  type="url"
                  value={link.url}
                  maxLength={2000}
                  disabled={!update}
                  onChange={(e) =>
                    changePost(
                      "links",
                      post.links?.map((l) =>
                        l.id === link.id ? { ...l, url: e.target.value } : l,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="URL direta do produto">
                <input
                  type="url"
                  value={link.productUrl || ""}
                  maxLength={2000}
                  disabled={!update}
                  onChange={(e) =>
                    changePost(
                      "links",
                      post.links?.map((l) =>
                        l.id === link.id
                          ? { ...l, productUrl: e.target.value || undefined }
                          : l,
                      ),
                    )
                  }
                />
              </Field>
              {status(`${post.id}:${link.id}`)}
            </div>
          );
        })}
      {!attached.length && (
        <p>
          Nenhum produto associado a este artigo. Associe um cadastro acima para
          gerenciar suas ofertas.
        </p>
      )}
    </Panel>
  );
}
