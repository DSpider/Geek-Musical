import { createRoot } from "react-dom/client";
import { CookieConsent } from "./CookieConsent.js";
import { installAnalytics } from "./client.js";
import "./cookies.css";

if (
  !location.pathname.startsWith("/gm-admin") &&
  !document.getElementById("gp-cookie-controls")
) {
  installAnalytics();
  const host = document.createElement("div");
  host.id = "gp-cookie-controls";
  document.body.append(host);
  createRoot(host).render(<CookieConsent />);
}
