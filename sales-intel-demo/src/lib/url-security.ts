import { lookup as nodeLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type DnsRecord = { address: string; family: number };
export type Lookup = (hostname: string) => Promise<DnsRecord[]>;

const trackingParameter = /^(utm_|fbclid$|gclid$|mc_[a-z_]+$)/i;

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("只支持 http 或 https 地址。");
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  for (const key of [...url.searchParams.keys()]) {
    if (trackingParameter.test(key)) url.searchParams.delete(key);
  }

  const entries = [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right));
  url.search = "";
  for (const [key, value] of entries) url.searchParams.append(key, value);
  if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url.toString();
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [first, second] = address.split(".").map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  if (family === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }

  return true;
}

export async function defaultLookup(hostname: string): Promise<DnsRecord[]> {
  return nodeLookup(hostname, { all: true, verbatim: true });
}

export async function resolveWithPublicDns(hostname: string): Promise<DnsRecord[]> {
  const records: DnsRecord[] = [];
  for (const type of ["A", "AAAA"] as const) {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) continue;
    const payload = (await response.json()) as { Answer?: Array<{ data?: string; type?: number }> };
    for (const answer of payload.Answer ?? []) {
      if ((answer.type === 1 || answer.type === 28) && answer.data && isIP(answer.data)) {
        records.push({ address: answer.data, family: answer.type === 1 ? 4 : 6 });
      }
    }
  }
  return records;
}

function isLocalProxyAddress(address: string): boolean {
  const [first, second] = address.split(".").map(Number);
  return first === 198 && (second === 18 || second === 19);
}

export async function assertPublicHttpUrl(rawUrl: string, lookup: Lookup = defaultLookup, publicLookup: Lookup = resolveWithPublicDns): Promise<string> {
  const canonicalUrl = canonicalizeUrl(rawUrl);
  const hostname = new URL(canonicalUrl).hostname;
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("不允许访问本机或局域网地址。");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("不允许访问私有或保留地址。");
    return canonicalUrl;
  }

  const records = await lookup(hostname);
  if (records.length === 0) {
    throw new Error("目标地址解析到私有、保留或无效网络。");
  }

  if (records.some((record) => isPrivateAddress(record.address))) {
    if (!records.every((record) => record.family === 4 && isLocalProxyAddress(record.address))) {
      throw new Error("目标地址解析到私有、保留或无效网络。");
    }
    const publicRecords = await publicLookup(hostname);
    if (publicRecords.length === 0 || publicRecords.some((record) => isPrivateAddress(record.address))) {
      throw new Error("目标地址无法通过公共 DNS 验证为公网地址。");
    }
  }

  return canonicalUrl;
}
