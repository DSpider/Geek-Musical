import { BlockList, isIP } from "node:net";
import { AwinError } from "./errors.js";
const privateNetworks = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  privateNetworks.addSubnet(ip, prefix, "ipv4");
privateNetworks.addSubnet("2001:db8::", 32, "ipv6");
export function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !privateNetworks.check(address, "ipv4")
    : family === 6 &&
        /^[23]/i.test(address) &&
        !privateNetworks.check(address, "ipv6");
}
export function publicHttps(value: unknown): URL | null {
  if (
    typeof value !== "string" ||
    value.length > 4000 ||
    /[\x00-\x20\\]/.test(value)
  )
    return null;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443") ||
      !u.hostname.includes(".") ||
      isIP(u.hostname.replace(/^\[|\]$/g, "")) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(
        u.hostname,
      ) ||
      u.hostname.endsWith(".")
    )
      return null;
    return u;
  } catch {
    return null;
  }
}
export function validDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const domain = value.trim().toLowerCase();
  return /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
    domain,
  ) && publicHttps("https://" + domain.replace(/^\*\./, ""))
    ? domain
    : null;
}
export function merchantUrl(
  value: unknown,
  advertiser: { domains: string[]; allowedDomains?: string[] },
): string | null {
  const u = publicHttps(value);
  if (!u) return null;
  const matches = (domains: string[]) =>
    domains.some((d) =>
      d.startsWith("*.")
        ? u.hostname === d.slice(2) || u.hostname.endsWith("." + d.slice(2))
        : u.hostname === d,
    );
  return matches(advertiser.domains) &&
    (!advertiser.allowedDomains?.length || matches(advertiser.allowedDomains))
    ? u.href
    : null;
}
export function affiliateUrl(
  value: unknown,
  advertiser: {
    domains: string[];
    allowedDomains?: string[];
    id: number;
    publisherId: number;
  },
  original: string | null,
  awinProductId: string | null,
): string | null {
  const u = publicHttps(value);
  if (
    !u ||
    !["www.awin1.com", "awin1.com"].includes(u.hostname) ||
    (original && !merchantUrl(original, advertiser))
  )
    return null;
  const single = (key: string) =>
    u.searchParams.getAll(key).length === 1 ? u.searchParams.get(key) : null;
  if (u.pathname === "/pclick.php") {
    return single("a") === String(advertiser.publisherId) &&
      single("m") === String(advertiser.id) &&
      !!awinProductId &&
      single("p") === awinProductId &&
      !!original
      ? u.href
      : null;
  }
  if (u.pathname === "/cread.php") {
    const direct = merchantUrl(single("ued"), advertiser);
    return single("awinaffid") === String(advertiser.publisherId) &&
      single("awinmid") === String(advertiser.id) &&
      !!direct &&
      (!original || direct === original)
      ? u.href
      : null;
  }
  return null;
}
const downloadHosts = [
  "api.awin.com",
  "productdata.awin.com",
  "datafeed.api.productserve.com",
  "ui.awin.com",
];
export function awinDownloadUrl(value: string, publisherId: number): URL {
  const u = publicHttps(value);
  if (!u || !downloadHosts.includes(u.hostname))
    throw new AwinError("unsafe_url");
  const publisher = u.pathname.match(
    /\/(?:publishers|publisher)\/(\d+)\//,
  )?.[1];
  if (publisher && publisher !== String(publisherId))
    throw new AwinError("unsafe_url");
  if (
    u.hostname === "ui.awin.com" &&
    !u.pathname.startsWith(
      `/productdata-darwin-download/publisher/${publisherId}/`,
    )
  )
    throw new AwinError("unsafe_url");
  if (
    u.hostname === "api.awin.com" &&
    !u.pathname.startsWith(`/publishers/${publisherId}/`)
  )
    throw new AwinError("unsafe_url");
  return u;
}
export function secretFreeDownloadPath(
  value: string,
  feedKey: string,
  publisherId: number,
): string {
  const u = awinDownloadUrl(value, publisherId);
  if (!feedKey || !u.href.includes(feedKey))
    throw new AwinError("invalid_feed");
  const template = u.href.split(feedKey).join("{AWIN_FEED_API_KEY}");
  // Permit exactly the official key slot, never signed/unknown query strings.
  if (u.search || !/\/apikey\/\{AWIN_FEED_API_KEY\}\//.test(template))
    throw new AwinError("invalid_feed");
  return template;
}
