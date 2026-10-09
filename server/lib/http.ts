export class ProviderError extends Error {
  constructor(
    public code: string,
    public status?: number,
    public retryAfterMs?: number,
  ) {
    super(code);
  }
}
export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { ...init, signal, redirect: "error" });
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const delay =
      retry === null
        ? undefined
        : /^\d+$/.test(retry)
          ? Number(retry) * 1000
          : Math.max(0, Date.parse(retry) - Date.now());
    throw new ProviderError(
      "upstream_http",
      response.status,
      delay !== undefined && Number.isFinite(delay)
        ? Math.min(24 * 3600000, delay)
        : undefined,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderError("invalid_json");
  }
}
// No prompts, headers, credentials or upstream response bodies enter the logs.
export function logFailure(provider: string, error: unknown) {
  const code =
    error instanceof ProviderError
      ? error.code
      : error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
        ? "timeout"
        : "provider_failure";
  console.warn(
    JSON.stringify({
      level: "warn",
      provider,
      code,
      status: error instanceof ProviderError ? error.status : undefined,
      time: new Date().toISOString(),
    }),
  );
}
export function publicError(error: unknown): string {
  if (
    error instanceof ProviderError &&
    error.code === "integration_daily_limit"
  )
    return "Esta loja atingiu o limite diário definido no painel. As demais continuam disponíveis.";
  if (error instanceof ProviderError && error.code === "unconfigured")
    return "Esta loja ainda precisa de configuração.";
  if (
    error instanceof Error &&
    ["TimeoutError", "AbortError"].includes(error.name)
  )
    return "A loja demorou para responder. Tente novamente em instantes.";
  if (error instanceof ProviderError && error.status === 429)
    return error.code === "amazon_daily_limit"
      ? "A Amazon atingiu o limite diário de consultas. As demais lojas continuam disponíveis."
      : "A loja atingiu o limite temporário de consultas.";
  return "Não foi possível consultar esta loja agora. As demais continuam disponíveis.";
}
