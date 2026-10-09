import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { ProviderError } from "./http.js";

export function publicImageAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a > 0 &&
      a < 224 &&
      a !== 10 &&
      a !== 127 &&
      !(a === 169 && b === 254) &&
      !(a === 172 && b >= 16 && b <= 31) &&
      !(a === 192 && (b === 168 || b === 0)) &&
      !(a === 100 && b >= 64 && b <= 127) &&
      !(a === 198 && (b === 18 || b === 19)) &&
      !(a === 192 && b === 2) &&
      !(a === 198 && b === 51) &&
      !(a === 203 && b === 0)
    );
  }
  return (
    isIP(address) === 6 &&
    /^[23]/i.test(address) &&
    !/^2001:db8:/i.test(address) &&
    !/^2002:/i.test(address) &&
    !/^2001:0:/i.test(address)
  );
}

// Resolve, validate and pin the destination for every hop. No credentials or cookies are sent.
export async function readImageSource(
  value: string,
  signal: AbortSignal,
  html = false,
  hop = 0,
): Promise<{ data: Buffer; url: string }> {
  const url = new URL(value);
  if (
    hop > 3 ||
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    isIP(url.hostname) ||
    url.hostname.startsWith("[") ||
    /[\x00-\x20\\]/.test(value)
  )
    throw new ProviderError("invalid_image_source");
  const addresses = await lookup(url.hostname, { all: true });
  signal.throwIfAborted();
  if (
    !addresses.length ||
    addresses.some((a) => !publicImageAddress(a.address))
  )
    throw new ProviderError("invalid_image_source");
  const address = addresses[0];
  const limit = html ? 2 * 1024 * 1024 : 4 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const call = request(
      url,
      {
        signal,
        headers: {
          Accept: html ? "text/html" : "image/jpeg,image/png,image/webp",
          "User-Agent": "GeekMusical-Media/1.0",
        },
        lookup: (_host, options, callback) => {
          if (typeof options === "object" && options.all)
            (
              callback as unknown as (
                error: null,
                values: typeof addresses,
              ) => void
            )(null, [address]);
          else callback(null, address.address, address.family);
        },
      },
      (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode || 0) &&
          response.headers.location
        ) {
          response.resume();
          void readImageSource(
            new URL(response.headers.location, url).href,
            signal,
            html,
            hop + 1,
          ).then(resolve, reject);
          return;
        }
        const type = (response.headers["content-type"] || "")
          .split(";")[0]
          .toLowerCase();
        if (
          response.statusCode !== 200 ||
          !(html
            ? type === "text/html"
            : ["image/jpeg", "image/png", "image/webp"].includes(type)) ||
          Number(response.headers["content-length"]) > limit
        ) {
          response.destroy();
          reject(
            new ProviderError("invalid_image_response", response.statusCode),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit) {
            response.destroy();
            reject(new ProviderError("image_too_large"));
          } else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({ data: Buffer.concat(chunks), url: url.href }),
        );
      },
    );
    call.on("error", reject);
    call.end();
  });
}
