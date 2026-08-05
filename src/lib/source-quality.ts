import type { ResearchInput, Source } from "@/lib/types";

export type EvidenceCategory = "company" | "product" | "news" | "business_signal";

export type SourceAssessment = {
  source: Source;
  eligible: boolean;
  categories: EvidenceCategory[];
  score: number;
  reason?: string;
};

export type SourceSelectionContext = Pick<ResearchInput, "customIndustry" | "preset" | "sellerProfile">;

const JUNK_PATTERN = /(?:^|[\s/_-])(admin|login|signin|sign-in|captcha|wp-admin)(?:[\s/_-]|$)|casino|slot/i;
const COMPANY_PATTERN = /(?:about|about-us|company|profile|corporate|who-we-are|overview|\u5173\u4e8e|\u516c\u53f8\u7b80\u4ecb|\u4f01\u4e1a\u4ecb\u7ecd)/i;
const PRODUCT_PATTERN = /(?:product|products|service|services|solution|solutions|platform|software|tools?|assistant|api|sdk|oem|odm|\u4ea7\u54c1|\u670d\u52a1|\u89e3\u51b3\u65b9\u6848|\u6838\u5fc3\u4e1a\u52a1|\u5de5\u5177|\u52a9\u624b|\u5f00\u653e\u63a5\u53e3|\u4e1a\u52a1)/i;
const NEWS_PATTERN = /(?:news|press|blog|article|announcement|media|update|\u65b0\u95fb|\u8d44\u8baf|\u516c\u544a|\u53d1\u5e03|\u52a8\u6001)/i;
const SIGNAL_PATTERN = /(?:case|customer|client|partner|career|hiring|recruit|investor|funding|expansion|\u5408\u4f5c|\u5ba2\u6237|\u6848\u4f8b|\u62db\u8058|\u6295\u8d44|\u878d\u8d44|\u6269\u5f20)/i;
const PROMOTIONAL_PAGE_PATTERN = /(?:\u4f18\u60e0\u5238|\u6298\u540e|\u9650\u65f6\u6298\u6263|casino|coupon|promo\s*code)/i;
const CAREER_OR_JOB_PATTERN = /(?:^|[\/\s_-])(career|careers|jobs?|hiring|recruit|recruitment)(?:[\/\s_-]|$)|\u62db\u8058|\u804c\u4f4d|\u6c42\u804c/i;
const HELP_OR_SUPPORT_PATTERN = /(?:^|\.)(help|support)\.|\/(?:help|support|hc|docs?)(?:\/|$)|\u5e2e\u52a9\u4e2d\u5fc3|\u5e38\u89c1\u95ee\u9898/i;
const CORE_COMPANY_PATTERN = /\/(?:about|about-us|company|corporate|profile|overview|who-we-are)(?:\/|$)|\u5173\u4e8e\u6211\u4eec|\u516c\u53f8\u4ecb\u7ecd/i;
const CORE_PRODUCT_PATTERN = /\/(?:products?|services?|solutions?|platform|commerce)(?:\/|$)|\u4ea7\u54c1|\u670d\u52a1|\u89e3\u51b3\u65b9\u6848/i;

const PRIMARY_EXTERNAL_DOMAINS = [
  /(?:^|\.)gov\.cn$/i,
  /(?:^|\.)sse\.com\.cn$/i,
  /(?:^|\.)cninfo\.com\.cn$/i,
  /(?:^|\.)thepaper\.cn$/i,
  /(?:^|\.)eastmoney\.com$/i,
  /(?:^|\.)cyzone\.cn$/i,
];
const SECONDARY_EXTERNAL_DOMAINS = [
  /(?:^|\.)163\.com$/i,
  /(?:^|\.)qq\.com$/i,
  /(?:^|\.)sohu\.com$/i,
  /(?:^|\.)donews\.com$/i,
];

function categorize(source: Source): EvidenceCategory[] {
  const inspected = `${source.url} ${source.title} ${source.content.slice(0, 1_600)}`.toLowerCase();
  const categories: EvidenceCategory[] = [];
  if (COMPANY_PATTERN.test(inspected)) categories.push("company");
  if (PRODUCT_PATTERN.test(inspected)) categories.push("product");
  if (NEWS_PATTERN.test(inspected) || source.sourceType === "news") categories.push("news");
  if (SIGNAL_PATTERN.test(inspected)) categories.push("business_signal");
  return categories.length ? categories : ["company"];
}

