import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
type Theme = "light" | "dark";
function readTheme(): Theme {
  try {
    const saved = localStorage.getItem("geek-musical-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
  return "light";
}
export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Ativar tema ${nextTheme === "light" ? "claro" : "escuro"}`;
  const Icon = theme === "dark" ? Moon : Sun;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = theme;
    const sync = (event: StorageEvent) => {
      if (event.key === "geek-musical-theme" || event.key === null)
        setTheme(readTheme());
    };
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
    };
  }, [theme]);
  return (
    <div className="theme-control">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => {
          setTheme(nextTheme);
          try {
            localStorage.setItem("geek-musical-theme", nextTheme);
          } catch {
            /* The current tab still works without persistence. */
          }
        }}
      >
        <Icon size={19} aria-hidden="true" />
      </button>
    </div>
  );
}
