import {
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import {
  loginSchema,
  passwordSchema,
  type AdminUser,
} from "../../shared/admin.js";
import type { AdminConfig } from "./config.js";
import type { WebConfig } from "../config.js";
import { AdminDatabase, digest } from "./database.js";
import { AdminError } from "./errors.js";
import { workLimiter } from "../security.js";

// Uma das configurações mínimas equivalentes de scrypt da OWASP: 32 MiB, p=3.
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
export async function hashPassword(password: string) {
  passwordSchema.parse(password);
  const salt = randomBytes(16).toString("hex");
  return `scrypt:32768:8:3:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded?: string) {
  const parts = (encoded || "").split(":");
  const valid =
    parts.length === 6 &&
    parts.slice(0, 4).join(":") === "scrypt:32768:8:3" &&
    /^[a-f0-9]{32}$/.test(parts[4]) &&
    /^[a-f0-9]{128}$/.test(parts[5]);
  // Usuário inexistente/inativo executa o mesmo trabalho e recebe o mesmo erro.
  const actual = await derive(password, valid ? parts[4] : "0".repeat(32));
  return (
    timingSafeEqual(
      actual,
      Buffer.from(valid ? parts[5] : "0".repeat(128), "hex"),
    ) && valid
  );
}
export function adminUser(res: Response): AdminUser {
  return res.locals.adminUser as AdminUser;
}
export function can(user: AdminUser, permission: string) {
  return (
    user.permissions.includes("*") || user.permissions.includes(permission)
  );
}

export class AdminAuth {
  private readonly acquire = workLimiter(2);
  readonly secure: boolean;
  readonly cookieName: string;
  constructor(
    readonly db: AdminDatabase,
    readonly settings: AdminConfig,
    readonly web: WebConfig,
  ) {
    this.secure =
      (web.environment || (web.production ? "production" : "development")) !==
      "development";
    this.cookieName = this.secure ? "__Host-gm_admin" : "gm_admin_dev";
  }
  private mac(text: string) {
    return createHmac("sha256", this.settings.sessionSecret)
      .update(text)
      .digest("hex");
  }
  private raw(req: Request) {
    const cookies = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(this.cookieName + "="));
    if (cookies.length !== 1) return undefined;
    const token = cookies[0].slice(this.cookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
  }
  private lookup(req: Request) {
    const token = this.raw(req);
    if (!token) return undefined;
    const now = Date.now();
    const row = this.db.sql
      .prepare("SELECT * FROM sessions WHERE token_hash=?")
      .get(digest(token));
    if (
      !row ||
      Number(row.expires_at) <= now ||
      Number(row.last_seen) < now - this.settings.idleMinutes * 60000
    ) {
      if (row)
        this.db.sql
          .prepare("DELETE FROM sessions WHERE token_hash=?")
          .run(digest(token));
      return undefined;
    }
    return {
      token,
      userId: row.user_id as string | null,
      expires: Number(row.expires_at),
    };
  }
  private setCookie(res: Response, token: string, maxAge: number) {
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: this.secure,
      sameSite: "strict",
      path: "/",
      maxAge,
    });
  }
  private create(req: Request, res: Response, userId: string | null) {
    const token = randomBytes(32).toString("hex");
    const now = Date.now();
    const maxAge = userId ? this.settings.sessionHours * 3600000 : 10 * 60000;
    this.db.transaction(() => {
      const previous = this.raw(req);
      if (previous)
        this.db.sql
          .prepare("DELETE FROM sessions WHERE token_hash=?")
          .run(digest(previous));
      this.db.sql
        .prepare("DELETE FROM sessions WHERE expires_at<=? OR last_seen<?")
        .run(now, now - this.settings.idleMinutes * 60000);
      // Limite global de sessões pré-login; não expulsa sessões autenticadas.
      this.db.sql
        .prepare(
          "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE user_id IS NULL ORDER BY last_seen DESC LIMIT -1 OFFSET 5000)",
        )
        .run();
      this.db.sql
        .prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)")
        .run(digest(token), userId, now + maxAge, now);
    });
    this.setCookie(res, token, maxAge);
    return this.mac("csrf:" + token);
  }
  csrf(req: Request, res: Response) {
    const session = this.lookup(req);
    return session
      ? this.mac("csrf:" + session.token)
      : this.create(req, res, null);
  }
  readonly transport: RequestHandler = (req, _res, next) => {
    if (this.secure && !req.secure)
      return next(
        new AdminError(
          "FORBIDDEN",
          "A administração exige HTTPS neste ambiente.",
        ),
      );
    next();
  };
  readonly csrfGuard: RequestHandler = (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    // Origin obrigatório inclusive no login. SameSite complementa o token.
    const origins = new Set([this.web.siteUrl]);
    if (!this.secure) {
      origins.add(`http://localhost:${this.web.port}`);
      origins.add(`http://127.0.0.1:${this.web.port}`);
    }
    if (
      !origins.has(req.get("Origin") || "") ||
      req.get("Sec-Fetch-Site") === "cross-site"
    )
      return next(new AdminError("FORBIDDEN", "Origem não permitida."));
    const session = this.lookup(req);
    const sent = req.get("X-CSRF-Token") || "";
    if (
      !session ||
      !/^[a-f0-9]{64}$/.test(sent) ||
      !timingSafeEqual(
        Buffer.from(sent),
        Buffer.from(this.mac("csrf:" + session.token)),
      )
    )
      return next(
        new AdminError(
          "FORBIDDEN",
          "Sessão de formulário expirada. Recarregue a página.",
        ),
      );
    next();
  };
  user(req: Request): AdminUser | undefined {
    const session = this.lookup(req);
    if (!session?.userId) return undefined;
    const row = this.db.sql
      .prepare(
        "SELECT id, email, name, role_id FROM users WHERE id=? AND active=1",
      )
      .get(session.userId);
    if (!row) return undefined;
    this.db.sql
      .prepare("UPDATE sessions SET last_seen=? WHERE token_hash=?")
      .run(Date.now(), digest(session.token));
    const permissions = this.db.sql
      .prepare("SELECT permission FROM role_permissions WHERE role_id=?")
      .all(String(row.role_id))
      .map((p) => String(p.permission));
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      role: String(row.role_id),
      permissions,
    };
  }
  require(permission?: string): RequestHandler {
    return (req, res, next) => {
      const user = this.user(req);
      if (!user)
        return next(
          new AdminError("UNAUTHORIZED", "Entre para acessar a administração."),
        );
      if (permission && !can(user, permission)) {
        this.db.audit(
          user.id,
          "ACCESS_DENIED",
          "permission",
          permission,
          "FAILURE",
        );
        return next(
          new AdminError(
            "FORBIDDEN",
            "Você não tem permissão para esta operação.",
          ),
        );
      }
      res.locals.adminUser = user;
      next();
    };
  }
  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body);
    const ip = ipKeyGenerator(req.ip || req.socket.remoteAddress || "unknown");
    const ipKey = this.mac("ip:" + ip);
    const pairKey = this.mac("pair:" + ip + ":" + input.email);
    const now = Date.now();
    this.db.sql
      .prepare(
        "DELETE FROM login_attempts WHERE first_at<? AND blocked_until<?",
      )
      .run(now - 15 * 60000, now);
    for (const key of [ipKey, pairKey]) {
      const row = this.db.sql
        .prepare("SELECT blocked_until FROM login_attempts WHERE key=?")
        .get(key);
      if (row && Number(row.blocked_until) > now) {
        res.set(
          "Retry-After",
          String(Math.ceil((Number(row.blocked_until) - now) / 1000)),
        );
        this.db.audit(null, "LOGIN_THROTTLED", "auth", null, "FAILURE");
        throw new AdminError(
          "RATE_LIMITED",
          "Aguarde antes de tentar entrar novamente.",
        );
      }
    }
    const release = this.acquire();
    if (!release) {
      res.set("Retry-After", "3");
      throw new AdminError(
        "RATE_LIMITED",
        "Há acessos em andamento. Tente novamente em instantes.",
      );
    }
    try {
      const row = this.db.sql
        .prepare("SELECT id, password_hash, active FROM users WHERE email=?")
        .get(input.email);
      const verified = await verifyPassword(
        input.password,
        row?.active ? String(row.password_hash) : undefined,
      );
      if (!verified || !row) {
        this.db.transaction(() => {
          for (const [key, threshold] of [
            [pairKey, 3],
            [ipKey, 15],
          ] as const) {
            const attempt = this.db.sql
              .prepare("SELECT failures FROM login_attempts WHERE key=?")
              .get(key);
            const failures = Number(attempt?.failures || 0) + 1;
            const delay =
              failures >= threshold
                ? Math.min(60000, 1000 * 2 ** Math.min(6, failures - threshold))
                : 0;
            this.db.sql
              .prepare(
                "INSERT INTO login_attempts VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET failures=excluded.failures, blocked_until=excluded.blocked_until",
              )
              .run(key, failures, now, now + delay);
          }
          this.db.audit(null, "LOGIN_FAILED", "auth", null, "FAILURE");
        });
        throw new AdminError("UNAUTHORIZED", "E-mail ou senha inválidos.");
      }
      this.db.sql
        .prepare("DELETE FROM login_attempts WHERE key=?")
        .run(pairKey);
      const csrfToken = this.create(req, res, String(row.id));
      this.db.audit(String(row.id), "LOGIN", "auth");
      return { csrfToken };
    } finally {
      release();
    }
  }
  logout(req: Request, res: Response) {
    const user = this.user(req);
    const token = this.raw(req);
    if (token)
      this.db.sql
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(digest(token));
    res.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.secure,
      sameSite: "strict",
      path: "/",
    });
    this.db.audit(user?.id || null, "LOGOUT", "auth");
  }
}
export async function upsertAdminUser(
  db: AdminDatabase,
  input: { email: string; name: string; password: string; role: string },
  update = false,
) {
  const email = loginSchema.shape.email.parse(input.email);
  const name = input.name.trim();
  if (
    name.length < 2 ||
    name.length > 100 ||
    !db.sql.prepare("SELECT id FROM roles WHERE id=?").get(input.role)
  )
    throw new AdminError("VALIDATION_ERROR", "Nome ou perfil inválido.");
  const hash = await hashPassword(input.password);
  return db.transaction(() => {
    const existing = db.sql
      .prepare("SELECT id FROM users WHERE email=?")
      .get(email);
    if (existing && !update)
      throw new AdminError(
        "CONFLICT",
        "Usuário já cadastrado. Use o comando de atualização.",
      );
    const id = existing ? String(existing.id) : randomUUID();
    const now = new Date().toISOString();
    db.sql
      .prepare(
        "INSERT INTO users VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(email) DO UPDATE SET name=excluded.name, password_hash=excluded.password_hash, role_id=excluded.role_id, active=1, updated_at=excluded.updated_at",
      )
      .run(id, email, name, hash, input.role, now, now);
    db.sql.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    db.audit(
      null,
      existing ? "UPDATE_USER_CLI" : "CREATE_USER_CLI",
      "users",
      id,
    );
    return id;
  });
}
