import type { RequestHandler } from "express";
import type {
  RedirectInput,
  RedirectRecord,
} from "../../../../shared/redirect.js";
import { redirectInputSchema } from "../../../../shared/redirect.js";
import type { PluginContext } from "../../registry.js";
import { AdminError } from "../../errors.js";
import { RedirectRepository } from "./repository.js";
import {
  internalPath,
  normalizeDestination,
  validateGraph,
} from "./validation.js";

export class RedirectService {
  readonly repository: RedirectRepository;
  constructor(readonly ctx: PluginContext) {
    this.repository = new RedirectRepository(ctx.db);
  }
  save(input: RedirectInput, userId: string, id?: string, revision?: string) {
    return this.mutate(
      userId,
      id ? "UPDATE_REDIRECT" : "CREATE_REDIRECT",
      id || null,
      () => {
        const parsed = redirectInputSchema.parse(input);
        const previous = id ? this.repository.get(id) : undefined;
        if (previous && revision !== previous.revision)
          throw new AdminError(
            "CONFLICT",
            "Este redirect mudou. Recarregue a lista antes de editar.",
          );
        const destination = normalizeDestination(parsed.destination, this.ctx);
        const record: RedirectRecord = previous
          ? {
              ...previous,
              ...parsed,
              destination,
              updatedAt: new Date().toISOString(),
            }
          : this.repository.create({ ...parsed, destination });
        validateGraph(
          [...this.repository.all().filter((r) => r.id !== id), record],
          this.ctx,
        );
        this.repository.write(record);
        if (previous && previous.status !== record.status)
          this.ctx.db.audit(
            userId,
            record.status === "active" ? "ENABLE_REDIRECT" : "DISABLE_REDIRECT",
            "redirect",
            record.id,
          );
        return this.repository.get(record.id);
      },
    );
  }
  remove(id: string, revision: string, userId: string) {
    this.mutate(userId, "DELETE_REDIRECT", id, () => {
      const record = this.repository.get(id);
      if (record.revision !== revision)
        throw new AdminError(
          "CONFLICT",
          "Este redirect mudou. Recarregue a lista antes de excluir.",
        );
      if (
        this.repository
          .all()
          .some(
            (r) =>
              r.id !== id &&
              internalPath(r.destination)?.replace(/^\/|\/$/g, "") ===
                record.alias,
          )
      )
        throw new AdminError(
          "CONFLICT",
          "Outro redirect usa este alias como destino. Altere essa relação antes de excluir.",
        );
      this.repository.remove(id);
    });
  }
  private mutate<T>(
    userId: string,
    action: string,
    id: string | null,
    operation: () => T,
  ): T {
    try {
      return this.ctx.db.transaction(() => {
        const output = operation();
        this.ctx.db.audit(
          userId,
          action,
          "redirect",
          id || (output as RedirectRecord)?.id || null,
        );
        return output;
      });
    } catch (error) {
      this.ctx.db.audit(userId, action, "redirect", id, "FAILURE");
      throw error;
    }
  }
  middleware(): RequestHandler {
    return (req, res, next) => {
      if (
        !["GET", "HEAD"].includes(req.method) ||
        !/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(req.path)
      )
        return next();
      const alias = req.path.replace(/^\/|\/$/g, "");
      const record = this.repository.byAlias(alias);
      if (!record || record.status !== "active") return next();
      // Validate only the reachable chain on reads. Fail closed for invalid destinations.
      const chain: RedirectRecord[] = [];
      let current: RedirectRecord | undefined = record;
      while (
        current &&
        chain.length <= 8 &&
        !chain.some((r) => r.id === current!.id)
      ) {
        chain.push(current);
        const target = internalPath(current.destination);
        current = target
          ? this.repository.byAlias(target.replace(/^\/|\/$/g, ""))
          : undefined;
      }
      try {
        validateGraph(chain, this.ctx);
      } catch (error) {
        if (error instanceof AdminError) return next();
        return next(error);
      }
      // Incoming query strings never choose or alter the configured destination.
      res
        .set("Cache-Control", "no-store")
        .set("X-Robots-Tag", "noindex, nofollow")
        .redirect(record.redirectType, record.destination);
    };
  }
}
