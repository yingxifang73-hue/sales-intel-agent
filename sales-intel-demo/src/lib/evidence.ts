import type { Source } from "@/lib/types";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: "\"",
  raquo: "»",
  rdquo: "”",
  rsquo: "’",
};

const NOISE_PATTERN = /^(menu|search|cookie(?: consent)?|privacy policy|terms of (?:use|service)|accept all|sign in|log in|copyright(?: \d{4})?|learn more|read more|continue|find your country.*)$/i;
const GARBLED_PATTERN = /(?:�|锟斤拷|Ã|Â|â€|鈥|銆)/;

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (full, token: string) => {
    if (token.startsWith("#x") || token.startsWith("#X")) {
      const point = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : full;
    }
    if (token.startsWith("#")) {
      const point = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : full;
    }
    return NAMED_ENTITIES[token.toLowerCase()] ?? full;
  });
}

function meaningfulSegments(value: string): string[] {
  return value
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter((segment) => segment.length >= 3 && !NOISE_PATTERN.test(segment));
}

export function cleanSourceText(value: string): string {
  const decoded = decodeHtmlEntities(value)
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\b(?:cookie consent|privacy policy|terms of (?:use|service)|accept all|copyright(?: \d{4})?|menu|search)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return meaningfulSegments(decoded).join(" ").slice(0, 40_000);
}

export function selectEvidenceExcerpts(source: Source, focus: string[] = []): string {
  const cleaned = cleanSourceText(source.content);
  const segments = meaningfulSegments(cleaned).filter((segment) => segment.length >= 35);
  const keywords = focus.map((keyword) => keyword.toLowerCase()).filter(Boolean);
  const seen = new Set<string>();
  const ranked = segments.map((segment, index) => {
    const normalized = segment.toLowerCase();
    let score = Math.min(segment.length, 240) / 120;
    for (const keyword of keywords) if (normalized.includes(keyword)) score += 4;
    if (/\b20\d{2}\b|近期|发布|宣布|合作|launch|announce|partner|news/i.test(segment)) score += 2;
    if (/company|about|manufacturer|product|service|customer|market|公司|企业|产品|服务|客户|市场/i.test(segment)) score += 1;
    return { segment, normalized: normalized.replace(/[^\p{L}\p{N}]+/gu, " ").slice(0, 180), score, index };
  }).filter((item) => {
    if (seen.has(item.normalized)) return false;
    seen.add(item.normalized);
    return true;
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = ranked.slice(0, 5).sort((left, right) => left.index - right.index).map((item) => item.segment);
  return (selected.length ? selected.join(" ") : cleaned.slice(0, 900)).slice(0, 1_800);
}

export function isReadableChinese(value: string): boolean {
  const text = value.trim();
  if (!text || /&(?:#x?[0-9a-f]+|[a-z][a-z0-9]+);/i.test(text) || GARBLED_PATTERN.test(text)) return false;
  const chinese = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latin = text.match(/[a-z]/gi)?.length ?? 0;
  return chinese >= 6 && chinese / Math.max(chinese + latin, 1) >= 0.25;
}

export function sanitizeChineseOutput(value: string): string {
  return cleanSourceText(value)
    .replace(/[（(]\s*(?:来源|source)\s*[:：][^)）]+[)）]/gi, "")
    .replace(/(?:来源|source)\s*[:：]\s*[a-z0-9_-]{6,}/gi, "")
    .replace(/\s+([，。！？；：])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
