import { useEffect, useRef, useState } from "react";
import { X, Cookie, ShieldCheck } from "lucide-react";
import {
  consentChanged,
  openCookiePreferences,
  readConsent,
  saveConsent,
} from "./client.js";

export function CookieConsent() {
  const [choice, setChoice] = useState(() => {
    try {
      return readConsent();
    } catch {
      return null;
    }
  });
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const update = () => {
      try {
        setChoice(readConsent());
      } catch {
        /* Memory choice is kept in this document. */
      }
    };
    const open = () => {
      setAnalytics(choice?.analytics || false);
      setCustomize(true);
    };
    window.addEventListener(consentChanged, update);
    window.addEventListener(openCookiePreferences, open);
    const storage = () => update();
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(consentChanged, update);
      window.removeEventListener(openCookiePreferences, open);
      window.removeEventListener("storage", storage);
    };
  }, [choice]);
  useEffect(() => {
    if (customize) dialog.current?.showModal();
    else dialog.current?.close();
  }, [customize]);
  const choose = (allowed: boolean) => {
    saveConsent(allowed);
    setChoice({ version: 1, analytics: allowed, decidedAt: Date.now() });
    setCustomize(false);
  };
  return (
    <>
      {!choice && (
        <section
          className="cookie-banner"
          aria-labelledby="cookie-title"
          aria-describedby="cookie-description"
        >
          <div className="cookie-copy">
            <Cookie size={25} aria-hidden="true" />
            <div>
              <h2 id="cookie-title">Sua privacidade, sua escolha</h2>
              <p id="cookie-description">
                Usamos armazenamento essencial para suas preferências. Com sua
                autorização, cookies de Analytics podem medir visitas e uso do
                site quando o serviço estiver habilitado. O conteúdo das suas
                buscas não entra nessas métricas.{" "}
                <a href="/politica-de-privacidade/">Política de Privacidade</a>
              </p>
            </div>
          </div>
          <div className="cookie-actions">
            <button onClick={() => choose(true)}>Aceitar cookies</button>
            <button onClick={() => choose(false)}>Somente essenciais</button>
            <button
              onClick={() => {
                setAnalytics(false);
                setCustomize(true);
              }}
            >
              Personalizar
            </button>
          </div>
        </section>
      )}
      <dialog
        ref={dialog}
        className="cookie-dialog"
        aria-labelledby="cookie-preferences-title"
        onCancel={() => setCustomize(false)}
        onClick={(event) => {
          if (event.target === dialog.current) setCustomize(false);
        }}
      >
        <header>
          <h2 id="cookie-preferences-title">Preferências de cookies</h2>
          <button
            className="cookie-close"
            aria-label="Fechar preferências"
            onClick={() => setCustomize(false)}
          >
            <X size={20} />
          </button>
        </header>
        <p>
          Você pode continuar usando o site com apenas o armazenamento
          essencial. Sua escolha fica neste navegador por 180 dias e pode ser
          alterada no rodapé.
        </p>
        <div className="cookie-option">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <h3>Essenciais</h3>
            <p>
              Aparência, sua escolha de privacidade e funcionamento do serviço.
            </p>
          </div>
          <span>Sempre ativos</span>
        </div>
        <label className="cookie-option">
          <Cookie size={22} aria-hidden="true" />
          <div>
            <strong>Analytics</strong>
            <p>
              Métricas de visitas, buscas por texto ou voz e cliques, sem enviar
              o texto da busca, áudio ou URL afiliada completa ao Google.
              Aplicadas somente quando a integração estiver habilitada.
            </p>
          </div>
          <input
            type="checkbox"
            checked={analytics}
            onChange={(event) => setAnalytics(event.target.checked)}
          />
        </label>
        <a href="/politica-de-privacidade/">Ler a Política de Privacidade</a>
        <div className="cookie-actions">
          <button onClick={() => choose(analytics)}>Salvar preferências</button>
          <button onClick={() => choose(false)}>Somente essenciais</button>
        </div>
      </dialog>
    </>
  );
}
