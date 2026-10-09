import dotenv from "dotenv";

import path from "node:path";

import { site } from "../shared/site.js";

dotenv.config({ quiet: true });

const env = process.env;

export function publicUrl(value: string) {
  const url = new URL(value);

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    /^(localhost|127\.|\[|0\.)/i.test(url.hostname)
  ) {
    throw new Error(
      "SITE_URL deve ser uma origem HTTPS pública, sem caminho, credenciais ou porta.",
    );
  }

  return url.origin;
}

if (env.TRUST_PROXY && !["false", "loopback"].includes(env.TRUST_PROXY)) {
  throw new Error("TRUST_PROXY aceita false ou loopback (proxy local).");
}

const production =
  process.argv.includes("--production") || env.NODE_ENV === "production";

export interface WebConfig {
  siteUrl: string;

  publicSite: boolean;

  production: boolean;

  trustProxy: false | "loopback";

  port: number;

  environment?: "development" | "production";

  editorialPreview?: boolean;

  previewProtected?: boolean;
}

const environment = env.APP_ENV || (production ? "production" : "development");

export function fixtureMode(value: string | undefined, _environment: string) {
  if (value === "true")
    throw new Error(
      "Fixtures de homologação não são permitidas no Geek Musical.",
    );

  return false;
}

if (!["development", "production"].includes(environment))
  throw new Error("APP_ENV aceita somente development ou production.");

if (environment !== "production" && env.PUBLIC_SITE === "true")
  throw new Error("PUBLIC_SITE=true exige APP_ENV=production.");

if (environment === "production" && env.EDITORIAL_PREVIEW === "true")
  throw new Error("Preview editorial é proibido em produção.");

const integer = (
  value: string | undefined,

  fallback: number,

  min: number,

  max: number,
) =>
  Math.min(
    max,

    Math.max(
      min,

      value && Number.isFinite(Number(value))
        ? Math.floor(Number(value))
        : fallback,
    ),
  );

export const config = {
  fixtures: fixtureMode(env.STAGING_FIXTURES, environment),

  port: integer(env.PORT, 3230, 1, 65535),

  host: env.HOST || "127.0.0.1",

  production,

  web: {
    siteUrl: publicUrl(env.SITE_URL || site.defaultUrl),

    publicSite: env.PUBLIC_SITE === "true",

    production,

    trustProxy: env.TRUST_PROXY === "loopback" ? "loopback" : false,

    port: integer(env.PORT, 3230, 1, 65535),

    environment: environment as NonNullable<WebConfig["environment"]>,

    editorialPreview:
      environment === "development"
        ? env.EDITORIAL_PREVIEW !== "false"
        : env.EDITORIAL_PREVIEW === "true",

    previewProtected: env.PREVIEW_PROTECTED === "true",
  } satisfies WebConfig,

  timeoutMs: integer(env.MARKETPLACE_TIMEOUT_MS, 9000, 1000, 20000),

  amazon: {
    id: env.AMAZON_CREDENTIAL_ID || "",
    secret: env.AMAZON_CREDENTIAL_SECRET || "",
    version: env.AMAZON_CREATORS_VERSION || "2.1",
    marketplace: "www.amazon.com.br",
    tag: "geekmusical-20",
    quotaFile:
      env.AMAZON_QUOTA_FILE ||
      path.join(env.STATE_DIRECTORY || "artifacts", "amazon-api-quota.json"),
  },
  shopee: {
    appId: env.SHOPEE_APP_ID || env.APP_ID_SHOPEE || "",
    secret: env.SHOPEE_SECRET || env.SECRET_SHOPEE || "",
    endpoint: "https://open-api.affiliate.shopee.com.br/graphql",
  },
};
