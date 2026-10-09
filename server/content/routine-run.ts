import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { acquireWriterLock } from "../admin/writer-lock.js";

export const routineSite = "https://www.geekmusical.com.br";
export const routineZone = "America/Sao_Paulo";
export const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function eligibleSlot(now = new Date()) {
  const day = now.toLocaleDateString("en-CA", { timeZone: routineZone });
  const localHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: routineZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  return [1, 3, 5].includes(weekday) && localHour >= 14
    ? day + "T14:00:00-03:00"
    : null;
}
export const runIdFor = (slot: string) => "GM-" + slot.slice(0, 10) + "-1400";
export interface RoutineRun {
  site: string;
  slot: string;
  id: string;
  stage: string;
  attempts: string[];
  packageHash?: string;
  articleId?: string;
  events: { at: string; stage: string; detail: unknown }[];
}
export function writePrivate(file: string, value: unknown) {
  const temp = file + "." + process.pid + ".tmp";
  writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, file);
}
export function lockedRun<T>(
  root: string,
  slot: string,
  action: (run: RoutineRun, folder: string) => Promise<T>,
) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const release = acquireWriterLock(root);
  const folder = path.join(root, "runs", runIdFor(slot));
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, "run.private.json");
  const run: RoutineRun = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {
        site: routineSite,
        slot,
        id: runIdFor(slot),
        stage: "research",
        attempts: [],
        events: [],
      };
  if (run.site !== routineSite || run.slot !== slot) {
    release();
    throw new Error("Identidade editorial divergente.");
  }
  return Promise.resolve()
    .then(() => action(run, folder))
    .finally(() => {
      try {
        writePrivate(file, run);
      } finally {
        release();
      }
    });
}
export function sealPackage(
  run: RoutineRun,
  folder: string,
  packet: { post: { id: string } },
  serialized: string,
) {
  const hash = sha256(serialized);
  if (run.packageHash && run.packageHash !== hash)
    throw new Error("Pacote já selado: retome o mesmo conteúdo e hash.");
  if (run.articleId && run.articleId !== packet.post.id)
    throw new Error("Não troque o artigo da execução.");
  if (!run.packageHash)
    writeFileSync(path.join(folder, "package.private.json"), serialized, {
      mode: 0o600,
      flag: "wx",
    });
  run.packageHash = hash;
  run.articleId = packet.post.id;
  return hash;
}
export function recordStage(run: RoutineRun, stage: string, detail: unknown) {
  run.stage = stage;
  run.events.push({ at: new Date().toISOString(), stage, detail });
}
