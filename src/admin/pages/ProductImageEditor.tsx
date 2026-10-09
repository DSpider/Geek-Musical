import { useState } from "react";
import type { EditorialProduct } from "../../../shared/content.js";
import type { ProductImage } from "../../../shared/product-image.js";
import { api } from "../api.js";
import { Field, Notice, useTask } from "../components.js";

export function ProductImageEditor({
  product,
  disabled,
  change,
}: {
  product: EditorialProduct;
  disabled: boolean;
  change: (product: EditorialProduct) => void;
}) {
  const task = useTask();
  const [query, setQuery] = useState(product.name);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<ProductImage[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const select = (image: ProductImage) => {
    change({ ...product, image });
    setCandidates([]);
    setReviewed(false);
  };
  return (
    <details className="admin-product-image" open={!!product.image}>
      <summary>Imagem do produto</summary>
      <p className="admin-help">
        A foto aparece na tabela com até 200 px de altura, preservando a
        proporção. Confira o modelo, a cor e o kit antes de salvar. A alteração
        vale para todos os artigos que usam este produto.
      </p>
      <Notice error={task.error} success={task.success} />
      {product.image?.url && (
        <div className="admin-product-image-preview">
          <img src={product.image.url} alt={product.image.alt} />
          <button
            type="button"
            className="admin-button secondary"
            disabled={disabled || task.busy}
            onClick={() => change({ ...product, image: null })}
          >
            Retirar foto escolhida
          </button>
        </div>
      )}
      <button
        type="button"
        className="admin-button secondary"
        disabled={disabled || task.busy || !product.offers.length}
        onClick={() =>
          void task.run(async () => {
            const result = await api<{
              candidates: ProductImage[];
              notes: string[];
            }>("/posts/product-images/lookup", {
              method: "POST",
              body: { product },
            });
            setCandidates(result.candidates);
            setNotes(result.notes);
            setReviewed(false);
          }, "Consulta das imagens concluída.")
        }
      >
        Buscar imagem nas APIs das lojas
      </button>
      {notes.map((note, index) => (
        <p className="admin-help" key={index}>
          {note}
        </p>
      ))}
      <Field
        label="Pesquisar imagem na web"
        help="Use o nome exato do modelo. Prefira fotos próprias ou imagens disponibilizadas pelo fabricante."
      >
        <input
          value={query}
          aria-label="Pesquisar imagem na web"
          maxLength={200}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      <a
        className="admin-button secondary"
        href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Pesquisar imagens na web ↗
      </a>
      <Field
        label="URL da imagem encontrada"
        help="Cole o endereço HTTPS do arquivo PNG, JPEG ou WebP. A foto será guardada na biblioteca do site."
      >
        <input
          type="url"
          aria-label="URL da imagem encontrada"
          value={url}
          maxLength={2000}
          disabled={disabled}
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <button
        type="button"
        className="admin-button secondary"
        disabled={disabled || task.busy || !url.startsWith("https://")}
        onClick={() =>
          void task.run(async () => {
            const result = await api<{ image: ProductImage }>(
              "/posts/product-images/import",
              { method: "POST", body: { url, alt: product.name } },
            );
            setCandidates([result.image]);
            setReviewed(false);
          }, "Imagem importada. Confira a prévia antes de escolher.")
        }
      >
        Importar imagem da web
      </button>
      <Field
        label="Enviar imagem do produto"
        help="PNG, JPEG ou WebP de até 3 MB. O site remove metadados e prepara uma cópia WebP."
      >
        <input
          type="file"
          aria-label="Enviar imagem do produto"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || task.busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void task.run(async () => {
              if (
                file.size > 3 * 1024 * 1024 ||
                !["image/png", "image/jpeg", "image/webp"].includes(file.type)
              )
                throw new Error("Escolha um PNG, JPEG ou WebP de até 3 MB.");
              const data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(String(reader.result).split(",")[1]);
                reader.onerror = () =>
                  reject(new Error("Não foi possível ler o arquivo."));
                reader.readAsDataURL(file);
              });
              const result = await api<{ image: ProductImage }>(
                "/posts/product-images/upload",
                { method: "POST", body: { data, alt: product.name } },
              );
              setCandidates([result.image]);
              setReviewed(false);
            }, "Imagem enviada. Confira a prévia antes de escolher.");
          }}
        />
      </Field>
      {!!candidates.length && (
        <>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            Conferi que a foto corresponde ao modelo e à variante
          </label>
          <div className="admin-product-image-candidates">
            {candidates.map((image) => (
              <div className="admin-product-image-preview" key={image.url}>
                <img
                  src={image.url}
                  alt={image.alt}
                  referrerPolicy="no-referrer"
                />
                <span>
                  {image.source.endsWith("-api")
                    ? "Imagem da loja"
                    : "Imagem da biblioteca"}
                </span>
                <button
                  type="button"
                  className="admin-button secondary"
                  disabled={disabled || !reviewed}
                  onClick={() => select(image)}
                >
                  Usar esta imagem
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {product.image && (
        <Field label="Descrição da foto">
          <input
            value={product.image.alt}
            maxLength={300}
            disabled={disabled}
            onChange={(e) =>
              change({
                ...product,
                image: { ...product.image!, alt: e.target.value },
              })
            }
          />
        </Field>
      )}
      <p className="admin-help">
        A escolha entra no artigo depois de salvar e confirmar a atualização
        editorial.
      </p>
    </details>
  );
}
