import "../config.js";
import { config } from "../config.js";
import { adminConfig } from "./config.js";
import { AdminDatabase } from "./database.js";
import { builtinPlugins } from "./plugins/index.js";
import { upsertAdminUser } from "./auth.js";
import { createInterface } from "node:readline/promises";
import { cpSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { readSourceContent } from "../content/catalog.js";
const command = process.argv[2];
const options = adminConfig(config.web);
const db = new AdminDatabase(options.databaseFile);
try {
  builtinPlugins().initialize(db);
  if (command === "migrate")
    console.log("Migrations administrativas aplicadas com sucesso.");
  else if (command === "content-init") {
    const sourceRoot = path.resolve("content");
    if (sourceRoot === options.contentRoot)
      console.log("DEV já usa content/ como fonte editorial única.");
    else {
      readSourceContent(sourceRoot);
      if (
        existsSync(options.contentRoot) &&
        readdirSync(options.contentRoot).length
      )
        throw new Error(
          "Destino editorial já contém dados. Não sobrescrevemos conteúdo existente.",
        );
      mkdirSync(options.contentRoot, { recursive: true, mode: 0o700 });
      cpSync(sourceRoot, options.contentRoot, {
        recursive: true,
        filter: (source) =>
          !source.endsWith(".lock") && !source.endsWith(".tmp"),
      });
      readSourceContent(options.contentRoot);
      console.log(
        "Fonte editorial persistente inicializada. Preserve-a em releases e backups.",
      );
    }
  } else if (command === "user") {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      const email =
        process.env.ADMIN_USER_EMAIL || (await rl.question("E-mail: "));
      const name = process.env.ADMIN_USER_NAME || (await rl.question("Nome: "));
      const role =
        process.env.ADMIN_USER_ROLE ||
        (await rl.question("Perfil (super_admin/admin/editor/seo): "));
      let password = process.env.ADMIN_USER_PASSWORD;
      delete process.env.ADMIN_USER_PASSWORD;
      if (!password) {
        rl.close();
        if (!process.stdin.isTTY)
          throw new Error(
            "Informe a senha pela variável temporária ADMIN_USER_PASSWORD ou terminal interativo.",
          );
        process.stdout.write("Senha (mínimo 15 caracteres; entrada oculta): ");
        password = await new Promise<string>((resolve, reject) => {
          let value = "";
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.setEncoding("utf8");
          const cleanup = () => {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.off("data", receive);
            process.stdout.write("\n");
          };
          const receive = (data: string) => {
            for (const character of data) {
              if (character === "\u0003") {
                cleanup();
                reject(new Error("Operação cancelada."));
                return;
              }
              if (character === "\r" || character === "\n") {
                cleanup();
                resolve(value);
                return;
              }
              if (character === "\u007f" || character === "\b")
                value = value.slice(0, -1);
              else if (character >= " ") value += character;
            }
          };
          process.stdin.on("data", receive);
        });
      }
      await upsertAdminUser(
        db,
        { email, name, role, password },
        process.argv.includes("--update"),
      );
      password = "";
      console.log(
        "Usuário administrativo salvo; sessões anteriores revogadas. Nenhuma senha exibida.",
      );
    } finally {
      rl.close();
    }
  } else throw new Error("Use admin:migrate ou admin:user [-- --update].");
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Não foi possível executar o comando administrativo.",
  );
  process.exitCode = 1;
} finally {
  db.close();
}
