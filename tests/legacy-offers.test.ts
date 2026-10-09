import { describe, expect, it, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readSourceContent } from "../server/content/catalog.js";
import { renderMarkdown } from "../server/content/markdown.js";
import { editorialProductDestination } from "../server/content/affiliate-destination.js";

const post = readSourceContent().posts.find((p) => p.id === "WP-POST-730")!;
afterEach(() => vi.unstubAllGlobals());
describe("ofertas dos artigos importados", () => {
  it("agrupa as marcas de baquetas sem repetir logos nem mudar os destinos", () => {
    const article = readSourceContent().posts.find(
      (p) => p.id === "WP-POST-1005",
    )!;
    const original = JSON.stringify(article);
    const doc = JSDOM.fragment(renderMarkdown(article, () => undefined).html);
    expect(doc.querySelectorAll(".editorial-offers-compact")).toHaveLength(8);
    expect([...doc.querySelectorAll("h3")].map((h) => h.textContent)).toContain(
      "Liverpool",
    );
    expect([...doc.querySelectorAll("h3")].map((h) => h.textContent)).toContain(
      "C. Ibañez",
    );
    const offers = [...doc.querySelectorAll("a[data-affiliate-store]")];
    expect(offers).toHaveLength(8);
    for (const link of offers) {
      expect(link.querySelector("img")).toBeNull();
      expect(link.closest("tr")?.querySelectorAll("img")).toHaveLength(1);
      expect(
        article.links?.some((l) => l.url === link.getAttribute("href")),
      ).toBe(true);
      expect(link.getAttribute("rel")).toContain("sponsored");
      expect(link.getAttribute("rel")).toContain("noopener noreferrer");
    }
    expect(doc.querySelector('img[src$="/Magalu.png"]')).toBeNull();
    for (const media of article.media!.filter((m) => m.alt !== "Magalu")) {
      if (article.body.includes(`media:${media.id}`))
        expect(doc.querySelector(`img[src="${media.url}"]`)).not.toBeNull();
    }
    expect(JSON.stringify(article)).toBe(original);
  });
  it("preserva uma imagem editorial seguida de um CTA sem logo de loja", () => {
    const article = structuredClone(
      readSourceContent().posts.find((p) => p.id === "WP-POST-1005")!,
    );
    const media = article.media!.find((m) => m.alt === "Tipos de Baqueta")!;
    article.body = `### Baqueta\n\n![Baqueta](media:${media.id})\n\n[Ver preços](link:${article.links![1].id})`;
    const doc = JSDOM.fragment(renderMarkdown(article, () => undefined).html);
    expect(doc.querySelector(`img[src="${media.url}"]`)).not.toBeNull();
    expect(doc.querySelectorAll("a[data-affiliate-store]")).toHaveLength(1);
    expect(doc.querySelector(".editorial-offers-compact")).toBeNull();
  });
  it("preserva o conteúdo e marca os links comerciais do acervo musical", () => {
    const before = JSON.stringify(post);
    const doc = JSDOM.fragment(renderMarkdown(post, () => undefined).html);
    expect(doc.textContent!.length).toBeGreaterThan(1000);
    expect(doc.querySelectorAll("img").length).toBeGreaterThan(0);
    const links = [...doc.querySelectorAll("a[data-affiliate-store]")];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("rel")).toContain("sponsored");
      expect(post.links?.some((l) => l.url === link.getAttribute("href"))).toBe(
        true,
      );
    }
    expect(JSON.stringify(post)).toBe(before);
  });
  it("resolve o encurtador apenas para o mesmo comerciante, sem seguir destino privado ou outra loja", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location:
            "https://www.amazon.com.br/dp/B012345678?tag=geekmusical-20",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await editorialProductDestination(
        "https://amzn.to/fixture",
        "amazon",
        AbortSignal.timeout(1000),
      ),
    ).toContain("/dp/B012345678");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const location of [
      "https://127.0.0.1/private",
      "https://amazon.com.br.evil.test/dp/B012345678",
      "https://shopee.com.br/product/1/2",
      "http://www.amazon.com.br/dp/B012345678",
      "https://credential@www.amazon.com.br/dp/B012345678",
      "https://www.amazon.com.br:8443/dp/B012345678",
    ]) {
      fetchMock.mockResolvedValue(
        new Response(null, { status: 302, headers: { location } }),
      );
      const before = fetchMock.mock.calls.length;
      await expect(
        editorialProductDestination(
          "https://amzn.to/fixture",
          "amazon",
          AbortSignal.timeout(1000),
        ),
      ).rejects.toThrow("invalid_destination");
      expect(fetchMock.mock.calls.length - before).toBe(1);
    }
  });
  it("aceita o anúncio direto no host público de produtos do Mercado Livre", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://produto.mercadolivre.com.br/MLB-1234567890-modelo-_JM";
    expect(
      await editorialProductDestination(
        url,
        "mercado-livre",
        AbortSignal.timeout(1000),
      ),
    ).toBe(url);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      editorialProductDestination(
        url.replace("produto.", "produto.evil."),
        "mercado-livre",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow("invalid_destination");
  });
});
