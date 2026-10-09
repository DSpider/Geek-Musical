// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieConsent } from "../src/analytics/CookieConsent.js";

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = "";
  vi.resetModules();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("Consentimento: escolhas explícitas e armazenamento", () => {
  it("mostra opções equivalentes, personaliza sem consentimento implícito e permite rever no rodapé", async () => {
    const { openCookiePreferences, readConsent } =
      await import("../src/analytics/client.js");
    render(<CookieConsent />);
    expect(screen.getByText("Sua privacidade, sua escolha")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Personalizar" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar preferências" }),
    );
    expect(readConsent()?.analytics).toBe(false);
    expect(screen.queryByText("Sua privacidade, sua escolha")).toBeNull();
    window.dispatchEvent(new Event(openCookiePreferences));
  });
  it("rejeita escolhas expiradas, malformadas ou futuras e aceita somente após ação", async () => {
    const { readConsent, saveConsent, consentKey } =
      await import("../src/analytics/client.js");
    expect(readConsent()).toBeNull();
    saveConsent(true);
    expect(readConsent()?.analytics).toBe(true);
    localStorage.setItem(
      consentKey,
      JSON.stringify({
        version: 1,
        analytics: true,
        decidedAt: Date.now() + 5000,
      }),
    );
    expect(readConsent()).toBeNull();
    localStorage.setItem(
      consentKey,
      JSON.stringify({
        version: 1,
        analytics: true,
        decidedAt: Date.now() - 181 * 86400000,
      }),
    );
    expect(readConsent()).toBeNull();
    localStorage.setItem(consentKey, "invalid");
    expect(readConsent()).toBeNull();
  });
  it("não carrega Google sem consentimento nem em DEV; para eventos e remove cookies após revogação", async () => {
    const client = await import("../src/analytics/client.js");
    const config = document.createElement("script");
    config.type = "application/json";
    config.id = "gm-analytics-config";
    config.nonce = "fixture";
    // Simulate the public HTTPS origin without running the external script.
    vi.stubGlobal("location", {
      protocol: "https:",
      origin: "https://www.geekmusical.com.br",
      hostname: "www.geekmusical.com.br",
    });
    config.textContent = JSON.stringify({
      enabled: true,
      measurementId: "G-TEST",
      canonical: "https://www.geekmusical.com.br/",
      path: "/",
      type: "home",
    });
    document.head.append(config);
    client.updateAnalyticsConsent();
    expect(
      document.querySelector('script[src*="googletagmanager"]'),
    ).toBeNull();
    client.saveConsent(false);
    client.updateAnalyticsConsent();
    expect(
      document.querySelector('script[src*="googletagmanager"]'),
    ).toBeNull();
    client.saveConsent(true);
    client.updateAnalyticsConsent();
    const external = document.querySelector<HTMLScriptElement>(
      'script[src*="googletagmanager"]',
    )!;
    expect(external).toBeTruthy();
    expect(external.nonce).toBe("fixture");
    external.dispatchEvent(new Event("load"));
    const gtag = vi.spyOn(window, "gtag");
    client.trackSearch("product_search_submit", "voice");
    expect(gtag).toHaveBeenCalledWith(
      "event",
      "product_search_submit",
      expect.objectContaining({
        input_type: "voice",
        page_location: "https://www.geekmusical.com.br/",
        page_referrer: "",
      }),
    );
    expect(JSON.stringify(window.dataLayer)).not.toContain("transcript");
    document.cookie = "_ga=fixture; path=/";
    client.saveConsent(false);
    client.updateAnalyticsConsent();
    gtag.mockClear();
    client.trackSearch("product_search_submit", "text");
    expect(gtag).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("_ga=");
    expect(Reflect.get(window, "ga-disable-G-TEST")).toBe(true);
    config.textContent = config.textContent!.replace(
      '"enabled":true',
      '"enabled":false',
    );
    external.remove();
    client.saveConsent(true);
    client.updateAnalyticsConsent();
    expect(
      document.querySelector('script[src*="googletagmanager"]'),
    ).toBeNull();
  });
});
