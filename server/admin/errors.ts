import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import type { AdminErrorCode } from "../../shared/admin.js";
const status = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};
const fieldMessages: Record<string, string> = {
  invalid_type: "Tipo de valor inválido.",
  too_small: "Valor abaixo do mínimo permitido.",
  too_big: "Valor acima do máximo permitido.",
  invalid_format: "Formato inválido.",
  invalid_value: "Escolha um valor permitido.",
  unrecognized_keys: "Campo não permitido.",
};
export class AdminError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
  ) {
    super(message);
  }
  get status() {
    return status[this.code];
  }
}
export const adminErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  if (res.headersSent) return;
  if (error instanceof AdminError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Confira os campos informados.",
        fields: error.issues.map((i) => ({
          path: i.path.join("."),
          message:
            i.code === "custom"
              ? i.message
              : fieldMessages[i.code] || "Confira o valor informado.",
        })),
      },
    });
    return;
  }
  const bodyError = error as { type?: string };
  if (
    bodyError?.type === "entity.too.large" ||
    bodyError?.type === "entity.parse.failed"
  ) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "JSON inválido ou requisição muito grande.",
      },
    });
    return;
  }
  // Não registrar payloads, SQL/erros de providers nem credenciais.
  console.error(
    JSON.stringify({
      scope: "admin",
      event: "internal_error",
      errorType: error instanceof Error ? error.name : "unknown",
    }),
  );
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Não foi possível concluir a operação. Tente novamente.",
    },
  });
};
