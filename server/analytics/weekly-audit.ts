import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { weeklyAuditSnapshotSchema } from "../../shared/seo-audit.js";
export function readWeeklyAuditSnapshot(
  stateDirectory = process.env.STATE_DIRECTORY,
) {
  if (!stateDirectory || !path.isAbsolute(stateDirectory))
    return { snapshot: null, readStatus: "nao-configurado" };
  try {
    const file = path.join(stateDirectory, "seo-audit", "summary.json");
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 65536)
      throw new Error("Invalid snapshot");
    return {
      snapshot: weeklyAuditSnapshotSchema.parse(
        JSON.parse(readFileSync(file, "utf8")),
      ),
      readStatus: "disponivel",
    };
  } catch (error) {
    return {
      snapshot: null,
      readStatus:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "nao-coletado"
          : "invalido",
    };
  }
}
