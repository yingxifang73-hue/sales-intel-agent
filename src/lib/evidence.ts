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
const FACTUAL_CUE_PATTERN = /(?:创立于?|成立于?|是一家|是中国|现已发展|专注于?|致力于?|主要从事|主营|提供|拥有|位于|现任|担任|入选|获评|建设|建立|发布|推出|完成|实现|研发|生产|销售|服务于?|围绕|涵盖|founded|develops?|provides?|offers?|speciali[sz]es?|operates?)/i;
const SCRIPT_ASSIGNMENT_PATTERN = /\b(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=\s*["'][A-Fa-f0-9]{24,}/;
const LONG_ENCODED_TOKEN_PATTERN = /[A-Za-z0-9+/]{96,}={0,2}/;
const REPORT_PREFIX_PATTERN = /(?:根据|据|从)?\s*(?:目标公司(?:的)?\s*)?公开(?:业务)?资料显示\s*[：:,，]?\s*/gu;
const PUNCTUATION_ONLY_PATTERN = /^[\s"'`‘’“”«»「」『』【】()（）[\]{}，。；：、,.!?！？;:—–…·•]+$/u;
const ENGLISH_UI_NOISE_PATTERN = /\b(?:click|expand|read more|read next|home|latest news|menu|search|input|icon|sign in|log in)\b/i;
const CHINESE_UI_NOISE_PATTERN = /^(?:首页|产品信息|了解我们|加入我们|新闻动态|关于我们|关于米哈游|联系我们|联系方式|隐私政策|自律公约|廉政举报|廉正举报|游戏官网|微信公众号|查看更多|数据加载中|返回顶部|Bilibili)$/i;

// Image alt-text patterns that indicate a picture caption, not factual content.
// These often appear as "（图1 ...）" or "（图为...）" in crawled markdown.
const IMAGE_ALT_PATTERN = /[（(]\s*(?:图\d*|图片|图为|上图|下图|示意图|图示|照片|图片来源)[^)）]{0,80}[)）]/g;

// Chinese media platform boilerplate — comment prompts, disclaimers, footer notices.
// These are NEVER useful evidence and should be stripped before LLM processing.
const CHINESE_MEDIA_BOILERPLATE = [
  /登录以发表评论/,
  /特别声明[：:]\s*以上(?:文章)?内容(?:仅代表[^。]+观点|不代表[^。]+立场)[^。]*。/,
  /特别声明[：:]\s*以上内容[^。]*仅提供信息存储服务[^。]*。/,
  /Notice[：:].*?(?:content|article|views?|opinion).*?(?:does not|only|solely)/i,
  /(?:文章|内容|作品)(?:内容)?(?:仅代表|不代表).*?(?:观点|立场)/,
  /如有(?:关于)?(?:作品)?(?:内容|版权|其它|其他)问[题题][，,]?(?:请)?(?:于|在).*?(?:联系|新浪网|网易)/,
  /(?:新浪网|网易|搜狐|腾讯)(?:科技)?(?:联系|版权|声明)/,
  /Notice[：:]\s*(?:The\s+)?content\s+above/i,
  /^\s*(?:举报|反馈|投诉|意见反馈|用户协议|隐私政策|Cookie|广告|推广)\s*$/i,
  /(?:号|百家号|企鹅号|大风号|头条号|网易号).*?(?:仅代表|不代表).*?(?:观点|立场)/,
  /(?:本文|此文)(?:仅代表|不代表).*?(?:作者|笔者|编者).*?(?:观点|立场)/,
  /(?:评论区|评论列表|精彩评论|热门评论|最新评论|全部评论)\s*(?:加载|更多|展开|收起)?/,
  /(?:文明上网|理性发言|请遵守|请勿发布|禁止发布).*?(?:违法违规|侵权|人身攻击)/,
  /^\s*(?:相关搜索|相关推荐|热门推荐|为您推荐|猜你喜欢|大家还在看)\s*$/i,
  /^\s*(?:阅读更多|查看全文|展开全文|继续阅读|下一页|上一页|返回首页?)\s*$/i,
  /(?:扫描|扫码|二维码|长按识别).*?(?:关注|下载|打开|查看)/,
  /(?:打开|下载)\s*(?:APP|客户端|应用).*?(?:阅读|查看|体验)/,
  /^\s*(?:分享到?|转发(?:到)?|收藏|点赞|赞|在看)\s*$/i,
  /(?:本文来源?|来源?[：:]|出处[：:])\s*(?:https?:\/\/)?(?:www\.)?\S+/i,
  /(?:责任[编辑编]|责编|编辑)[：:]\s*\S+/,
  /(?:未经(?:许可|授权|允许)|严禁转载|禁止转载)/,
];

function hasChineseMediaBoilerplate(text: string): boolean {
  return CHINESE_MEDIA_BOILERPLATE.some((pattern) => pattern.test(text));
}


function isStandaloneNavigationLabel(value: string): boolean {
  const normalized = value
    .replace(/[*_`#>|\s]+/gu, "")
    .replace(/[：:·•\-—–]+$/gu, "");
  if (!normalized) return true;
  if (CHINESE_UI_NOISE_PATTERN.test(normalized)) return true;
  if (normalized.length % 2 !== 0) return false;
  const half = normalized.length / 2;
  return normalized.slice(0, half) === normalized.slice(half)
    && CHINESE_UI_NOISE_PATTERN.test(normalized.slice(0, half));
}

function navigationStats(tokens: string[]): { shortRatio: number; uniqueCount: number } {
  const normalized = tokens
    .map((token) => token.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter(Boolean);
  return {
    shortRatio: tokens.filter((token) => token.length <= 12).length / Math.max(tokens.length, 1),
    uniqueCount: new Set(normalized).size,
  };
}

/**
 * Removes a whitespace-separated menu run that a crawler glued in front of a
 * factual sentence. The retained sentence is never paraphrased or truncated.
 */
function stripNavigationChunk(value: string): string {
  const text = value.trim();
  const matches = [...text.matchAll(/\S+/gu)];
  if (matches.length < 8) return text;

  for (let index = 6; index < matches.length; index += 1) {
    const token = matches[index]![0];
    if (!FACTUAL_CUE_PATTERN.test(token)) continue;

    const prefix = matches.slice(0, index).map((match) => match[0]);
    const stats = navigationStats(prefix);
    if (stats.uniqueCount < 6 || stats.shortRatio < 0.7) continue;

    let startIndex = matches[index]!.index ?? 0;
    if (/^(?:现任|担任|is|are|was|were|develops?|provides?|offers?|operates?)/i.test(token) && index >= 1) {
      startIndex = matches[index - 1]!.index ?? startIndex;
    }
    if (/^(?:is|are|was|were|develops?|provides?|offers?|operates?)$/i.test(token) && index >= 2) {
      startIndex = matches[index - 2]!.index ?? startIndex;
    }
    return text.slice(startIndex).trim();
  }

  const stats = navigationStats(matches.map((match) => match[0]));
  if (stats.uniqueCount >= 7 && stats.shortRatio >= 0.8 && !/[。！？.!?]/.test(text)) return "";
  return text;
}

export function stripNavigationBoilerplate(value: string): string {
  const pieces = value.trim().split(/([；;])/u);
  const retained: string[] = [];
  let separator = "";
  for (const piece of pieces) {
    if (piece === "；" || piece === ";") {
      separator = piece;
      continue;
    }
    const cleaned = stripNavigationChunk(piece);
    if (!cleaned) continue;
    if (retained.length > 0 && separator) retained.push(separator);
    retained.push(cleaned);
    separator = "";
  }
  return retained.join("").trim();
}

export function hasNavigationBoilerplate(value: string): boolean {
  const original = value.trim();
  if (!original) return false;
  const stripped = stripNavigationBoilerplate(original);
  return stripped.length + 24 < original.length;
}

export function hasSuspiciousScriptPayload(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (SCRIPT_ASSIGNMENT_PATTERN.test(text) || LONG_ENCODED_TOKEN_PATTERN.test(text)) return true;
  if (/^\s*[{[]?\s*["']?\d+["']?\s*:\s*["']?\s*(?:var|let|const)\b/i.test(text)) return true;

  const compact = text.replace(/\s+/g, "");
  const encoded = compact.match(/[A-Za-z0-9+/=]/g)?.length ?? 0;
  const chinese = compact.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const whitespace = text.match(/\s/g)?.length ?? 0;
  return compact.length >= 160 && whitespace <= 2 && chinese < 6 && encoded / compact.length >= 0.92;
}

function stripSuspiciousPayloadLines(value: string): string {
  return value
    .split(/\r?\n/u)
    .filter((line) => {
      const text = line.trim();
      if (!text) return true;
      if (hasSuspiciousScriptPayload(text)) return false;
      if (PUNCTUATION_ONLY_PATTERN.test(text)) return false;
      return !/^\s*(?:["'}\]]+|[{[]\s*)\s*[;,]?\s*$/u.test(text);
    })
    .join("\n");
}

/**
 * Cleans user-facing report text without paraphrasing valid content.
 * It removes crawler/runtime payloads and generic evidence lead-ins only.
 */
export function sanitizeReportText(value: string): string {
  return stripNavigationBoilerplate(stripSuspiciousPayloadLines(value))
    .replace(REPORT_PREFIX_PATTERN, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

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
    .split(/(?<=[.!?\u3002\uFF01\uFF1F])\s+|\n+/)
    .map((segment) => stripNavigationBoilerplate(segment.replace(/\s+/g, " ").trim()))
    .filter((segment) => !hasSuspiciousScriptPayload(segment))
    .filter((segment) => segment.length >= 3 && !NOISE_PATTERN.test(segment))
    .filter((segment) => !isStandaloneNavigationLabel(segment))
    .filter((segment) => {
      const words = segment.split(/\s+/).filter(Boolean);
      const shortWords = words.filter((word) => word.length <= 8).length;
      const uniqueWords = new Set(words.map((word) => word.toLowerCase())).size;
      return !(words.length >= 7 && uniqueWords >= 5 && shortWords / words.length >= 0.8 && !/[.!?\u3002\uFF01\uFF1F]/.test(segment));
    });
}

function isMenuBarLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 60 || trimmed.length > 400) return false;
  // Menu bars are concatenations of short navigation labels separated by spaces.
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 8) return false;
  const unique = new Set(tokens.map((t) => t.toLowerCase()));
  // Low uniqueness + many short tokens = navigation bar, not prose.
  if (unique.size < 4) return true;
  const shortTokens = tokens.filter((t) => t.length <= 8);
  if (shortTokens.length / tokens.length >= 0.7 && unique.size <= 5) return true;
  // Check for menu-like token patterns: no verbs, no dates, no sentences
  const hasDateOrFact = /20\d{2}|发布|宣布|合作|推出|完成|实现|研发|生产|销售|提供|拥有|位于|创立|成立于/.test(trimmed);
  const hasSentenceEnd = /[。！？.!?]/.test(trimmed);
  return !hasDateOrFact && !hasSentenceEnd && unique.size / tokens.length < 0.3;
}

export function cleanSourceText(value: string): string {
  const decoded = stripSuspiciousPayloadLines(decodeHtmlEntities(value)
    // Remove image alt text completely — "（图1 ...）" is not useful evidence.
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    // Keep link text for content links but mark them for menu detection.
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^(?:title|url source|published time|markdown content)\s*:\s*.*$/gim, " ")
    .replace(/\b(?:skip to main content|search menu|investor room|all rights reserved)\b/gi, " ")
    .replace(/\b(?:cookie consent|privacy policy|terms of (?:use|service)|accept all|copyright(?: \d{4})?|menu|search)\b/gi, " ")
    // Remove image captions
    .replace(IMAGE_ALT_PATTERN, " ")
    // Keep line boundaries until navigation and boilerplate can be filtered.
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // Remove menu-bar lines and media boilerplate before meaningfulSegments
    .split("\n")
    .filter((line) => !isMenuBarLine(line))
    .filter((line) => !hasChineseMediaBoilerplate(line))
    .join("\n")
    .trim());
  return meaningfulSegments(decoded)
    .filter((segment) => !hasChineseMediaBoilerplate(segment))
    .join("\n\n").slice(0, 80_000);
}

export function selectEvidenceExcerpts(source: Source, focus: string[] = []): string {
  const cleaned = cleanSourceText(source.content);
  const segments = meaningfulSegments(cleaned).filter((segment) => segment.length >= 20);
  const keywords = focus.map((keyword) => keyword.toLowerCase()).filter(Boolean);
  const seen = new Set<string>();
  const ranked = segments.map((segment, index) => {
    const normalized = segment.toLowerCase();
    let score = Math.min(segment.length, 300) / 150;
    for (const keyword of keywords) if (normalized.includes(keyword)) score += 5;
    if (/\b20\d{2}\b|近期|发布|宣布|合作|launch|announce|partner|news/i.test(segment)) score += 3;
    if (/融资|投资|上市|估值|营收|增长|客户|合作|产品|技术|创始人|团队|招聘/i.test(segment)) score += 3;
    if (/company|about|manufacturer|product|service|customer|market|公司|企业|产品|服务|客户|市场/i.test(segment)) score += 1;
    return { segment, normalized: normalized.replace(/[^\p{L}\p{N}]+/gu, " ").slice(0, 200), score, index };
  }).filter((item) => {
    if (seen.has(item.normalized)) return false;
    seen.add(item.normalized);
    return true;
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  // 取前 8 句（之前 5 句可能漏信息），截断到 6000 字减轻 LLM 负担
  const selected = ranked.slice(0, 8).sort((left, right) => left.index - right.index).map((item) => item.segment);
  return (selected.length ? selected.join(" ") : cleaned.slice(0, 1_500)).slice(0, 6_000);
}

export function isReadableChinese(value: string): boolean {
  const text = value.trim();
  if (!text || /&(?:#x?[0-9a-f]+|[a-z][a-z0-9]+);/i.test(text) || GARBLED_PATTERN.test(text) || hasSuspiciousScriptPayload(text)) return false;
  const chinese = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latin = text.match(/[a-z]/gi)?.length ?? 0;
  return chinese >= 6 && chinese / Math.max(chinese + latin, 1) >= 0.25;
}

/**
 * User-facing research prose must be Chinese. A short English brand or product
 * name is allowed, but untranslated sentences and crawler UI fragments are not.
 */
export function isUserFacingChineseText(value: string): boolean {
  const text = value.trim();
  if (!text || PUNCTUATION_ONLY_PATTERN.test(text) || hasSuspiciousScriptPayload(text)) return false;
  if ((text.match(/[\u3400-\u9fff]/g)?.length ?? 0) > 0) return true;
  if (ENGLISH_UI_NOISE_PATTERN.test(text) || /[.!?]$/.test(text)) return false;

  const words = text.match(/[A-Za-z][A-Za-z0-9.+&'’/-]*/g) ?? [];
  if (!words.length || words.length > 4 || text.length > 48) return false;
  return words.every((word) => /^[A-Z0-9]/.test(word));
}

export function sanitizeChineseOutput(value: string): string {
  return sanitizeReportText(cleanSourceText(value))
    .replace(/[（(]\s*(?:来源|source)\s*[:：][^)）]+[)）]/gi, "")
    .replace(/(?:来源|source)\s*[:：]\s*[a-z0-9_-]{6,}/gi, "")
    .replace(/\s+([，。！？；：])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
