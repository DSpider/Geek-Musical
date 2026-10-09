import { GoogleAuth } from "google-auth-library";
import type { AnalyticsConfig } from "./config.js";
import { AnalyticsError } from "./errors.js";

export const googleScopes = {
  searchRead: "https://www.googleapis.com/auth/webmasters.readonly",
  searchWrite: "https://www.googleapis.com/auth/webmasters",
  analyticsRead: "https://www.googleapis.com/auth/analytics.readonly",
} as const;
export interface GoogleTransport {
  request(
    scope: string,
    method: "GET" | "POST" | "PUT",
    url: string,
    body?: unknown,
  ): Promise<unknown>;
}
export class OfficialGoogleTransport implements GoogleTransport {
  private readonly auth = new Map<string, GoogleAuth>();
  constructor(
    private readonly options: AnalyticsConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async request(
    scope: string,
    method: "GET" | "POST" | "PUT",
    url: string,
    body?: unknown,
  ) {
    const target = new URL(url);
    if (
      !new Set([
        "https://www.googleapis.com",
        "https://searchconsole.googleapis.com",
        "https://analyticsdata.googleapis.com",
      ]).has(target.origin)
    )
      throw new AnalyticsError(
        "INVALID_ENDPOINT",
        "Endpoint Google não permitido.",
      );
    let token: string | null | undefined;
    try {
      let auth = this.auth.get(scope);
      if (!auth) {
        auth = new GoogleAuth({
          scopes: [scope],
          clientOptions: {
            transporterOptions: {
              timeout: this.options.timeoutMs,
              retry: false,
            },
          },
          ...(this.options.credentialsFile
            ? { keyFilename: this.options.credentialsFile }
            : {}),
        });
        this.auth.set(scope, auth);
      }
      token = await auth.getAccessToken();
      if (!token) throw new Error();
    } catch {
      throw new AnalyticsError(
        "GOOGLE_AUTH_ERROR",
        "Credencial Google indisponível ou sem autorização. Configure ADC ou um arquivo privado válido.",
      );
    }
    // Bounded retry only for transient errors. No response bodies or tokens enter logs.
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method,
          redirect: "error",
          signal: AbortSignal.timeout(this.options.timeoutMs),
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/json",
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch {
        throw new AnalyticsError(
          "GOOGLE_NETWORK_ERROR",
          "A API Google não respondeu dentro do limite. Tente novamente depois.",
        );
      }
      if (response.ok) {
        if (response.status === 204) return {};
        const text = await response.text();
        try {
          return text ? (JSON.parse(text) as unknown) : {};
        } catch {
          throw new AnalyticsError(
            "GOOGLE_INVALID_RESPONSE",
            "A API Google retornou uma resposta inválida.",
          );
        }
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
        continue;
      }
      throw new AnalyticsError(
        response.status === 401
          ? "GOOGLE_UNAUTHORIZED"
          : response.status === 403
            ? "GOOGLE_FORBIDDEN"
            : response.status === 429
              ? "GOOGLE_QUOTA"
              : "GOOGLE_API_ERROR",
        "A API Google recusou a operação (HTTP " +
          response.status +
          "). Confira acesso à propriedade, API habilitada e cotas.",
      );
    }
    throw new AnalyticsError("GOOGLE_API_ERROR", "API Google indisponível.");
  }
}
