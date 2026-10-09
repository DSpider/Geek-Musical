// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeEditorPage } from "../src/admin/pages/MusicalHomeEditor.js";
import { api } from "../src/admin/api.js";
import { AdminContext } from "../src/admin/context.js";
import {
  defaultHomeLayout,
  type HomeEditorData,
} from "../shared/home-editor.js";
import type { AdminSession } from "../shared/admin.js";

vi.mock("../src/admin/api.js", () => ({ api: vi.fn() }));
const posts = Array.from({ length: 12 }, (_, index) => ({
  id: `post-${index}`,
  title: `Artigo ${index}`,
  category: index === 11 ? "Piano" : "Violão",
  url: `/artigo-${index}/`,
  art: "audio" as const,
  readingMinutes: 2,
}));
const initial: HomeEditorData = {
  layout: defaultHomeLayout(posts),
  posts,
  revision: "a".repeat(64),
  environment: "development",
  categories: [{ id: "piano", name: "Piano" }],
  popularity: {
    from: "2026-09-09",
    to: "2026-10-08",
    available: false,
    partial: true,
  },
  resolvedGrids: [],
};
const session = {
  user: {
    id: "test",
    name: "Test",
    email: "test@example.test",
    role: "admin",
    permissions: ["*"],
  },
  csrfToken: "test",
  plugins: [],
  menu: [],
} satisfies AdminSession;
async function open() {
  render(
    <AdminContext.Provider value={{ session, refresh: async () => {} }}>
      <HomeEditorPage />
    </AdminContext.Provider>,
  );
  await screen.findByLabelText("Título da grade 1");
}
beforeEach(() => {
  vi.mocked(api).mockReset().mockResolvedValue(structuredClone(initial));
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

describe("Editor visual da Home", () => {
  it("adiciona os tipos predefinidos, configura categoria e salva com revisão", async () => {
    await open();
    const mode = screen.getByLabelText("Tipo da nova grade");
    for (const value of ["manual", "latest", "oldest", "popular", "category"]) {
      fireEvent.change(mode, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Adicionar grade" }));
    }
    fireEvent.change(screen.getByLabelText("Categoria da grade 7"), {
      target: { value: "piano" },
    });
    fireEvent.change(screen.getByLabelText("Título da grade 7"), {
      target: { value: "Pianos" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar Home" }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        "/home",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const call = vi
      .mocked(api)
      .mock.calls.find(([, options]) => options?.method === "PUT")!;
    const body = call[1]!.body as {
      layout: HomeEditorData["layout"];
      revision: string;
    };
    expect(body.revision).toBe(initial.revision);
    expect(body.layout.grids.map((g) => g.mode)).toEqual([
      "manual",
      "latest",
      "manual",
      "latest",
      "oldest",
      "popular",
      "category",
    ]);
    expect(body.layout.grids[6]).toMatchObject({
      title: "Pianos",
      categoryId: "piano",
      columns: 3,
      rows: 2,
      postIds: [],
    });
  });
  it("preserva edições ao atualizar posts, impede perda ao reduzir e desfaz alterações", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Linhas da grade 1"), {
      target: { value: "2" },
    });
    expect(
      (screen.getByLabelText("Linhas da grade 1") as HTMLSelectElement).value,
    ).toBe("3");
    expect(screen.getByRole("status").textContent).toContain(
      "Nenhum post foi removido",
    );
    fireEvent.click(screen.getByRole("button", { name: "Descer Artigo 0" }));
    expect(
      (screen.getByLabelText("Post da posição 1, grade 1") as HTMLSelectElement)
        .value,
    ).toBe("post-1");
    fireEvent.change(screen.getByLabelText("Título da grade 1"), {
      target: { value: "Minhas escolhas" },
    });
    vi.mocked(api).mockResolvedValueOnce({
      ...structuredClone(initial),
      revision: "b".repeat(64),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar lista de posts" }),
    );
    await screen.findByText("Lista de posts atualizada.");
    expect(
      (screen.getByLabelText("Título da grade 1") as HTMLInputElement).value,
    ).toBe("Minhas escolhas");
    fireEvent.click(
      screen.getByRole("button", { name: "Desfazer alterações" }),
    );
    expect(
      (screen.getByLabelText("Título da grade 1") as HTMLInputElement).value,
    ).toBe(initial.layout.grids[0].title);
    expect(
      (screen.getByLabelText("Post da posição 1, grade 1") as HTMLSelectElement)
        .value,
    ).toBe("post-0");
    expect(
      screen
        .getByRole("button", { name: "Salvar Home" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("filtra posts, limita oito grades e aplica remoção somente ao salvar", async () => {
    await open();
    fireEvent.change(
      screen.getByLabelText("Pesquisar posts por título ou categoria"),
      { target: { value: "Piano" } },
    );
    const select = screen.getByLabelText(
      "Post da posição 1, grade 1",
    ) as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual([
      "post-0",
      "post-11",
    ]);
    for (let index = 0; index < 6; index++)
      fireEvent.click(screen.getByRole("button", { name: "Adicionar grade" }));
    expect(
      screen
        .getByRole("button", { name: "Adicionar grade" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remover grade" })[7],
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remover grade" }).at(-1)!,
    );
    expect(screen.queryByLabelText("Título da grade 8")).toBeNull();
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(false);
  });
});
