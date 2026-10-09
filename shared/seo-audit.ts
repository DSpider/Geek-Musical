import { z } from "zod";
const count = z.number().int().min(0).max(1000000);
export const weeklyAuditSnapshotSchema = z
  .object({
    runId: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),
    finishedAt: z.iso.datetime(),
    origin: z.literal("https://www.geekmusical.com.br"),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    status: z.enum(["validado-em-producao", "parcial", "falhou"]),
    coverage: z
      .object({
        known: count,
        attempted: count,
        analyzed: count,
        editorialKnown: count,
        editorialAnalyzed: count,
        blocked: count,
        pending: count,
      })
      .strict(),
    findings: z
      .object({ P0: count, P1: count, P2: count, P3: count, resolved: count })
      .strict(),
    publishedChanges: count,
    testsPassed: count,
    testsFailed: count,
    paidApiCalls: count,
    googleRequests: count,
    history: z
      .array(
        z
          .object({
            runId: z.string().max(120),
            finishedAt: z.iso.datetime(),
            status: z.enum(["validado-em-producao", "parcial", "falhou"]),
            publishedChanges: count,
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export type WeeklyAuditSnapshot = z.infer<typeof weeklyAuditSnapshotSchema>;
