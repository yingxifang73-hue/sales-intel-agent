import { createHash } from "node:crypto";
import type { Source } from "@/lib/types";
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

export function normalizeSource(source: RawSource): Source {
  const canonicalUrl = canonicalizeUrl(source.canonicalUrl ?? source.url);
  return {
    ...source,
    id: source.id ?? makeSourceId(canonicalUrl),
    canonicalUrl,
    contentHash: source.contentHash ?? hashContent(source.content),
  };
}

export function dedupeSources(rawSources: RawSource[]): Source[] {
  const urls = new Set<string>();
  const contents = new Set<string>();
  const deduped: Source[] = [];

  for (const rawSource of rawSources) {
    const source = normalizeSource(rawSource);
    if (urls.has(source.canonicalUrl) || contents.has(source.contentHash)) continue;
    urls.add(source.canonicalUrl);
    contents.add(source.contentHash);
    deduped.push(source);
  }

  return deduped;
}
