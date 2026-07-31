import type {
  ContactChannel,
  ContactIntelligence,
  PublicContact,
  Source,
} from "@/lib/types";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compact(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^\p{L}\p{N}@._+-]/gu, "");
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (!/^[A-Z0-9][A-Z0-9._%+-]*@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) return false;
  const local = email.split("@")[0] ?? "";
  return local.length >= 2 && !/^[_.+-]|[_.+-]$/.test(local);
}

function isValidPhone(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, "");
  if (/^(?:\+?86[-]?)?1[3-9]\d{9}$/.test(normalized)) return true;
  return /^0\d{2,3}-\d{7,8}(?:-\d{1,6})?$/.test(normalized);
}

function cleanAddress(value: string): string {
  return value
    .replace(/^(?:为|是|中国|china)\s*/i, "")
    .split(/\s*(?:传真|电话|邮箱|官网|网址|网站|fax|tel|phone|email|https?:\/\/)\s*[:：]?/i)[0]!
    .replace(/[\s,，;；:：-]+$/, "")
    .trim();
}

function validSourceIds(value: unknown, sources: Source[]): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set(sources.map((source) => source.id));
  return [...new Set(value.flatMap((item) => {
    if (typeof item !== "string") return [];
    if (ids.has(item)) return [item];
    const short = item.match(/^S(\d+)$/i);
    if (!short) return [];
    const source = sources[Number(short[1]) - 1];
    return source ? [source.id] : [];
  }))].slice(0, 5);
}

function citedSources(sourceIds: string[], sources: Source[]): Source[] {
  const wanted = new Set(sourceIds);
  return sources.filter((source) => wanted.has(source.id));
}

function sourceContainsValue(kind: ContactChannel["kind"], value: string, cited: Source[]): boolean {
  if (!value.trim() || cited.length === 0) return false;
  if (kind === "phone") {
    if (!isValidPhone(value)) return false;
    const candidate = digits(value);
    return cited.some((source) => digits(`${source.content}\n${source.url}`).includes(candidate));
  }
  if (kind === "email" && !isValidEmail(value)) {
    return false;
  }
  const candidate = compact(value);
  return candidate.length >= 2 && cited.some((source) => compact(`${source.content}\n${source.url}\n${source.title}`).includes(candidate));
}

function validChannelUrl(urlValue: unknown, cited: Source[], targetUrl: string): string | undefined {
  if (typeof urlValue !== "string") return undefined;
  try {
    const candidate = new URL(urlValue);
    const target = new URL(targetUrl);
    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") return undefined;
    const appearsInEvidence = cited.some((source) => (
      source.url === candidate.toString()
      || source.url === urlValue
      || source.content.includes(urlValue)
      || source.content.includes(candidate.toString())
    ));
    return candidate.hostname === target.hostname || appearsInEvidence ? candidate.toString() : undefined;
  } catch {
    return undefined;
  }
}

function normalizeChannel(raw: unknown, sources: Source[], targetUrl: string): ContactChannel | undefined {
  if (!isRecord(raw)) return undefined;
  const allowed = new Set<ContactChannel["kind"]>([
    "website", "contact_page", "phone", "email", "online_channel", "address",
  ]);
  const kind = typeof raw.kind === "string" && allowed.has(raw.kind as ContactChannel["kind"])
    ? raw.kind as ContactChannel["kind"]
    : undefined;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const value = typeof raw.value === "string" ? raw.value.trim() : "";
  const status = raw.status === "conflicting" ? "conflicting" : raw.status === "verified" ? "verified" : undefined;
  const sourceIds = validSourceIds(raw.sourceIds, sources);
  const cited = citedSources(sourceIds, sources);
  if (!kind || label.length < 2 || !value || !status || cited.length === 0) return undefined;

  const url = validChannelUrl(raw.url, cited, targetUrl);
  if ((kind === "website" || kind === "contact_page" || kind === "online_channel") && !url) return undefined;
  if (kind === "email" && !isValidEmail(value)) return undefined;
  if (kind === "phone" && !isValidPhone(value)) return undefined;
  if (!sourceContainsValue(kind, value, cited) && !(url && sourceContainsValue(kind, url, cited))) return undefined;

  const cleanValue = kind === "address" ? cleanAddress(value) : value;
  if (!cleanValue) return undefined;
  return { kind, label, value: cleanValue, ...(url ? { url } : {}), status, sourceIds };
}

function normalizePublicContact(raw: unknown, sources: Source[]): PublicContact | undefined {
  if (!isRecord(raw)) return undefined;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const role = typeof raw.role === "string" ? raw.role.trim() : "";
  const contact = typeof raw.contact === "string" ? raw.contact.trim() : undefined;
  const status = raw.status === "conflicting" ? "conflicting" : raw.status === "verified" ? "verified" : undefined;
  const sourceIds = validSourceIds(raw.sourceIds, sources);
  const cited = citedSources(sourceIds, sources);
  if (name.length < 2 || role.length < 2 || !status || cited.length === 0) return undefined;
  if (!sourceContainsValue("address", name, cited) || !sourceContainsValue("address", role, cited)) return undefined;
  if (contact && !sourceContainsValue(contact.includes("@") ? "email" : "phone", contact, cited)) return undefined;
  return { name, role, ...(contact ? { contact } : {}), status, sourceIds };
}

