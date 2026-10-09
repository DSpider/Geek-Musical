let csrfToken = "";
export function setCsrf(token: string) {
  csrfToken = token;
}
export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch("/api/admin" + path, {
    method: options.method || "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal,
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }
        : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = result.error;
    if (
      response.status === 401 &&
      !path.startsWith("/auth/") &&
      window.location.pathname !== "/gm-admin-login"
    )
      window.location.assign("/gm-admin-login");
    const details = error?.fields
      ?.map(
        (field: { path: string; message: string }) =>
          field.path + ": " + field.message,
      )
      .join(" · ");
    throw new AdminApiError(
      error?.code || "INTERNAL_ERROR",
      (error?.message || "Não foi possível concluir a operação.") +
        (details ? " " + details : ""),
    );
  }
  return result as T;
}
