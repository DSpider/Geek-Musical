import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ProviderError } from "../../lib/http.js";

const DAY_MS = 24 * 60 * 60_000;
interface QueueState {
  version: 1;
  starts: number[];
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

// One queue for all Amazon calls made by this Node process. Reservations are
// durable so a restart cannot reset the daily allowance or the last call time.
export class AmazonApiQueue {
  private tail: Promise<void> = Promise.resolve();
  private lastStartedAt = 0;

  constructor(
    private stateFile: string,
    private intervalMs = 1000,
    private dailyLimit = 8640,
  ) {}

  private async readState(): Promise<QueueState> {
    try {
      const data: unknown = JSON.parse(await readFile(this.stateFile, "utf8"));
      if (
        !data ||
        typeof data !== "object" ||
        !("version" in data) ||
        data.version !== 1 ||
        !("starts" in data) ||
        !Array.isArray(data.starts) ||
        !data.starts.every(
          (value) =>
            typeof value === "number" &&
            Number.isSafeInteger(value) &&
            value > 0,
        )
      )
        throw new Error("invalid quota state");
      return data as QueueState;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { version: 1, starts: [] };
      throw new ProviderError("amazon_quota_state_unavailable");
    }
  }

  private async saveState(state: QueueState): Promise<void> {
    const temporary = `${this.stateFile}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await mkdir(path.dirname(this.stateFile), { recursive: true });
      await writeFile(temporary, JSON.stringify(state), {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
      await rename(temporary, this.stateFile);
    } catch {
      throw new ProviderError("amazon_quota_state_unavailable");
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  async run<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      if (signal.aborted) throw signal.reason;
      const state = await this.readState();
      const now = Date.now();
      const recent = state.starts.filter((value) => value > now - DAY_MS);
      if (recent.length >= this.dailyLimit)
        throw new ProviderError("amazon_daily_limit", 429);
      const last = Math.max(recent.at(-1) || 0, this.lastStartedAt);
      while (Date.now() < last + this.intervalMs)
        await wait(last + this.intervalMs - Date.now(), signal);
      if (signal.aborted) throw signal.reason;
      const reservedAt = Date.now();
      await this.saveState({ version: 1, starts: [...recent, reservedAt] });
      if (signal.aborted) throw signal.reason;
      this.lastStartedAt = Date.now();
      return await operation();
    } finally {
      release();
    }
  }
}