function sourceTrustScore(source: Source): number {
  if (source.sourceType === "official") return 100;
  let hostname = "";
  try {
    hostname = new URL(source.url).hostname;
  } catch {
    return 30;
  }
  if (PRIMARY_EXTERNAL_DOMAINS.some((pattern) => pattern.test(hostname))) return 92;
  if (SECONDARY_EXTERNAL_DOMAINS.some((pattern) => pattern.test(hostname))) return 76;
  if (source.sourceType === "registry") return 84;
  if (source.sourceType === "news") return 64;
  return 50;
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

const GENERIC_RELEVANCE_TERMS = new Set([
  "公司", "目标", "产品", "服务", "平台", "系统", "行业", "客户", "方案", "技术",
  "智能", "销售", "管理", "提供", "进行", "相关", "业务", "企业", "应用",
  "the", "and", "for", "with", "from", "sdk", "api", "ai",
]);

function relevanceTerms(context?: SourceSelectionContext): string[] {
  if (!context) return [];
  const raw = [
    context.customIndustry ?? "",
    context.sellerProfile.productName,
    context.sellerProfile.valueProposition,
    context.sellerProfile.targetCustomer,
    ...context.sellerProfile.customerProblems,
  ].join(" ").toLowerCase();
  const terms = new Set<string>();
  for (const token of raw.match(/[a-z][a-z0-9.+_-]{2,}|[\u3400-\u9fff]{2,}/gi) ?? []) {
    if (/^[\u3400-\u9fff]+$/u.test(token)) {
      if (token.length <= 8) terms.add(token);
      for (let size = 2; size <= Math.min(4, token.length); size += 1) {
        for (let index = 0; index <= token.length - size; index += 1) {
          terms.add(token.slice(index, index + size));
        }
      }
    } else {
      terms.add(token);
    }
  }
  return [...terms]
    .filter((term) => term.length >= 2 && !GENERIC_RELEVANCE_TERMS.has(term))
    .slice(0, 80);
}

function productRelevanceScore(source: Source, context?: SourceSelectionContext): number {
  const terms = relevanceTerms(context);
  if (!terms.length) return 0;
  const title = source.title.toLowerCase();
  const url = source.url.toLowerCase();
  const content = source.content.slice(0, 16_000).toLowerCase();
  let score = 0;
  let matched = 0;
  for (const term of terms) {
    const inTitle = title.includes(term);
    const inUrl = url.includes(term);
    const inContent = content.includes(term);
    if (!inTitle && !inUrl && !inContent) continue;
    matched += 1;
    if (inTitle) score += 14;
    if (inUrl) score += 8;
    if (inContent) score += term.length >= 4 ? 5 : 2;
  }
  if (matched >= 3) score += 24;
  if (matched >= 6) score += 24;
  return Math.min(score, 120);
}

export function assessSource(
  source: Source,
  targetUrl: string,
  context?: SourceSelectionContext,
): SourceAssessment {
  const inspected = `${source.url} ${source.title}`;
  if (JUNK_PATTERN.test(inspected)) {
    return { source, eligible: false, categories: [], score: 0, reason: "low_value_page" };
  }
  if (PROMOTIONAL_PAGE_PATTERN.test(`${source.title} ${source.content.slice(0, 1_200)}`)) {
    return { source, eligible: false, categories: [], score: 0, reason: "commercial_promotion" };
  }

  const firstParty = sameOrigin(source.url, targetUrl);
  const minimumLength = firstParty || source.sourceType === "official" ? 20 : 180;
  if (source.content.trim().length < minimumLength) {
    return { source, eligible: false, categories: [], score: 0, reason: "content_too_small" };
  }

  const categories = categorize(source);
  const lengthScore = Math.min(Math.floor(source.content.trim().length / 240), 24);
  const categoryScore = Math.min(categories.length, 3) * 7;
  const firstPartyBonus = firstParty ? 30 : 0;
  const corePageBonus = CORE_COMPANY_PATTERN.test(inspected) ? 45 : CORE_PRODUCT_PATTERN.test(inspected) ? 38 : 0;
  const lowPurposePenalty = CAREER_OR_JOB_PATTERN.test(inspected) ? 70 : HELP_OR_SUPPORT_PATTERN.test(inspected) ? 55 : 0;
  const relevanceScore = productRelevanceScore(source, context);

  return {
    source,
    eligible: true,
    categories,
    score: sourceTrustScore(source) + lengthScore + categoryScore + firstPartyBonus + corePageBonus + relevanceScore - lowPurposePenalty,
  };
}

const CATEGORY_ORDER: EvidenceCategory[] = ["company", "product", "news", "business_signal"];

export function selectReportSources(
  sources: Source[],
  targetUrl: string,
  limit = 20,
  context?: SourceSelectionContext,
): Source[] {
  const assessments = sources
    .map((source) => assessSource(source, targetUrl, context))
    .filter((assessment) => assessment.eligible)
    .sort((left, right) => right.score - left.score || left.source.url.localeCompare(right.source.url));

  const selected: Source[] = [];
  const selectedIds = new Set<string>();

  for (const category of CATEGORY_ORDER) {
    const assessment = assessments.find((item) => item.categories.includes(category) && !selectedIds.has(item.source.id));
    if (!assessment) continue;
    selected.push(assessment.source);
    selectedIds.add(assessment.source.id);
    if (selected.length >= limit) return selected;
  }

  for (const assessment of assessments) {
    if (selectedIds.has(assessment.source.id)) continue;
    selected.push(assessment.source);
    selectedIds.add(assessment.source.id);
    if (selected.length >= limit) break;
  }
  return selected;
}

export type EvidenceReadiness = {
  ready: boolean;
  hasCompanyIdentity: boolean;
  hasProductEvidence: boolean;
  reasons: string[];
};

/**
 * Cheap pre-model guard. It prevents spending LLM tokens on a corpus that
 * cannot support the two foundations of a sales report: who the target is and
 * what it actually provides.
 */
export function assessEvidenceReadiness(sources: Source[], targetUrl: string): EvidenceReadiness {
  const eligible = sources
    .map((source) => assessSource(source, targetUrl))
    .filter((assessment) => assessment.eligible);
  const hasCompanyIdentity = eligible.some(({ source, categories }) =>
    (source.sourceType === "official" || source.sourceType === "registry")
    && source.content.trim().length >= 55
    && (categories.includes("company") || sameOrigin(source.url, targetUrl)),
  );
  const hasProductEvidence = eligible.some(({ source, categories }) =>
    source.content.trim().length >= 55
    && categories.includes("product")
    && (source.sourceType === "official" || source.sourceType === "registry" || sameOrigin(source.url, targetUrl)),
  );
  const reasons = [
    hasCompanyIdentity ? "" : "缺少可确认目标公司身份的官方资料",
    hasProductEvidence ? "" : "缺少可确认主营产品或服务的第一方资料",
  ].filter(Boolean);
  return { ready: hasCompanyIdentity && hasProductEvidence, hasCompanyIdentity, hasProductEvidence, reasons };
}
