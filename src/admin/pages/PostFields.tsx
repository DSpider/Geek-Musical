import { Plus, Trash2 } from "lucide-react";
import type { Post } from "../../../shared/content.js";
import { Field, Panel } from "../components.js";
interface PostFieldProps {
  post: Post;
  update: boolean;
  change: <K extends keyof Post>(key: K, value: Post[K]) => void;
}
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export function PostSources({ post, update, change }: PostFieldProps) {
  return (
    <Panel title="Fontes consultadas">
      <p className="admin-help">
        Cada fonte precisa ser citada no corpo com seu ID. Não declare uma
        consulta ou revisão que não ocorreu.
      </p>
      {post.sources.map((source, index) => (
        <fieldset key={index} className="admin-source">
          <legend>Fonte {index + 1}</legend>
          {(["id", "title", "url", "accessedAt"] as const).map((key) => (
            <Field
              key={key}
              label={
                {
                  id: "ID para citação",
                  title: "Título da fonte",
                  url: "URL HTTPS",
                  accessedAt: "Data real da consulta",
                }[key]
              }
            >
              <input
                type={
                  key === "accessedAt" ? "date" : key === "url" ? "url" : "text"
                }
                value={source[key]}
                maxLength={key === "url" ? 2000 : 300}
                onChange={(e) =>
                  change(
                    "sources",
                    post.sources.map((value, i) =>
                      i === index ? { ...value, [key]: e.target.value } : value,
                    ),
                  )
                }
                disabled={!update}
                required
              />
            </Field>
          ))}
          {update && (
            <button
              type="button"
              className="admin-text-danger"
              onClick={() =>
                change(
                  "sources",
                  post.sources.filter((_, i) => i !== index),
                )
              }
            >
              <Trash2 size={16} />
              Remover fonte
            </button>
          )}
        </fieldset>
      ))}
      {update && (
        <button
          type="button"
          className="admin-button secondary"
          onClick={() =>
            change("sources", [
              ...post.sources,
              {
                id: "fonte-" + (post.sources.length + 1),
                title: "",
                url: "",
                accessedAt: today(),
              },
            ])
          }
        >
          <Plus size={18} />
          Adicionar fonte
        </button>
      )}
    </Panel>
  );
}
export function PostCover({ post, update, change }: PostFieldProps) {
  return (
    <Panel title="Imagem de capa">
      <p className="admin-help">
        Use um arquivo autorizado já disponível nos assets públicos.
      </p>
      <Field label="Caminho da imagem">
        <input
          value={post.coverImage?.path || ""}
          placeholder="/images/capa.webp"
          maxLength={300}
          onChange={(e) =>
            change(
              "coverImage",
              e.target.value
                ? {
                    ...post.coverImage,
                    path: e.target.value,
                    alt: post.coverImage?.alt || "",
                    width: post.coverImage?.width || 1200,
                    height: post.coverImage?.height || 630,
                  }
                : undefined,
            )
          }
          disabled={!update}
        />
      </Field>
      {post.coverImage && (
        <>
          <Field label="Texto alternativo">
            <input
              minLength={10}
              maxLength={300}
              value={post.coverImage.alt}
              onChange={(e) =>
                change("coverImage", {
                  ...post.coverImage!,
                  alt: e.target.value,
                })
              }
              disabled={!update}
              required
            />
          </Field>
          {(["credit", "license"] as const).map((key) => (
            <Field
              key={key}
              label={
                key === "credit" ? "Crédito da imagem" : "Licença da imagem"
              }
            >
              <input
                maxLength={300}
                value={post.coverImage![key] || ""}
                onChange={(e) =>
                  change("coverImage", {
                    ...post.coverImage!,
                    [key]: e.target.value || undefined,
                  })
                }
                disabled={!update}
              />
            </Field>
          ))}
          {(["width", "height"] as const).map((key) => (
            <Field
              key={key}
              label={key === "width" ? "Largura (px)" : "Altura (px)"}
            >
              <input
                type="number"
                min={1}
                max={10000}
                value={post.coverImage![key]}
                onChange={(e) =>
                  change("coverImage", {
                    ...post.coverImage!,
                    [key]: Number(e.target.value),
                  })
                }
                disabled={!update}
              />
            </Field>
          ))}
        </>
      )}
    </Panel>
  );
}
