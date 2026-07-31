import { createHash } from "node:crypto";
import { SourceSchema, type Source } from "@/lib/types";
import { canonicalizeUrl } from "@/lib/url-security";

export function hashContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function makeSourceId(canonicalUrl: string): string {
  return createHash("sha256").update(canonicalUrl, "utf8").digest("hex").slice(0, 16);
}

export type RawSource = Omit<Source, "id" | "canonicalUrl" | "contentHash"> & {
  canonicalUrl?: string;
  id?: string;
  contentHash?: string;
};

function sourceTitle(rawTitle: unknown, canonicalUrl: string): string {
  const supplied = typeof rawTitle === "string" ? rawTitle.replace(/\s+/g, " ").trim() : "";
  if (supplied) return supplied.slice(0, 500);

  const url = new URL(canonicalUrl);
  const path = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment).replace(/[-_]+/g, " ").trim();
      } catch {
        return segment.replace(/[-_]+/g, " ").trim();
      }
    })
    .filter(Boolean)
    .join(" / ");
  return `${url.hostname}${path ? ` / ${path}` : " 官网"}`.slice(0, 500);
}

function normalizedDate(value: unknown, fallback?: string): string | undefined {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
}

export function normalizeSource(source: RawSource): Source {
  const canonicalUrl = canonicalizeUrl(source.canonicalUrl ?? source.url);
  const content = typeof source.content === "string" ? source.content.trim().slice(0, 80_000) : "";
  const normalized = {
    ...source,
    id: typeof source.id === "string" && source.id.trim().length >= 8 ? source.id.trim() : makeSourceId(canonicalUrl),
    canonicalUrl,
    title: sourceTitle(source.title, canonicalUrl),
    content,
    fetchedAt: normalizedDate(source.fetchedAt, new Date().toISOString()),
    publishedAt: normalizedDate(source.publishedAt),
    contentHash: typeof source.contentHash === "string" && source.contentHash.length === 64
      ? source.contentHash
      : hashContent(content),
  };
  return SourceSchema.parse(normalized);
}

export function dedupeSources(rawSources: RawSource[]): Source[] {
  const byUrl = new Map<string, Source>();

  for (const rawSource of rawSources) {
    let source: Source;
    try {
      source = normalizeSource(rawSource);
    } catch {
      // A single malformed crawler/search result must not abort the full report.
      continue;
    }
    const existing = byUrl.get(source.canonicalUrl);
    if (!existing || isMeaningfullyRicher(source, existing)) {
      byUrl.set(source.canonicalUrl, source);
    }
  }

  const byContent = new Map<string, Source>();
  for (const source of byUrl.values()) {
    const existing = byContent.get(source.contentHash);
    if (!existing || sourceRichness(source) > sourceRichness(existing)) {
      byContent.set(source.contentHash, source);
    }
  }
  return [...byContent.values()];
}

function isMeaningfullyRicher(candidate: Source, existing: Source): boolean {
  const candidateLength = candidate.content.replace(/\s+/g, " ").trim().length;
  const existingLength = existing.content.replace(/\s+/g, " ").trim().length;
  if (candidateLength >= 40 && existingLength < 20) return true;
  if (candidateLength >= Math.max(existingLength + 120, existingLength * 1.5)) return true;
  return sourceRichness(candidate) >= sourceRichness(existing) + 250;
}

function sourceRichness(source: Source): number {
  const content = source.content.replace(/\s+/g, " ").trim();
  const title = source.title.replace(/\s+/g, " ").trim();
  const substantiveTitle = title && title !== new URL(source.canonicalUrl).hostname ? 80 : 0;
  const sentenceBonus = /[。！？.!?]/.test(content) ? 120 : 0;
  return Math.min(content.length, 80_000) + Math.min(title.length, 300) * 2 + substantiveTitle + sentenceBonus;
}
