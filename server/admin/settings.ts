import { z } from "zod";
import { AdminDatabase, digest } from "./database.js";
import { AdminError } from "./errors.js";
import type { SettingDefinition } from "./registry.js";
export class SettingsService {
  private readonly definitions = new Map<string, SettingDefinition>();
  constructor(
    readonly db: AdminDatabase,
    definitions: SettingDefinition[],
  ) {
    for (const setting of definitions) {
      if (this.definitions.has(setting.key))
        throw new Error("Configuração duplicada.");
      setting.schema.parse(setting.defaultValue);
      this.definitions.set(setting.key, setting);
    }
  }
  get<T>(key: string): T {
    const definition = this.definitions.get(key);
    if (!definition) throw new Error("Configuração não registrada.");
    const row = this.db.sql
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key);
    return definition.schema.parse(
      row ? JSON.parse(String(row.value)) : definition.defaultValue,
    ) as T;
  }
  values(namespace: string) {
    return Object.fromEntries(
      [...this.definitions.keys()]
        .filter((key) => key.startsWith(namespace + "."))
        .map((key) => [key, this.get(key)]),
    );
  }
  revision(namespace: string) {
    return digest(JSON.stringify(this.values(namespace)));
  }
  update(
    namespace: string,
    revision: string,
    values: Record<string, unknown>,
    userId: string,
  ) {
    if (
      !Object.keys(values).length ||
      Object.keys(values).some(
        (key) => !key.startsWith(namespace + ".") || !this.definitions.has(key),
      )
    )
      throw new AdminError(
        "VALIDATION_ERROR",
        "Configuração desconhecida ou de infraestrutura. Segredos não são editáveis aqui.",
      );
    const parsed = Object.entries(values).map(
      ([key, value]) =>
        [key, this.definitions.get(key)!.schema.parse(value)] as const,
    );
    this.db.transaction(() => {
      if (revision !== this.revision(namespace))
        throw new AdminError(
          "CONFLICT",
          "Configurações alteradas por outro usuário. Recarregue a página.",
        );
      for (const [key, value] of parsed)
        this.db.sql
          .prepare(
            "INSERT INTO settings VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
          )
          .run(key, JSON.stringify(value), new Date().toISOString());
      this.db.audit(userId, "UPDATE_SETTINGS", namespace);
    });
    return {
      values: this.values(namespace),
      revision: this.revision(namespace),
    };
  }
}
export const generalSettings: SettingDefinition[] = [
  {
    key: "settings.blog.postsPerPage",
    schema: z.number().int().min(6).max(48),
    defaultValue: 12,
  },
  {
    key: "settings.site.tagline",
    schema: z.literal("Tudo sobre música você encontra aqui"),
    defaultValue: "Tudo sobre música você encontra aqui",
  },
];
