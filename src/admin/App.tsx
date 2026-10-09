import { useEffect, useState } from "react";
import {
  Activity,
  Blocks,
  FileText,
  Folder,
  LayoutDashboard,
  Link,
  LogOut,
  Menu,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
  ExternalLink,
  LockKeyhole,
  ChartNoAxesCombined,
  History,
} from "lucide-react";
import type { AdminSession } from "../../shared/admin.js";
import { ThemeControl } from "../components/ThemeControl.js";
import { api, setCsrf } from "./api.js";
import { AdminContext, useAdmin as useAdminContext } from "./context.js";
import { Field, Loading, Notice, useTask } from "./components.js";
import { adminPages } from "./pages/registry.js";
const icons: Record<string, typeof FileText> = {
  Activity,
  Blocks,
  FileText,
  Folder,
  LayoutDashboard,
  Link,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles,
  ChartNoAxesCombined,
  History,
};
export function AdminApp() {
  const login = window.location.pathname === "/gm-admin-login";
  const [session, setSession] = useState<AdminSession>();
  const [error, setError] = useState("");
  const refresh = async () => {
    const data = await api<AdminSession>("/auth/session");
    setCsrf(data.csrfToken);
    setSession(data);
  };
  useEffect(() => {
    if (!login)
      void refresh().catch((error) => {
        if (error.code === "UNAUTHORIZED")
          window.location.replace("/gm-admin-login");
        else setError(error.message);
      });
  }, [login]);
  if (login) return <LoginPage />;
  if (!session)
    return (
      <div className="admin-init">
        <Notice error={error} />
        {!error && <Loading />}
      </div>
    );
  return (
    <AdminContext.Provider value={{ session, refresh }}>
      <AdminShell />
    </AdminContext.Provider>
  );
}
function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const task = useTask();
  const prepare = async () => {
    const result = await api<{ csrfToken: string }>("/auth/csrf");
    setCsrf(result.csrfToken);
    setReady(true);
  };
  useEffect(() => {
    void prepare().catch((error: Error) => setError(error.message));
  }, []);
  return (
    <main className="admin-login">
      <div className="admin-login-story">
        <a className="admin-brand" href="/">
          <img src="/favicon.png" alt="" width={52} height={52} />
          <span>
            Geek Musical<small>Tudo sobre música você encontra aqui</small>
          </span>
        </a>
        <div>
          <span className="admin-eyebrow">ÁREA ADMINISTRATIVA</span>
          <h1>
            Seu portal.
            <br />
            Um só lugar para cuidar.
          </h1>
          <p>
            Organize conteúdos, conecte ideias e mantenha o Geek Musical pronto
            para crescer.
          </p>
          <span className="admin-login-security">
            <ShieldCheck size={20} />
            Acesso protegido por sessão segura
          </span>
        </div>
        <p>Geek Musical · Administração</p>
      </div>
      <div className="admin-login-main">
        <div className="admin-login-card">
          <div className="admin-info-icon">
            <LockKeyhole size={27} />
          </div>
          <h2>Entrar na administração</h2>
          <p>Use sua conta administrativa do Geek Musical.</p>
          <Notice error={error || task.error} />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void task.run(async () => {
                await prepare();
                await api("/auth/login", {
                  method: "POST",
                  body: { email, password },
                });
                setPassword("");
                window.location.replace("/gm-admin");
              }, "Acesso autorizado.");
            }}
          >
            <Field label="E-mail">
              <input
                type="email"
                autoComplete="username"
                value={email}
                maxLength={254}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Senha">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                maxLength={256}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <button className="admin-button" disabled={!ready || task.busy}>
              {task.busy ? "Entrando…" : "Entrar"}
            </button>
          </form>
          {!ready && error && (
            <button
              className="admin-button secondary"
              onClick={() =>
                void prepare().catch((error: Error) => setError(error.message))
              }
            >
              Tentar novamente
            </button>
          )}
          <p className="admin-help">
            Para criar ou recuperar uma conta, use o procedimento administrativo
            no servidor.
          </p>
          <a className="admin-back" href="/">
            ← Voltar ao portal
          </a>
        </div>
      </div>
    </main>
  );
}
function AdminShell() {
  const { session } = useAdminContext();
  const [open, setOpen] = useState(false);
  const task = useTask();
  const current = session.menu.find(
    (item) => item.path === window.location.pathname,
  );
  const Page = adminPages[window.location.pathname];
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const menu = document.getElementById("admin-sidebar")!;
    const focusable = () =>
      [
        ...menu.querySelectorAll<HTMLElement>("a[href],button:not([disabled])"),
      ].filter((element) => element.offsetParent !== null);
    focusable()[0]?.focus();
    const navigate = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", navigate);
    return () => {
      document.removeEventListener("keydown", navigate);
      previous?.focus();
    };
  }, [open]);
  return (
    <div className="admin-shell">
      <a className="admin-skip" href="#admin-content">
        Ir para o conteúdo
      </a>
      <aside
        id="admin-sidebar"
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        className={"admin-sidebar" + (open ? " is-open" : "")}
        aria-label="Menu administrativo"
      >
        <a className="admin-brand" href="/gm-admin">
          <img src="/favicon.png" alt="" width={38} height={38} />
          <span>
            Geek Musical<small>Administração</small>
          </span>
        </a>
        <button
          className="admin-menu-close"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        >
          <X size={22} />
        </button>
        <span className="admin-nav-label">GERENCIAR PORTAL</span>
        <nav>
          {session.menu.map((item) => {
            const Icon = icons[item.icon] || Blocks;
            return (
              <a
                key={item.path}
                href={item.path}
                aria-current={current?.path === item.path ? "page" : undefined}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <a
          className="admin-visit"
          href="/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={18} />
          Ver portal
        </a>
        <div className="admin-sidebar-footer">
          <ShieldCheck size={18} />
          <span>
            Admin Core <small>v1.0.0</small>
          </span>
        </div>
      </aside>
      {open && (
        <button
          className="admin-menu-overlay"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <button
              className="admin-mobile-toggle admin-icon-button"
              aria-label="Abrir menu"
              aria-expanded={open}
              aria-controls="admin-sidebar"
              onClick={() => setOpen(!open)}
            >
              <Menu size={23} />
            </button>
            <nav aria-label="Breadcrumb">
              <a href="/gm-admin">Admin</a>
              <span>/</span>
              <span>{current?.label || "Página"}</span>
            </nav>
          </div>
          <div className="admin-user-tools">
            <ThemeControl />
            <span className="admin-user-avatar">
              {session.user.name.slice(0, 1).toLocaleUpperCase("pt-BR")}
            </span>
            <span className="admin-user-name">
              {session.user.name}
              <small>{session.user.role}</small>
            </span>
            <button
              className="admin-icon-button"
              title="Sair"
              aria-label="Sair da administração"
              disabled={task.busy}
              onClick={() =>
                void task.run(async () => {
                  await api("/auth/logout", { method: "POST", body: {} });
                  window.location.replace("/gm-admin-login");
                })
              }
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>
        <main id="admin-content" className="admin-content">
          <Notice error={task.error} />
          {Page && current ? (
            <Page />
          ) : (
            <Notice error="Página indisponível para seu perfil." />
          )}
        </main>
        <footer className="admin-footer">
          Geek Musical · Tudo sobre música você encontra aqui
        </footer>
      </div>
    </div>
  );
}
