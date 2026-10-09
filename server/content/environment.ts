import type { Request } from "express";
import type { WebConfig } from "../config.js";
export type BusinessEnvironment = "development" | "production";
export const environmentOf = (web: WebConfig): BusinessEnvironment =>
  web.environment || (web.production ? "production" : "development");
export const previewEnabled = (web: WebConfig) =>
  environmentOf(web) !== "production" &&
  (web.editorialPreview ?? !web.production);
export function previewAllowed(req: Request, web: WebConfig) {
  if (!previewEnabled(web)) return false;
  const loopback = /^(::ffff:)?127\.|^::1$/.test(
    req.socket.remoteAddress || "",
  );
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(
    req.headers.host || "",
  );
  return (
    loopback &&
    (environmentOf(web) === "development"
      ? localHost
      : !!web.previewProtected && web.trustProxy === "loopback")
  );
}