function sameHostname(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function contactPageSource(source: Source, targetUrl: string): boolean {
  try {
    return source.sourceType === "official"
      && sameHostname(source.url, targetUrl)
      && /\/(contact|contact-us|联系我们)(?:\/|$)/i.test(new URL(source.url).pathname);
  } catch {
    return false;
  }
}

function pushUnique(channels: ContactChannel[], channel: ContactChannel): void {
  const key = `${channel.kind}:${compact(channel.value)}`;
  if (!channels.some((item) => `${item.kind}:${compact(item.value)}` === key)) channels.push(channel);
}

const ADDRESS_LABEL_PATTERN = /(?:\u8054\u7cfb\u5730\u5740|\u529e\u516c\u5730\u5740|\u6ce8\u518c\u5730\u5740|\u603b\u90e8\u5730\u5740|\u516c\u53f8\u5730\u5740|\u5730\u5740|address|registered\s+office|headquarters|office\s+location)\s*[:\uFF1A]?\s*([^\n.;\u3002\uFF1B]{6,140})/gi;

function extractLabeledAddresses(text: string): string[] {
  return [...text.matchAll(ADDRESS_LABEL_PATTERN)]
    .map((match) => cleanAddress(match[1] ?? ""))
    .filter((value): value is string => Boolean(value && /[\p{L}\p{N}]/u.test(value)));
}

/**
 * Extracts direct public contact facts from the collected pages. This is a
 * deterministic supplement to the model output: every emitted value exists in
 * the source that is cited on the channel.
 */
export function extractVerifiedContactsFromSources(sources: Source[], targetUrl: string): ContactIntelligence {
  const channels: ContactChannel[] = [];
  const publicContacts: PublicContact[] = [];
  const officialHomepage = sources.find((source) => source.sourceType === "official" && sameHostname(source.url, targetUrl));

  if (officialHomepage) {
    pushUnique(channels, {
      kind: "website",
      label: "官方网站",
      value: new URL(targetUrl).hostname.replace(/^www\./, ""),
      url: targetUrl,
      status: "verified",
      sourceIds: [officialHomepage.id],
    });
  }

  for (const source of sources) {
    if (contactPageSource(source, targetUrl)) {
      pushUnique(channels, {
        kind: "contact_page",
        label: "官网联系页面",
        value: source.url,
        url: source.url,
        status: "verified",
        sourceIds: [source.id],
      });
    }

    // Only extract literal contact facts from first-party pages. Third-party
    // reports remain available to the model, but cannot silently become a
    // business contact record.
    if (source.sourceType !== "official") continue;
    const text = source.content;

    for (const email of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) {
      if (!isValidEmail(email)) continue;
      pushUnique(channels, { kind: "email", label: "公开邮箱", value: email, status: "verified", sourceIds: [source.id] });
    }
    for (const match of text.matchAll(/(?<!\d)(?:\+?86[-\s]?)?(?:1[3-9]\d{9}|0\d{2,3}-\d{7,8}(?:-\d{1,6})?)(?!\d)/g)) {
      const value = match[0].trim();
      const prefix = text.slice(Math.max(0, (match.index ?? 0) - 8), match.index ?? 0);
      if (!isValidPhone(value) || /传真|fax/i.test(prefix)) continue;
      pushUnique(channels, { kind: "phone", label: "公开电话", value, status: "verified", sourceIds: [source.id] });
    }
    for (const match of text.matchAll(/(?:联系地址|办公地址|注册地址|总部地址|公司地址|地址)[：:\s]*([^。；\n]{6,80})/g)) {
      const value = cleanAddress(match[1] ?? "");
      if (value && /[\u3400-\u9fff]/.test(value)) {
        pushUnique(channels, { kind: "address", label: "公开地址", value, status: "verified", sourceIds: [source.id] });
      }
    }
  }

  for (const source of sources) {
    if (source.sourceType !== "official") continue;
    for (const value of extractLabeledAddresses(source.content)) {
      pushUnique(channels, { kind: "address", label: "\u516c\u5f00\u5730\u5740", value, status: "verified", sourceIds: [source.id] });
    }
  }

  return { channels, publicContacts };
}

export function normalizeContactIntelligence(
  raw: unknown,
  sources: Source[],
  targetUrl: string,
): ContactIntelligence {
  const record = isRecord(raw) ? raw : {};
  const channels = Array.isArray(record.channels)
    ? record.channels
      .map((item) => normalizeChannel(item, sources, targetUrl))
      .filter((item): item is ContactChannel => Boolean(item))
    : [];
  const publicContacts = Array.isArray(record.publicContacts)
    ? record.publicContacts
      .map((item) => normalizePublicContact(item, sources))
      .filter((item): item is PublicContact => Boolean(item))
    : [];

  const officialHomepage = sources.find((source) => source.sourceType === "official" && sameHostname(source.url, targetUrl));
  if (officialHomepage && !channels.some((channel) => channel.kind === "website")) {
    channels.unshift({
      kind: "website",
      label: "官方网站",
      value: new URL(targetUrl).hostname.replace(/^www\./, ""),
      url: targetUrl,
      status: "verified",
      sourceIds: [officialHomepage.id],
    });
  }

  for (const source of sources) {
    if (contactPageSource(source, targetUrl) && !channels.some((channel) => channel.kind === "contact_page")) {
      channels.push({
        kind: "contact_page",
        label: "官网联系页面",
        value: source.url,
        url: source.url,
        status: "verified",
        sourceIds: [source.id],
      });
    }
  }

  const seen = new Set<string>();
  return {
    channels: channels.filter((channel) => {
      const key = `${channel.kind}:${compact(channel.value)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20),
    publicContacts: publicContacts.filter((contact, index, list) => (
      list.findIndex((item) => compact(`${item.name}${item.role}`) === compact(`${contact.name}${contact.role}`)) === index
    )).slice(0, 10),
  };
}
