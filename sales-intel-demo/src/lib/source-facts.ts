import { cleanSourceText, isUserFacingChineseText } from "@/lib/evidence";
import type { CustomerIntelligence, ResearchField, ResearchListItem, Source } from "@/lib/types";
import { insufficientField, verifiedField } from "@/lib/types";

export interface SourceFactBundle {
  sourceId: string;
  companyOverview?: ResearchField;
  productsAndServices: ResearchListItem[];
  targetCustomersAndMarket?: ResearchField;
  businessModel?: ResearchField;
  productPositioning?: ResearchField;
  scaleAndCapability?: ResearchField;
  recentUpdates: ResearchListItem[];
  signals: ResearchListItem[];
}

export interface MergedSourceFacts {
  customerIntelligence: CustomerIntelligence;
  signals: ResearchListItem[];
}

const PRODUCT_PATTERN = /(?:\u4ea7\u54c1|\u670d\u52a1|\u89e3\u51b3\u65b9\u6848|\u4e1a\u52a1|\u5e73\u53f0|\u7cfb\u7edf|\u5de5\u5177|\u5546\u5e97|\u652f\u4ed8|\u7269\u6d41|\u6e38\u620f|\u5e94\u7528|\u5185\u5bb9|\bIP\b|product|service|solution|platform|software|game|application|payments?|commerce|logistics)/i;
const MARKET_PATTERN = /(?:\u5ba2\u6237|\u5e02\u573a|\u7528\u6237|\u884c\u4e1a|\u6d88\u8d39\u8005|\u5546\u5bb6|\u54c1\u724c|\u4f01\u4e1a\u5ba2\u6237|customer|market|client|consumer|merchant|brand)/i;
const MODEL_PATTERN = /(?:\u8ba2\u9605|\u6536\u8d39|\u9500\u552e|\u76f4\u8425|\u7ecf\u9500|\u96f6\u552e|\u6279\u53d1|\u52a0\u76df|\u7535\u5546|\u4f1a\u5458|subscription|retail|wholesale|marketplace|saas|commission)/i;
const POSITION_PATTERN = /(?:\u5b9a\u4f4d|\u4e13\u6ce8|\u81f4\u529b\u4e8e|\u9762\u5411|\u9886\u5148|\u4e00\u4f53\u5316|\u7edf\u4e00\u5546\u4e1a|focus|position|speciali[sz]e|leading|unified|all-in-one)/i;
const SCALE_PATTERN = /(?:\u5458\u5de5|\u56e2\u961f|\u5de5\u5382|\u4ea7\u80fd|\u95e8\u5e97|\u4ed3\u5e93|\u7814\u53d1|\u751f\u4ea7|\u57fa\u5730|\u8986\u76d6.{0,16}(?:\u56fd\u5bb6|\u57ce\u5e02|\u5e02\u573a)|\u5168\u7403(?:\u56e2\u961f|\u4e1a\u52a1|\u5e02\u573a|\u8fd0\u8425|\u53d1\u884c)|million|employees|team|factory|capacity|warehouse|countries|markets)/i;
const UPDATE_PATTERN = /(?:\u53d1\u5e03|\u63a8\u51fa|\u4e0a\u7ebf|\u5408\u4f5c|\u878d\u8d44|\u6269\u5efa|\u5f00\u4e1a|\u83b7\u5956|\u62db\u8058|\u8ba1\u5212|\u589e\u957f|\u5b8c\u6210|\u4e0b\u7ebf|launch|partnership|funding|expand|opened|hiring|growth|announced)/i;
const COMPANY_PATTERN = /(?:\u516c\u53f8|\u96c6\u56e2|\u54c1\u724c|\u4f01\u4e1a|\u6211\u4eec|about|founded|is a|is an|provides|offers|platform)/i;
const JOB_PAGE_PATTERN = /(?:^|[\/\s_-])(career|careers|jobs?|hiring|recruit|recruitment)(?:[\/\s_-]|$)|\u62db\u8058|\u804c\u4f4d|\u6c42\u804c/i;
const HELP_PAGE_PATTERN = /(?:^|\.)(help|support)\.|\/(?:help|support|hc|docs?)(?:\/|$)|\u5e2e\u52a9\u4e2d\u5fc3|\u5e38\u89c1\u95ee\u9898/i;
const SEARCH_SUMMARY_PATTERN = /\[\s*\u641c\u7d22\u6458\u8981\s*]|\u641c\u7d22\u7ed3\u679c|\u6c42\u804c\u8005\u63d0\u4f9b|BOSS\u76f4\u8058|JobsDB/i;
const PLACEHOLDER_PATTERN = /\u7b49\u5f85\u6a21\u578b|\u5f85\u6a21\u578b|\u6682\u672a\u751f\u6210|\u4fe1\u606f\u5f85\u8865\u5145/i;
const COMPANY_PAGE_PATTERN = /\/(?:about|about-us|company|corporate|profile|overview|who-we-are)\/?(?:[?#\s]|$)|关于我们|公司介绍|公司简介|企业介绍|企业简介/i;
const PRODUCT_PAGE_PATTERN = /\/(?:products?|services?|solutions?|platform|docs?)(?:[/?#\s]|$)|产品|服务|解决方案|开放能力|接口文档/i;
const NEWS_PAGE_PATTERN = /\/(?:news|press|blog|article|announcement|media|updates?)(?:[/?#\s]|$)|新闻|公告|发布|动态|资讯/i;
const CONTACT_PAGE_PATTERN = /\/(?:contact|contact-us)(?:[/?#\s]|$)|联系我们|联系方式/i;
const BUSINESS_SIGNAL_PAGE_PATTERN = /\/(?:case|cases|customer|customers|client|clients|partner|partners|investor)(?:[/?#\s]|$)|客户案例|合作伙伴|投资者关系/i;
const DATE_PATTERN = /(?:20\d{2}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?|\d{1,2}月\d{1,2}日)/;
const NON_RESEARCH_PAGE_PATTERN = /\/(?:contact|contact-us|jubao|report|complaint|feedback|legal|privacy|terms|integrity|ethics|anti-corruption)(?:[/?#\s]|$)|联系我们|联系方式|举报|投诉|隐私政策|用户协议|廉正|廉政|合规/i;
const CONTACT_OR_LEGAL_FACT_PATTERN = /(?:举报|投诉|廉正|廉政|合规开展业务|客服|热线|联系电话|电话服务时间|工作时间|举报邮箱|联系邮箱|联系地址|增值电信业务经营许可证|公网安备|ICP备|网文|未成年|隐私政策|用户协议)/i;
const RESEARCH_REPORT_PATTERN = /\.pdf(?:[?#]|$)|研究报告|行业报告|白皮书/i;

function compact(value: string, max = 700): string {
  return value.replace(/\s+/g, " ").replace(/[#*_>`]/g, "").trim().slice(0, max);
}

function isNavigationLike(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  const unique = new Set(words.map((word) => word.toLowerCase()));
  const shortRatio = words.filter((word) => word.length <= 12).length / Math.max(words.length, 1);
  return words.length >= 7 && unique.size >= 6 && shortRatio >= 0.75 && !/[。！？.!?]/.test(value);
}

function isShortMarketingSlogan(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (/[。！？]/.test(value) || value.length >= 80) return false;
  return words.length <= 10 && /growth|accelerat|all-in-one|empower|future|better|limitless|explore|learn more/i.test(value);
}

function isSubstantive(value: string): boolean {
  const text = value.trim();
  if (text.length < 18 || SEARCH_SUMMARY_PATTERN.test(text) || PLACEHOLDER_PATTERN.test(text)) return false;
  if (!isUserFacingChineseText(text)) return false;
  if (isNavigationLike(text) || isShortMarketingSlogan(text)) return false;
  if (/^(?:home|products?|services?|news|about|contact|login|register|search)(?:\s|$)/i.test(text)) return false;
  if (/\.{3,}$|…$/.test(text) && text.length < 80) return false;
  return true;
}

function meaningfulSentences(source: Source): string[] {
  return cleanSourceText(source.content)
    .replace(/\[[^\]]+]\([^)]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .split(/\n{2,}|(?<=[。！？.!?])\s+/)
    .map((item) => compact(item))
    .filter(isSubstantive);
}

function isHomepage(source: Source): boolean {
  try {
    const path = new URL(source.url).pathname.replace(/\/+/g, "/");
    return path === "/" || path === "";
  } catch {
    return false;
  }
}

function isCompanyProfileSource(source: Source): boolean {
  const purpose = `${source.url} ${source.title}`;
  if (NON_RESEARCH_PAGE_PATTERN.test(purpose)) return false;
  return source.sourceType === "registry"
    || (source.sourceType === "official" && isHomepage(source))
    || COMPANY_PAGE_PATTERN.test(purpose);
}

function isProductSource(source: Source): boolean {
  const purpose = `${source.url} ${source.title}`;
  if (NON_RESEARCH_PAGE_PATTERN.test(purpose)) return false;
  return isHomepage(source) || PRODUCT_PAGE_PATTERN.test(purpose) || source.sourceType === "news";
}

function isRecentUpdateSource(source: Source): boolean {
  const purpose = `${source.url} ${source.title}`;
  return source.sourceType === "news" || NEWS_PAGE_PATTERN.test(purpose);
}

function isBusinessSignalSource(source: Source): boolean {
  return isRecentUpdateSource(source) || BUSINESS_SIGNAL_PAGE_PATTERN.test(`${source.url} ${source.title}`);
}

export function sourceSupportsFactField(source: Source | undefined, key: FactFieldKey): boolean {
  if (!source) return false;
  const purpose = `${source.url} ${source.title}`;
  const jobPage = JOB_PAGE_PATTERN.test(purpose);
  const helpPage = HELP_PAGE_PATTERN.test(purpose);
  const contactPage = CONTACT_PAGE_PATTERN.test(purpose);
  const nonResearchPage = NON_RESEARCH_PAGE_PATTERN.test(purpose);
  const updatePage = isRecentUpdateSource(source);
  if (jobPage || helpPage || contactPage || nonResearchPage) return false;

  if (key === "companyOverview") return isCompanyProfileSource(source);
  if (key === "scaleAndCapability") {
    return source.sourceType === "registry"
      || isCompanyProfileSource(source)
      || source.sourceType === "news"
      || RESEARCH_REPORT_PATTERN.test(purpose)
      || (source.sourceType === "official" && !updatePage);
  }
  return isCompanyProfileSource(source)
    || isProductSource(source)
    || source.sourceType === "news"
    || RESEARCH_REPORT_PATTERN.test(purpose)
    || (source.sourceType === "official" && !updatePage);
}

function isDatedUpdate(item: ResearchListItem, sourceMap: Map<string, Source>): boolean {
  return DATE_PATTERN.test(item.value)
    || item.sourceIds.some((id) => Boolean(sourceMap.get(id)?.publishedAt));
}

function field(value: string | undefined, sourceId: string): ResearchField | undefined {
  return value ? verifiedField(value, [sourceId]) : undefined;
}

function items(sentences: string[], pattern: RegExp, sourceId: string, limit: number): ResearchListItem[] {
  return sentences
    .filter((sentence) => pattern.test(sentence))
    .slice(0, limit)
    .map((value) => ({ value, status: "verified" as const, sourceIds: [sourceId] }));
}

function isValidProductFact(value: string): boolean {
  return isSubstantive(value) && !CONTACT_OR_LEGAL_FACT_PATTERN.test(value);
}

export function extractDeterministicSourceFacts(source: Source): SourceFactBundle {
  const sentences = meaningfulSentences(source);
  const purposeText = `${source.url} ${source.title}`;
  const jobPage = JOB_PAGE_PATTERN.test(purposeText);
  const helpPage = HELP_PAGE_PATTERN.test(purposeText);
  const companyProfilePage = isCompanyProfileSource(source);
  const productPage = isProductSource(source);
  const recentUpdatePage = isRecentUpdateSource(source);
  const overview = jobPage || helpPage || !companyProfilePage
    ? undefined
    : sentences.find((sentence) => COMPANY_PATTERN.test(sentence)) ?? sentences[0];
  const updates = recentUpdatePage
    ? items(sentences, UPDATE_PATTERN, source.id, 3)
      .filter((item) => DATE_PATTERN.test(item.value) || Boolean(source.publishedAt))
    : [];

  return {
    sourceId: source.id,
    companyOverview: field(overview, source.id),
    productsAndServices: jobPage || (!productPage && !companyProfilePage && source.sourceType !== "news")
      ? []
      : items(sentences, PRODUCT_PATTERN, source.id, 3).filter((item) => isValidProductFact(item.value)),
    targetCustomersAndMarket: sourceSupportsFactField(source, "targetCustomersAndMarket")
      ? field(sentences.find((sentence) => MARKET_PATTERN.test(sentence)), source.id)
      : undefined,
    businessModel: sourceSupportsFactField(source, "businessModel")
      ? field(sentences.find((sentence) => MODEL_PATTERN.test(sentence)), source.id)
      : undefined,
    productPositioning: sourceSupportsFactField(source, "productPositioning")
      ? field(sentences.find((sentence) => POSITION_PATTERN.test(sentence)), source.id)
      : undefined,
    scaleAndCapability: sourceSupportsFactField(source, "scaleAndCapability")
      ? field(sentences.find((sentence) => SCALE_PATTERN.test(sentence)), source.id)
      : undefined,
    recentUpdates: updates,
    signals: updates,
  };
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function sourceScore(source: Source | undefined): number {
  if (!source) return 0;
  const purpose = `${source.url} ${source.title}`;
  let score = source.sourceType === "official" ? 100 : source.sourceType === "registry" ? 80 : source.sourceType === "news" ? 60 : 35;
  if (/\/(?:about|about-us|company|profile|overview|products?|services?|solutions?)(?:\/|$)/i.test(purpose)) score += 45;
  if (JOB_PAGE_PATTERN.test(purpose)) score -= 120;
  if (HELP_PAGE_PATTERN.test(purpose)) score -= 45;
  return score;
}

function fieldSourceScore(source: Source | undefined, key: FactFieldKey): number {
  if (!source) return -1_000;
  if (!sourceSupportsFactField(source, key)) return -1_000;
  let score = sourceScore(source);
  if (key === "companyOverview" && isCompanyProfileSource(source)) score += 120;
  if ((key === "businessModel" || key === "productPositioning") && isProductSource(source)) score += 35;
  if (CONTACT_PAGE_PATTERN.test(`${source.url} ${source.title}`)) score -= 80;
  return score;
}

function valueScore(value: string): number {
  if (!isSubstantive(value)) return -1_000;
  const chinese = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const english = value.match(/[a-z]/gi)?.length ?? 0;
  const languageScore = chinese >= 12 ? 30 : english >= 60 ? 12 : 0;
  return languageScore + Math.min(value.length, 500) / 20;
}

function uniqueRankedItems(items: ResearchListItem[], sourceMap: Map<string, Source>, limit: number): ResearchListItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => isSubstantive(item.value))
    .map((item) => ({
      item,
      score: valueScore(item.value) + Math.max(...item.sourceIds.map((id) => sourceScore(sourceMap.get(id))), 0),
    }))
    .sort((left, right) => right.score - left.score)
    .filter(({ item }) => {
      const key = normalizeKey(item.value).slice(0, 180);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ item }) => item);
}

export type FactFieldKey = "companyOverview" | "targetCustomersAndMarket" | "businessModel" | "productPositioning" | "scaleAndCapability";

function bestField(
  bundles: SourceFactBundle[],
  sourceMap: Map<string, Source>,
  key: FactFieldKey,
  missing: string,
): ResearchField {
  const candidates = bundles
    .map((bundle) => bundle[key])
    .filter((value): value is ResearchField => Boolean(value?.value && isSubstantive(value.value)))
    .map((value) => ({
      value,
      score: valueScore(value.value!) + Math.max(...value.sourceIds.map((id) => fieldSourceScore(sourceMap.get(id), key)), -1_000),
    }))
    .filter((candidate) => candidate.score > -500)
    .sort((left, right) => right.score - left.score);

  if (!candidates.length) return insufficientField(missing);
  const selected: ResearchField[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = normalizeKey(candidate.value.value!);
    if ([...seen].some((keyValue) => keyValue.includes(normalized) || normalized.includes(keyValue))) continue;
    selected.push(candidate.value);
    seen.add(normalized);
    if (selected.length >= 2) break;
  }
  const combined = selected.map((item) => item.value!.replace(/[。.!?]+$/, "")).join("；") + "。";
  return verifiedField(combined.slice(0, 1_400), [...new Set(selected.flatMap((item) => item.sourceIds))].slice(0, 10));
}

export function mergeSourceFactBundles(bundles: SourceFactBundle[], sources: Source[] = []): MergedSourceFacts {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const productsAndServices = uniqueRankedItems(
    bundles
      .flatMap((bundle) => bundle.productsAndServices)
      .filter((item) => isValidProductFact(item.value))
      .filter((item) => item.sourceIds.some((id) => {
        const source = sourceMap.get(id);
        return Boolean(source && (isProductSource(source) || isCompanyProfileSource(source)));
      })),
    sourceMap,
    6,
  );
  const recentUpdates = uniqueRankedItems(
    bundles
      .flatMap((bundle) => bundle.recentUpdates)
      .filter((item) => item.sourceIds.some((id) => {
        const source = sourceMap.get(id);
        return Boolean(source && isRecentUpdateSource(source));
      }))
      .filter((item) => isDatedUpdate(item, sourceMap)),
    sourceMap,
    5,
  );
  const signals = uniqueRankedItems(
    bundles
      .flatMap((bundle) => bundle.signals)
      .filter((item) => item.sourceIds.some((id) => {
        const source = sourceMap.get(id);
        return Boolean(source && isBusinessSignalSource(source));
      })),
    sourceMap,
    5,
  );

  const customerIntelligence: CustomerIntelligence = {
    companyOverview: bestField(bundles, sourceMap, "companyOverview", "未从公开正文中整理出可靠的公司概况。"),
    productsAndServices,
    targetCustomersAndMarket: bestField(bundles, sourceMap, "targetCustomersAndMarket", "公开正文未明确目标客户或市场。"),
    businessModel: bestField(bundles, sourceMap, "businessModel", "公开正文未明确商业模式。"),
    productPositioning: bestField(bundles, sourceMap, "productPositioning", "公开正文未明确产品定位。"),
    scaleAndCapability: bestField(bundles, sourceMap, "scaleAndCapability", "公开正文未明确规模与能力。"),
    recentUpdates,
    informationGaps: [],
  };

  customerIntelligence.informationGaps = [
    customerIntelligence.companyOverview.status === "insufficient" ? "公司概况" : "",
    productsAndServices.length ? "" : "产品与服务",
    customerIntelligence.targetCustomersAndMarket.status === "insufficient" ? "目标客户与市场" : "",
    customerIntelligence.businessModel.status === "insufficient" ? "商业模式" : "",
    customerIntelligence.productPositioning.status === "insufficient" ? "产品定位" : "",
    customerIntelligence.scaleAndCapability.status === "insufficient" ? "规模与能力" : "",
  ].filter(Boolean);

  return { customerIntelligence, signals };
}
