import { useState } from "react";
import { Save, X } from "lucide-react";
import type {
  RedirectInput,
  RedirectRecord,
} from "../../../shared/redirect.js";
import { api } from "../api.js";
import { Field, Notice, Panel, useTask } from "../components.js";

export function RedirectEditor({
  record,
  onSaved,
  onClose,
}: {
  record?: RedirectRecord;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState<RedirectInput>(
    record
      ? {
          name: record.name,
          alias: record.alias,
          destination: record.destination,
          redirectType: record.redirectType,
          status: record.status,
        }
      : {
          name: "",
          alias: "",
          destination: "",
          redirectType: 302,
          status: "inactive",
        },
  );
  const task = useTask();
  const change = <K extends keyof RedirectInput>(
    key: K,
    value: RedirectInput[K],
  ) => setInput((previous) => ({ ...previous, [key]: value }));
  return (
    <Panel title={record ? "Editar redirect" : "Novo redirect"}>
      <button
        type="button"
        className="admin-icon-button"
        aria-label="Fechar editor de redirect"
        onClick={onClose}
        disabled={task.busy}
      >
        <X size={20} />
      </button>
      <Notice error={task.error} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void task.run(async () => {
            await api(record ? "/redirect/" + record.id : "/redirect", {
              method: record ? "PUT" : "POST",
              body: {
                redirect: input,
                ...(record ? { revision: record.revision } : {}),
              },
            });
            onSaved();
          });
        }}
      >
        <Field label="Nome">
          <input
            value={input.name}
            onChange={(e) => change("name", e.target.value)}
            maxLength={160}
            required
            autoFocus
          />
        </Field>
        <Field
          label="Alias"
          help="Somente letras sem acentos, números e hífens. Exemplo: youtube → /youtube."
        >
          <input
            value={input.alias}
            onChange={(e) => change("alias", e.target.value)}
            maxLength={80}
            required
            spellCheck={false}
            autoCapitalize="none"
          />
        </Field>
        <Field
          label="Destino"
          help="URL HTTPS de qualquer domínio externo ou caminho público interno, como /sobre/. Não repassamos parâmetros recebidos no alias."
        >
          <input
            value={input.destination}
            onChange={(e) => change("destination", e.target.value)}
            maxLength={2048}
            required
            spellCheck={false}
            autoCapitalize="none"
          />
        </Field>
        <Field label="Tipo de redirect">
          <select
            value={input.redirectType}
            onChange={(e) =>
              change("redirectType", Number(e.target.value) as 301 | 302)
            }
          >
            <option value={302}>302 — Temporário</option>
            <option value={301}>301 — Permanente</option>
          </select>
        </Field>
        {input.redirectType === 301 && (
          <p className="admin-help">
            Use 301 para uma mudança definitiva. Navegadores e buscadores podem
            guardar o destino permanente.
          </p>
        )}
        <Field label="Status">
          <select
            value={input.status}
            onChange={(e) =>
              change("status", e.target.value as RedirectInput["status"])
            }
          >
            <option value="inactive">Inativo</option>
            <option value="active">Ativo</option>
          </select>
        </Field>
        {record && (
          <p className="admin-help">
            Criado em {new Date(record.createdAt).toLocaleString("pt-BR")} ·
            Atualizado em {new Date(record.updatedAt).toLocaleString("pt-BR")}
          </p>
        )}
        <div className="admin-actions">
          <button className="admin-button" disabled={task.busy}>
            <Save size={18} />
            {task.busy ? "Salvando…" : "Salvar redirect"}
          </button>
          <button
            type="button"
            className="admin-button secondary"
            onClick={onClose}
            disabled={task.busy}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}
