import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  new URL("../public/theme.js", import.meta.url),
  "utf8",
);

describe("appearance before the first paint", () => {
  it.each([
    { saved: null, systemDark: false, preference: "light", theme: "light" },
    { saved: null, systemDark: true, preference: "light", theme: "light" },
    {
      saved: "invalid",
      systemDark: false,
      preference: "light",
      theme: "light",
    },
    { saved: "invalid", systemDark: true, preference: "light", theme: "light" },
    { saved: "light", systemDark: true, preference: "light", theme: "light" },
    { saved: "light", systemDark: false, preference: "light", theme: "light" },
    { saved: "dark", systemDark: false, preference: "dark", theme: "dark" },
    { saved: "dark", systemDark: true, preference: "dark", theme: "dark" },
    {
      saved: "system",
      systemDark: false,
      preference: "light",
      theme: "light",
    },
    { saved: "system", systemDark: true, preference: "light", theme: "light" },
  ])(
    "applies $preference/$theme with saved=$saved and device dark=$systemDark",
    ({ saved, systemDark, preference, theme }) => {
      const dataset = {};
      runInNewContext(script, {
        document: { documentElement: { dataset } },
        localStorage: { getItem: () => saved },
        matchMedia: () => ({ matches: systemDark }),
      });
      expect(dataset).toEqual({ theme, themePreference: preference });
    },
  );

  it.each([false, true])(
    "defaults to dark when storage is unavailable (device dark=%s)",
    (systemDark) => {
      const dataset = {};
      runInNewContext(script, {
        document: { documentElement: { dataset } },
        localStorage: {
          getItem: () => {
            throw new Error("blocked");
          },
        },
        matchMedia: () => ({ matches: systemDark }),
      });
      expect(dataset).toEqual({ theme: "light", themePreference: "light" });
    },
  );
});

describe.each(["index", "blog", "admin"])(
  "%s HTML theme initialization",
  (name) => {
    const template = readFileSync(
      new URL(`../src/${name}.html`, import.meta.url),
      "utf8",
    );

    it("keeps theme resolution synchronous and excluded from Rocket Loader before app assets", () => {
      const dom = new JSDOM(template);
      const document = dom.window.document;
      const bootstrap = document.querySelector<HTMLScriptElement>(
        'script[src^="/theme.js?"]',
      )!;
      expect(bootstrap).not.toBeNull();
      expect(bootstrap.parentElement).toBe(document.head);
      expect(bootstrap.getAttribute("data-cfasync")).toBe("false");
      expect(bootstrap.hasAttribute("async")).toBe(false);
      expect(bootstrap.hasAttribute("defer")).toBe(false);
      expect(bootstrap.hasAttribute("type")).toBe(false);
      expect(bootstrap.getAttribute("src")).toBe(
        "/theme.js?v=geek-light-default-2",
      );
      const tag = bootstrap.outerHTML;
      expect(tag.indexOf("data-cfasync=")).toBeLessThan(tag.indexOf("src="));
      expect(bootstrap).toBe(document.querySelector("script"));
      const appAssets = document.querySelectorAll(
        'script[type="module"], link[rel="stylesheet"]',
      );
      expect(appAssets.length).toBeGreaterThan(0);
      for (const asset of appAssets)
        expect(bootstrap.compareDocumentPosition(asset)).toBe(
          dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        );
      expect(bootstrap.nextElementSibling?.id).toBe("theme-initial-colors");
      dom.window.close();
    });

    it.each([
      {
        saved: null,
        systemDark: false,
        preference: "light",
        theme: "light",
        background: "rgb(251, 251, 253)",
        color: "rgb(38, 39, 57)",
      },
      {
        saved: "light",
        systemDark: true,
        preference: "light",
        theme: "light",
        background: "rgb(251, 251, 253)",
        color: "rgb(38, 39, 57)",
      },
      {
        saved: "system",
        systemDark: false,
        preference: "light",
        theme: "light",
        background: "rgb(251, 251, 253)",
        color: "rgb(38, 39, 57)",
      },
      {
        saved: "system",
        systemDark: true,
        preference: "light",
        theme: "light",
        background: "rgb(251, 251, 253)",
        color: "rgb(38, 39, 57)",
      },
    ])(
      "provides $preference/$theme colors without external styles or React",
      ({ saved, systemDark, preference, theme, background, color }) => {
        const dom = new JSDOM(template);
        const root = dom.window.document.documentElement;
        expect(root.dataset).toMatchObject({
          theme: "light",
          themePreference: "light",
        });
        runInNewContext(script, {
          document: dom.window.document,
          localStorage: { getItem: () => saved },
          matchMedia: () => ({ matches: systemDark }),
        });
        expect(root.dataset).toMatchObject({
          theme,
          themePreference: preference,
        });
        const styles = dom.window.getComputedStyle(root);
        expect(styles.backgroundColor).toBe(background);
        expect(styles.color).toBe(color);
        expect(styles.colorScheme).toBe(theme);
        dom.window.close();
      },
    );
  },
);
