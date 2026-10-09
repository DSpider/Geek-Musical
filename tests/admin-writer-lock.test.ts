import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { acquireWriterLock } from "../server/admin/writer-lock.js";

vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    readFileSync: vi.fn(fs.readFileSync),
    unlinkSync: vi.fn(fs.unlinkSync),
  };
});
const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
let root: string;
let file: string;
const stalePid = 123456;
const missing = () =>
  Object.assign(new Error("Fixture ausente"), { code: "ENOENT" });
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "guia-writer-lock-"));
  file = path.join(root, ".gm-admin-writer.lock");
  vi.mocked(readFileSync).mockImplementation(actualFs.readFileSync);
  vi.mocked(unlinkSync).mockImplementation(actualFs.unlinkSync);
});
afterEach(() => {
  vi.restoreAllMocks();
  const absolute = path.resolve(root);
  if (
    !absolute.startsWith(
      path.resolve(tmpdir()) + path.sep + "guia-writer-lock-",
    )
  )
    throw new Error("Escopo temporário inválido.");
  rmSync(absolute, { recursive: true, force: true });
});
function deadOwner() {
  writeFileSync(file, String(stalePid));
  vi.spyOn(process, "kill").mockImplementation((pid) => {
    if (pid === stalePid)
      throw Object.assign(new Error("Fixture encerrada"), { code: "ESRCH" });
    return true;
  });
}

describe("Bloqueio do escritor administrativo", () => {
  it("mantém exclusividade e não remove um sucessor ao repetir a liberação", () => {
    const release = acquireWriterLock(root);
    expect(() => acquireWriterLock(root)).toThrow("escritor");
    release();
    const successor = acquireWriterLock(root);
    release();
    expect(existsSync(file)).toBe(true);
    successor();
    expect(existsSync(file)).toBe(false);
  });
  it("recupera o bloqueio deixado por um processo encerrado", () => {
    deadOwner();
    const release = acquireWriterLock(root);
    expect(readFileSync(file, "utf8")).toBe(String(process.pid));
    release();
  });
  it("repete a aquisição quando o predecessor remove o arquivo antes da leitura", () => {
    writeFileSync(file, String(process.pid));
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      actualFs.unlinkSync(file);
      throw missing();
    });
    const release = acquireWriterLock(root);
    expect(readFileSync(file, "utf8")).toBe(String(process.pid));
    release();
  });
  it("recupera quando outro encerramento remove o arquivo antes da limpeza", () => {
    deadOwner();
    vi.mocked(unlinkSync).mockImplementationOnce(() => {
      actualFs.unlinkSync(file);
      throw missing();
    });
    const release = acquireWriterLock(root);
    expect(readFileSync(file, "utf8")).toBe(String(process.pid));
    release();
  });
  it("não remove um bloqueio que mudou durante a verificação do dono antigo", () => {
    deadOwner();
    vi.mocked(readFileSync)
      .mockImplementationOnce(actualFs.readFileSync)
      .mockImplementationOnce(() => {
        writeFileSync(file, String(process.pid));
        return String(process.pid);
      });
    expect(() => acquireWriterLock(root)).toThrow("escritor");
    expect(readFileSync(file, "utf8")).toBe(String(process.pid));
    expect(unlinkSync).not.toHaveBeenCalled();
  });
  it("tolera remoção concorrente durante o encerramento", () => {
    const release = acquireWriterLock(root);
    vi.mocked(unlinkSync).mockImplementationOnce(() => {
      actualFs.unlinkSync(file);
      throw missing();
    });
    expect(release).not.toThrow();
    expect(release).not.toThrow();
    expect(existsSync(file)).toBe(false);
  });
  it("preserva arquivos inválidos para diagnóstico e recusa a inicialização", () => {
    writeFileSync(file, "inválido");
    expect(() => acquireWriterLock(root)).toThrow("inválido");
    expect(readFileSync(file, "utf8")).toBe("inválido");
  });
  it("aguarda por tempo limitado e continua recusando outro processo ativo", () => {
    writeFileSync(file, String(stalePid));
    vi.spyOn(process, "kill").mockReturnValue(true);
    const wait = vi.spyOn(Atomics, "wait").mockReturnValue("timed-out");
    expect(() => acquireWriterLock(root)).toThrow("escritor");
    expect(wait).toHaveBeenCalledTimes(59);
    expect(readFileSync(file, "utf8")).toBe(String(stalePid));
  });
});
