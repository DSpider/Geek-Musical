import { z } from "zod";
export interface AwinConfig {
  publisherId: number;
  apiToken: string;
  feedKey: string;
  maxDownloadBytes: number;
  maxExpandedBytes: number;
  timeoutMs: number;
}
export function awinConfig(env: NodeJS.ProcessEnv = process.env): AwinConfig {
  const publisherId = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(env.AWIN_PUBLISHER_ID || "1959229");
  if (!publisherId.success)
    throw new Error("AWIN_PUBLISHER_ID deve ser um ID válido de publisher.");
  return {
    publisherId: publisherId.data,
    apiToken: env.AWIN_API_TOKEN || "",
    feedKey: env.AWIN_FEED_API_KEY || "",
    maxDownloadBytes: 128 * 1024 * 1024,
    maxExpandedBytes: 512 * 1024 * 1024,
    timeoutMs: 180000,
  };
}
