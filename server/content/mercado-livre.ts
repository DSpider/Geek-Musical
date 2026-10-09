import { createHash, randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
  unlinkSync,
} from "node:fs";
import { z } from "zod";
import type { PluginContext } from "../admin/registry.js";
import { AdminError } from "../admin/errors.js";
import { fetchJson, ProviderError } from "../lib/http.js";
import { affiliateStore } from "./affiliate.js";
import type { Observation } from "./offer-checks.js";

export const mercadoLivreCallback = "/integracoes/mercado-livre/retorno";
const tokenSchema = z
  .object({
    clientId: z.string(),
    accessToken: z.string().min(8),
    refreshToken: z.string().min(8),
    expiresAt: z.number(),
    connectedAt: z.string(),
    userId: z.number().int().positive(),
  })
  .strict();
type Tokens = z.infer<typeof tokenSchema>;
interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number;
}
export class MercadoLivreConnection {
  private attempts = new Map<
    string,
    { verifier: string; expires: number; userId: string }
  >();
  private refreshing?: Promise<string>;
  private renewalFailed = false;
  readonly file: string;
  constructor(
    readonly ctx: Pick<PluginContext, "web" | "db">,
    readonly env: NodeJS.ProcessEnv = process.env,
    readonly now = () => Date.now(),
  ) {
    this.file = path.resolve(
      env.MERCADOLIVRE_CREDENTIALS_FILE ||
        path.join(
          homedir(),
          ".geek-musical-private",
          `mercado-livre-${ctx.web.environment || "development"}.json`,
        ),
    );
    const relative = path.relative(process.cwd(), this.file);
    if (
      !relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative)
    )
      throw new Error(
        "Credenciais Mercado Livre exigem arquivo privado fora do repositório.",
      );
  }
  private directory() {
    let directory = path.dirname(this.file);
    while (true) {
      if (
        existsSync(directory) &&
        (!lstatSync(directory).isDirectory() ||
          lstatSync(directory).isSymbolicLink())
      )
        throw new ProviderError("credential_storage");
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    const parent = path.dirname(this.file);
    if (
      existsSync(parent) &&
      process.platform !== "win32" &&
      lstatSync(parent).mode & 0o077
    )
      throw new ProviderError("credential_storage");
  }
  private read(): Tokens | undefined {
    this.directory();
    if (!existsSync(this.file)) return;
    const stat = lstatSync(this.file);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.size > 20000 ||
      (process.platform !== "win32" && stat.mode & 0o077)
    )
      throw new ProviderError("credential_storage");
    const token = tokenSchema.parse(
      JSON.parse(readFileSync(this.file, "utf8")),
    );
    if (token.clientId !== this.env.MERCADOLIVRE_CLIENT_ID)
      throw new ProviderError("credential_account_mismatch");
    return token;
  }
  private write(token: Tokens) {
    this.directory();
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = this.file + "." + randomUUID() + ".tmp";
    try {
      writeFileSync(temporary, JSON.stringify(tokenSchema.parse(token)), {
        mode: 0o600,
        flag: "wx",
      });
      const handle = openSync(temporary, "r+");
      try {
        fsyncSync(handle);
      } finally {
        closeSync(handle);
      }
      renameSync(temporary, this.file);
      chmodSync(this.file, 0o600);
      if (process.platform !== "win32") {
        const dir = openSync(path.dirname(this.file), "r");
        try {
          fsyncSync(dir);
        } finally {
          closeSync(dir);
        }
      }
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  status() {
    let token: Tokens | undefined,
      error = false;
    try {
      token = this.read();
    } catch {
      error = true;
    }
    return {
      configured: !!(
        this.env.MERCADOLIVRE_CLIENT_ID && this.env.MERCADOLIVRE_CLIENT_SECRET
      ),
      connected: (!!token || !!this.env.MERCADOLIVRE_ACCESS_TOKEN) && !error,
      error: error || this.renewalFailed,
      connectedAt: token?.connectedAt || null,
      expiresAt: token ? new Date(token.expiresAt).toISOString() : null,
      credentialsReference:
        "MERCADOLIVRE_CLIENT_ID / MERCADOLIVRE_CLIENT_SECRET / arquivo privado",
      environment: this.ctx.web.environment || "development",
    };
  }
  begin(userId: string) {
    if (this.ctx.web.environment !== "production")
      throw new AdminError(
        "VALIDATION_ERROR",
        "Conecte a conta pela Administração de produção. Homologação usa fixtures.",
      );
    if (!this.status().configured)
      throw new AdminError(
        "VALIDATION_ERROR",
        "Configure as referências privadas das credenciais no backend.",
      );
    if (this.status().connected)
      throw new AdminError(
        "CONFLICT",
        "A conta já está conectada. A conexão existente foi preservada.",
      );
    for (const [key, attempt] of this.attempts)
      if (attempt.expires < this.now() || attempt.userId === userId)
        this.attempts.delete(key);
    if (this.attempts.size >= 8)
      throw new AdminError(
        "RATE_LIMITED",
        "Aguarde antes de iniciar outra conexão.",
      );
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(48).toString("base64url");
    this.attempts.set(state, {
      verifier,
      expires: this.now() + 30 * 60000,
      userId,
    });
    const url = new URL("https://auth.mercadolivre.com.br/authorization");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.env.MERCADOLIVRE_CLIENT_ID!,
      redirect_uri: this.ctx.web.siteUrl + mercadoLivreCallback,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    this.ctx.db.audit(userId, "BEGIN_MERCADOLIVRE_CONNECTION", "posts");
    return url.href;
  }
  private async exchange(
    fields: Record<string, string>,
    signal: AbortSignal,
  ): Promise<TokenResponse> {
    return fetchJson<TokenResponse>(
      "https://api.mercadolibre.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: this.env.MERCADOLIVRE_CLIENT_ID!,
          client_secret: this.env.MERCADOLIVRE_CLIENT_SECRET!,
          ...fields,
        }),
      },
      signal,
    );
  }
  private install(
    response: TokenResponse,
    connectedAt = new Date(this.now()).toISOString(),
  ) {
    if (
      !response.access_token ||
      !response.refresh_token ||
      !response.user_id ||
      !response.expires_in ||
      response.expires_in > 86400 ||
      response.expires_in < 60
    )
      throw new ProviderError("invalid_auth_response");
    const token: Tokens = {
      clientId: this.env.MERCADOLIVRE_CLIENT_ID!,
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      userId: response.user_id,
      expiresAt: this.now() + response.expires_in * 1000,
      connectedAt,
    };
    this.write(token);
    return token.accessToken;
  }
  async complete(state: string, code: string) {
    const attempt = this.attempts.get(state);
    this.attempts.delete(state);
    if (
      !attempt ||
      attempt.expires < this.now() ||
      !code ||
      code.length > 2000 ||
      this.status().connected
    )
      throw new ProviderError("invalid_oauth_state");
    const response = await this.exchange(
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: this.ctx.web.siteUrl + mercadoLivreCallback,
        code_verifier: attempt.verifier,
      },
      AbortSignal.timeout(15000),
    );
    this.install(response);
    this.ctx.db.audit(attempt.userId, "CONNECT_MERCADOLIVRE", "posts");
  }
  async token(signal: AbortSignal, rejectedAccessToken?: string) {
    const current = this.read();
    if (!current) {
      if (this.env.MERCADOLIVRE_ACCESS_TOKEN)
        return this.env.MERCADOLIVRE_ACCESS_TOKEN;
      throw new ProviderError("unconfigured");
    }
    if (
      current.expiresAt > this.now() + 60000 &&
      current.accessToken !== rejectedAccessToken
    )
      return current.accessToken;
    if (this.renewalFailed)
      throw new ProviderError("credential_renewal_pending");
    if (this.refreshing) return this.refreshing;
    // Rotating refresh tokens have one writer; never share the file across environments.
    this.refreshing = (async () => {
      let response: TokenResponse;
      try {
        response = await this.exchange(
          { grant_type: "refresh_token", refresh_token: current.refreshToken },
          signal,
        );
      } catch (error) {
        if (
          error instanceof ProviderError &&
          [400, 401].includes(error.status || 0)
        )
          this.renewalFailed = true;
        throw error;
      }
      if (response.user_id !== current.userId)
        throw new ProviderError("credential_account_mismatch");
      return this.install(response, current.connectedAt);
    })().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }
  async productImage(
    productUrl: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    if (affiliateStore(productUrl) !== "mercado-livre") return null;
    const url = new URL(productUrl);
    const product = url.pathname.match(/\/p\/(MLB\d+)(?:\/|$)/)?.[1];
    const item = url.pathname.match(/\/MLB-?(\d+)/)?.[1];
    const id = product || (item ? "MLB" + item : null);
    if (!id) return null;
    const token = await this.token(signal);
    const result = await fetchJson<{
      id?: string;
      pictures?: Array<{ secure_url?: string; url?: string }>;
      thumbnail?: string;
    }>(
      `https://api.mercadolibre.com/${product ? "products" : "items"}/${id}`,
      { headers: { Authorization: `Bearer ${token}` } },
      signal,
    );
    if (result.id !== id) throw new ProviderError("invalid_response");
    const image =
      result.pictures?.[0]?.secure_url ||
      result.pictures?.[0]?.url ||
      result.thumbnail;
    if (!image) return null;
    const parsed = new URL(image);
    return parsed.protocol === "https:" &&
      !parsed.port &&
      !parsed.username &&
      !parsed.password &&
      (parsed.hostname === "mlstatic.com" ||
        parsed.hostname.endsWith(".mlstatic.com"))
      ? image
      : null;
  }
  async observe(productUrl: string, signal: AbortSignal): Promise<Observation> {
    const base: Observation = {
      status: "product_pending",
      stock: "unknown",
      checkedAt: new Date(this.now()).toISOString(),
      validUntil: null,
    };
    if (!this.status().connected && !this.env.MERCADOLIVRE_ACCESS_TOKEN)
      return { ...base, status: "credentials_pending" };
    if (affiliateStore(productUrl) !== "mercado-livre") return base;
    const url = new URL(productUrl),
      productId = url.pathname.match(/\/p\/(MLB\d+)(?:\/|$)/)?.[1],
      itemId = url.pathname.match(/\/MLB-(\d+).*_JM$/)?.[1];
    const identity = productId || (itemId ? "MLB" + itemId : null);
    if (!identity) return base;
    const token = await this.token(signal);
    type Listing = {
      id?: string;
      status?: string;
      available_quantity?: number;
      buy_box_winner?: { available_quantity?: number; currency_id?: string };
      currency_id?: string;
    };
    const result = await fetchJson<Listing>(
      `https://api.mercadolibre.com/${productId ? "products" : "items"}/${identity}`,
      { headers: { Authorization: `Bearer ${token}` } },
      signal,
    );
    if (result.id !== identity) throw new ProviderError("invalid_response");
    const selected = productId ? result.buy_box_winner : result;
    if (selected?.currency_id && selected.currency_id !== "BRL")
      throw new ProviderError("unsupported_currency");
    const quantity = selected?.available_quantity;
    const stock =
      result.status === "active" &&
      typeof quantity === "number" &&
      Number.isFinite(quantity) &&
      quantity >= 0
        ? quantity > 0
          ? "in_stock"
          : "out_of_stock"
        : "unknown";
    return {
      ...base,
      status:
        result.status === "active" && selected
          ? stock === "unknown"
            ? "offer_available"
            : "confirmed"
          : "unavailable",
      stock,
      validUntil: new Date(this.now() + 300000).toISOString(),
    };
  }
}
const connections = new WeakMap<PluginContext, MercadoLivreConnection>();
export function mercadoLivreConnection(ctx: PluginContext) {
  let connection = connections.get(ctx);
  if (!connection) {
    connection = new MercadoLivreConnection(ctx);
    connections.set(ctx, connection);
  }
  return connection;
}
