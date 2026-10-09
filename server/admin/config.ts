import path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { WebConfig } from "../config.js";
export interface AdminConfig {
  enabled: boolean;
  databaseFile: string;
  contentRoot: string;
  sessionSecret: string;
  sessionHours: number;
  idleMinutes: number;
}
export function adminConfig(
  web: WebConfig,
  env: NodeJS.ProcessEnv = process.env,
): AdminConfig {
  const development =
    (web.environment || (web.production ? "production" : "development")) ===
    "development";
  const enabled = env.ADMIN_ENABLED
    ? env.ADMIN_ENABLED === "true"
    : development;
  if (env.ADMIN_ENABLED && !["true", "false"].includes(env.ADMIN_ENABLED))
    throw new Error("ADMIN_ENABLED aceita true/false.");
  if (
    enabled &&
    !development &&
    (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
  )
    throw new Error(
      "Admin habilitado exige SESSION_SECRET com pelo menos 32 caracteres fora de DEV.",
    );
  const settings = z
    .object({
      sessionHours: z.coerce.number().int().min(1).max(48),
      idleMinutes: z.coerce.number().int().min(5).max(2880),
    })
    .parse({
      sessionHours: env.ADMIN_SESSION_HOURS || 48,
      idleMinutes: env.ADMIN_IDLE_MINUTES || 2880,
    });
  const databaseFile = path.resolve(
    env.ADMIN_DATABASE_FILE ||
      path.join(env.STATE_DIRECTORY || "artifacts", "admin", "admin.sqlite"),
  );
  const contentRoot = path.resolve(env.ADMIN_CONTENT_ROOT || "content");
  const canonical = (value: string) =>
    process.platform === "win32" ? value.toLowerCase() : value;
  const clientRoots = ["public", "src", "dist/client"].map((value) =>
    canonical(path.resolve(value)),
  );
  if (
    [databaseFile, contentRoot].some((value) =>
      clientRoots.some(
        (root) =>
          canonical(value) === root ||
          canonical(value).startsWith(root + path.sep),
      ),
    )
  )
    throw new Error(
      "Banco e conteúdo administrativo devem ficar fora dos diretórios públicos.",
    );
  return {
    enabled,
    databaseFile,
    contentRoot,
    sessionSecret: env.SESSION_SECRET || randomBytes(48).toString("base64url"),
    ...settings,
  };
}
