import { lookup } from "node:dns/promises";
import https from "node:https";
import { setTimeout as delay } from "node:timers/promises";
import type { IncomingMessage } from "node:http";
import { Transform } from "node:stream";
import { awinDownloadUrl, publicAddress, publicHttps } from "./urls.js";
import { AwinError } from "./errors.js";

export function byteLimit(
  max: number,
  onBytes: (count: number) => void = () => {},
) {
  let bytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      onBytes(bytes);
      callback(bytes > max ? new AwinError("size_limit") : null, chunk);
    },
  });
}
export class AwinHttp {
  private readonly destinations = new WeakMap<IncomingMessage, string>();
  constructor(readonly publisherId: number) {}
  resolvedUrl(response: IncomingMessage) {
    return this.destinations.get(response) || null;
  }
  async open(
    value: string,
    options: {
      token?: string;
      method?: "GET" | "POST" | "HEAD";
      body?: unknown;
      signal: AbortSignal;
      merchantHosts?: string[];
    },
  ): Promise<IncomingMessage> {
    let url = value;
    for (let redirects = 0; redirects <= 4; redirects++) {
      const u = options.merchantHosts
        ? publicHttps(url)
        : awinDownloadUrl(url, this.publisherId);
      if (
        !u ||
        (options.merchantHosts &&
          !options.merchantHosts.some(
            (h) =>
              u.hostname === h ||
              (h.startsWith("*.") &&
                (u.hostname === h.slice(2) ||
                  u.hostname.endsWith("." + h.slice(2)))),
          ))
      )
        throw new AwinError("unsafe_url");
      const addresses = await lookup(u.hostname, { all: true });
      if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
        throw new AwinError("unsafe_url");
      const chosen = addresses.find((a) => a.family === 4) || addresses[0];
      const payload =
        options.body === undefined ? undefined : JSON.stringify(options.body);
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        const request = https.request(
          u,
          {
            method: options.method || "GET",
            signal: options.signal,
            headers: {
              Accept: "application/json,text/csv,application/octet-stream",
              ...(options.token && u.hostname === "api.awin.com"
                ? { Authorization: `Bearer ${options.token}` }
                : {}),
              ...(payload
                ? {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload),
                  }
                : {}),
            },
            lookup: (_hostname, opts, cb) => {
              if (typeof opts === "object" && opts.all) cb(null, [chosen]);
              else cb(null, chosen.address, chosen.family);
            },
          },
          resolve,
        );
        request.setTimeout(20000, () =>
          request.destroy(new AwinError("timeout")),
        );
        request.on("error", () =>
          reject(
            new AwinError(
              options.signal.aborted ? "incomplete_feed" : "transport_failure",
            ),
          ),
        );
        request.end(payload);
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
        const location = response.headers.location;
        response.resume();
        if (!location || options.method === "POST")
          throw new AwinError("unsafe_url");
        url = new URL(location, u).href;
        continue;
      }
      this.destinations.set(response, u.href);
      return response;
    }
    throw new AwinError("unsafe_url");
  }
  async request(value: string, options: Parameters<AwinHttp["open"]>[1]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.open(value, options);
      const status = response.statusCode || 0;
      if (status === 429 || status >= 500) {
        const retryAfter = Number(response.headers["retry-after"]);
        response.resume();
        if (attempt === 2)
          throw new AwinError(
            status === 429 ? "rate_limited" : "technical_failure",
          );
        await delay(
          Math.min(
            30000,
            Math.max(
              1000 * 2 ** attempt,
              Number.isFinite(retryAfter) ? retryAfter * 1000 : 0,
            ),
          ),
          undefined,
          { signal: options.signal },
        );
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new AwinError(
          status === 401
            ? "authentication_failed"
            : status === 403
              ? "restricted"
              : status === 404
                ? "catalog_unavailable"
                : "technical_failure",
        );
      }
      return response;
    }
    throw new AwinError("technical_failure");
  }
  async json(value: string, options: Parameters<AwinHttp["open"]>[1]) {
    const response = await this.request(value, options);
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of response) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new AwinError("size_limit");
        chunks.push(Buffer.from(chunk));
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch (error) {
      response.destroy();
      if (error instanceof AwinError) throw error;
      throw new AwinError("invalid_response");
    }
  }
}
