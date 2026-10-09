import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { api } from "./api.js";
import { FieldHelp } from "./FieldHelp.js";
export function Notice({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return (
    <>
      {error && (
        <div className="admin-notice admin-error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="admin-notice admin-success" role="status">
          {success}
        </div>
      )}
    </>
  );
}
export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
  help,
  info,
}: {
  label: string;
  children: ReactNode;
  help?: string;
  info?: string;
}) {
  const id = useId();
  if (info && isValidElement<{ id?: string }>(children)) {
    const controlId = children.props.id || id;
    return (
      <div className="admin-field">
        <div className="admin-field-label">
          <label htmlFor={controlId}>{label}</label>
          <FieldHelp label={label} text={info} />
        </div>
        {cloneElement(children, { id: controlId })}
        {help && <small>{help}</small>}
      </div>
    );
  }
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}
export function Panel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="admin-panel">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function Loading() {
  return (
    <div className="admin-loading" role="status">
      Carregando informações…
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="admin-empty">{children}</p>;
}
export function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    review: "Em revisão",
    published: "Publicado",
    archived: "Arquivado",
    active: "Ativo",
    inactive: "Inativo",
    SUCCESS: "Sucesso",
    FAILURE: "Falha",
    PENDING: "Pendente",
    empty: "Sem artigos publicados",
  };
  return (
    <span className={`admin-status status-${value}`}>
      {labels[value] || value}
    </span>
  );
}
export function DataTable({
  headers,
  children,
  label,
}: {
  headers: string[];
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      className="admin-table-wrap"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className="admin-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav className="admin-pagination" aria-label="Paginação">
      <span>
        {total} {total === 1 ? "registro" : "registros"} · Página {page} de{" "}
        {pages}
      </span>
      <button
        className="admin-button secondary"
        disabled={page <= 1}
        aria-label="Página anterior"
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        className="admin-button secondary"
        disabled={page >= pages}
        aria-label="Próxima página"
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight size={18} />
      </button>
    </nav>
  );
}
export function SearchBox({
  onSearch,
  placeholder = "Pesquisar…",
}: {
  onSearch: (query: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  return (
    <form
      className="admin-search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(query);
      }}
    >
      <Search size={18} aria-hidden="true" />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        maxLength={200}
      />
      <button className="admin-button secondary">Pesquisar</button>
    </form>
  );
}
export function useLoad<T>(path: string, refresh = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, refresh]);
  return { data, setData, error, loading };
}
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const run = async (
    operation: () => Promise<void>,
    message = "Alterações salvas.",
  ) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await operation();
      setSuccess(message);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, success, run };
}
export function Confirm({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  busy,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const id = useId();
  const current = useRef({ busy, onClose });
  current.current = { busy, onClose };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.getElementById(id) as HTMLDialogElement;
    dialog.showModal();
    const escape = (event: Event) => {
      event.preventDefault();
      if (!current.current.busy) current.current.onClose();
    };
    dialog.addEventListener("cancel", escape);
    return () => {
      dialog.removeEventListener("cancel", escape);
      dialog.close();
      previous?.focus();
    };
  }, [id]);
  return (
    <dialog id={id} className="admin-dialog" aria-labelledby={id + "-title"}>
      <div className="admin-dialog-heading">
        <h2 id={id + "-title"}>{title}</h2>
        <button
          type="button"
          className="admin-icon-button"
          aria-label="Fechar confirmação"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
      <div className="admin-actions">
        <button
          type="button"
          className="admin-button secondary"
          disabled={busy}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="admin-button danger"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Processando…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
