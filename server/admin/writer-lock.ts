import {
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
// Markdown/JSON têm um único escritor. O SQLite pode ser usado também pelo CLI.
export function acquireWriterLock(contentRoot: string) {
  const file = path.join(contentRoot, ".gm-admin-writer.lock");
  const pause = new Int32Array(new SharedArrayBuffer(4));
  const readOwner = () => {
    try {
      return readFileSync(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };
  const acquire = () => {
    const descriptor = openSync(file, "wx", 0o600);
    try {
      writeFileSync(descriptor, String(process.pid));
    } finally {
      closeSync(descriptor);
    }
  };
  // O watcher pode iniciar o sucessor enquanto o processo anterior está saindo.
  // Espera limitada no bootstrap, preservando a recusa de um proprietário ativo.
  for (let attempt = 0; ; attempt++) {
    if (attempt === 60)
      throw new Error(
        "Não foi possível obter o bloqueio editorial. Tente iniciar novamente.",
      );
    try {
      acquire();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const owner = readOwner();
    if (owner === undefined) continue;
    const pid = Number(owner);
    // Outro processo pode ainda estar preenchendo o arquivo recém-criado.
    if (!owner && attempt < 59) {
      Atomics.wait(pause, 0, 0, 50);
      continue;
    }
    if (!Number.isSafeInteger(pid) || pid < 1)
      throw new Error(
        "Lock editorial inválido. Revise o arquivo privado antes de iniciar.",
      );
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (probe) {
      if ((probe as NodeJS.ErrnoException).code !== "ESRCH") throw probe;
      alive = false;
    }
    if (alive) {
      if (pid !== process.pid && attempt < 59) {
        Atomics.wait(pause, 0, 0, 50);
        continue;
      }
      throw new Error(
        "Já existe um escritor administrativo neste conteúdo. Não execute múltiplas instâncias.",
      );
    }
    if (readOwner() !== owner) continue;
    try {
      unlinkSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  let released = false;
  return () => {
    if (released) return;
    if (readOwner() === String(process.pid)) {
      try {
        unlinkSync(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    released = true;
  };
}
