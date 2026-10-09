export class AnalyticsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function safeAnalyticsError(error: unknown) {
  return error instanceof AnalyticsError
    ? { code: error.code, message: error.message }
    : {
        code: "INTERNAL_ERROR",
        message:
          "Não foi possível concluir a operação de Analytics. Verifique a configuração e tente novamente.",
      };
}
