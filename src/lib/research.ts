import { dedupeSources, type RawSource } from "@/lib/dedupe";
import { getPreset } from "@/lib/presets";
import type {
  ConversationPlan,
  Coverage,
  CustomerIntelligence,
  OpportunityAnalysis,
  QualityAudit,
  ResearchField,
  ResearchListItem,
  ResearchInput,
  SalesReport,
  SalesVerdict,
  Source,
} from "@/lib/types";
import {
  insufficientField,
  inferredField,
  verifiedField,
} from "@/lib/types";
import { assertPublicHttpUrl } from "@/lib/url-security";
import { enhanceWithLlm } from "@/lib/llm";
import type { AppConfig } from "@/lib/config";
import { cleanSourceText, decodeHtmlEntities } from "@/lib/evidence";
import { selectReportSources, type EvidenceCategory } from "@/lib/source-quality";

export interface CollectionFailure {
  url: string;
  reason: "timeout" | "dns_error" | "http_4xx" | "http_5xx" | "content_too_small" | "not_html" | "collect_error";
  channel?: "direct" | "firecrawl";
  timestamp: string;
}

export interface CollectionResult {
  sources: RawSource[];
  notes: string[];
  warnings: string[];
  coveredCategories: EvidenceCategory[];
  failedSources: CollectionFailure[];
}

export interface CrawlerPort {
  collect(input: ResearchInput): Promise<CollectionResult>;
}

// ─── 四类证据桶 ───

const CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  company: "公司介绍",
  product: "产品/服务",
  news: "新闻动态",
  business_signal: "业务信号",
};

const DIRECT_HEADERS = { "User-Agent": "SalesIntelligenceDemo/0.2", Accept: "text/html,application/xhtml+xml" };

// ─── 研究计划（spec §4.1：每次运行先生成 8 类固定任务）───

export interface ResearchTask {
  id: number;
  label: string;
  categories: EvidenceCategory[];
}

/**
 * 生成 8 类固定研究任务（spec §4.1）。结合行业预设的 researchFocus。
 */
export function buildResearchPlan(input: ResearchInput): ResearchTask[] {
  const focus = getPreset(input.preset).researchFocus;
  const plan: ResearchTask[] = [
    { id: 1, label: "公司与身份", categories: ["company"] },
    { id: 2, label: "产品与服务", categories: ["product"] },
    { id: 3, label: "客户与市场", categories: ["business_signal", "company"] },
    { id: 4, label: "商业模式与能力", categories: ["product", "company"] },
    { id: 5, label: "近期动态", categories: ["news"] },
    { id: 6, label: "业务触发信号", categories: ["business_signal", "news"] },
    { id: 7, label: "决策角色线索", categories: ["company", "business_signal"] },
    { id: 8, label: "当前方案与竞争线索", categories: ["product", "news"] },
  ];
  // 把行业 focus 作为补充提示挂到任务标签上（不影响采集分类，只供后续 prompt 参考）
  if (focus.length) {
    plan[0]!.label = `${plan[0]!.label}（关注：${focus.slice(0, 2).join("、")}）`;
  }
  return plan;
}

// ─── HTML 工具 ───

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60_000);
}

function htmlTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(match?.[1] ?? fallback).replace(/\s+/g, " ").trim().slice(0, 300);
}

function htmlDescription(html: string): string | undefined {
  const match = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

// ─── 页面分类 ───

function classifyHref(href: string, text: string): EvidenceCategory | undefined {
  const combined = (href + " " + text).toLowerCase();
  if (/about|关于|公司|about[-_]?us|corporate|profile|简介|overview|who[-_]we|认识|走进/.test(combined)) return "company";
  if (/product|产品|service|服务|solution|解决方案|核心业务|业务板块/.test(combined)) return "product";
  if (/news|新闻|blog|博客|动态|press|media|announcement|公告|insights|update|article|最新|资讯/.test(combined)) return "news";
  if (/case|案例|客户|customer|client|partner|合作|success|investor|投资|career|招聘|contact|联系|关于我们/.test(combined)) return "business_signal";
  return undefined;
}

// ─── 从首页 HTML 发现内部链接 ───

function discoverInternalLinks(html: string, base: URL): Map<EvidenceCategory, string[]> {
  const buckets = new Map<EvidenceCategory, string[]>();
  buckets.set("company", []);
  buckets.set("product", []);
  buckets.set("news", []);
  buckets.set("business_signal", []);

  const seen = new Set<string>();
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    if (!href) continue;
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    try { href = new URL(href, base.origin).href; } catch { continue; }
    const parsed = new URL(href);
    if (parsed.hostname !== base.hostname) continue;
    if (/\.(pdf|zip|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|mp4|webp|ico)(\?|$)/i.test(parsed.pathname)) continue;
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
    parsed.hash = "";
    const canonical = parsed.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const category = classifyHref(href, text);
    if (category) buckets.get(category)!.push(canonical);
  }

  // 每类最多 5 个
  for (const [key, urls] of buckets) {
    buckets.set(key, [...new Set(urls)].slice(0, 5));
  }
  return buckets;
}

export type ResearchCandidate = { url: string; category: EvidenceCategory };

export function discoverMarkdownCandidates(markdown: string, baseUrl: string): ResearchCandidate[] {
  const base = new URL(baseUrl);
  const candidates: ResearchCandidate[] = [];
  const seen = new Set<string>();
  const perCategory = new Map<EvidenceCategory, number>();
  const linkPattern = /\[([^\]]+)\]\(([^\s)]+)(?:\s+[^)]*)?\)/g;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(markdown)) !== null) {
    const text = match[1]?.trim() ?? "";
    const rawUrl = match[2]?.trim();
    if (!rawUrl) continue;
    let parsed: URL;
    try { parsed = new URL(rawUrl, base.origin); } catch { continue; }
    if (parsed.hostname !== base.hostname || !/^https?:$/.test(parsed.protocol)) continue;
    if (/\.(pdf|zip|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|mp4|webp|ico)$/i.test(parsed.pathname)) continue;
    parsed.hash = "";
    const url = parsed.toString();
    if (seen.has(url)) continue;
    const category = classifyHref(url, text);
    if (!category || (perCategory.get(category) ?? 0) >= 3) continue;
    seen.add(url);
    perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
    candidates.push({ url, category });
    if (candidates.length >= 15) break;
  }
  return candidates;
}

// ─── 抓取单个页面 ───

async function fetchPage(url: string): Promise<string | undefined> {
  try {
    const timeout = Number(process.env.INTERNAL_PAGE_TIMEOUT_MS) || 12_000;
    const res = await fetch(url, { headers: DIRECT_HEADERS, redirect: "follow", signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return undefined;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml+xml")) return undefined;
    return await res.text();
  } catch {
    return undefined;
  }
}

// ─── DirectFetchCrawler：直连抓首页 + 内页发现（spec §4.2.1 第一通道）───

export class DirectFetchCrawler implements CrawlerPort {
  async collect(input: ResearchInput): Promise<CollectionResult> {
    const targetUrl = await assertPublicHttpUrl(input.targetUrl);
    const baseUrl = new URL(targetUrl);
    const sources: RawSource[] = [];
    const notes: string[] = [];
    const warnings: string[] = [];
    const failedSources: CollectionFailure[] = [];
    const covered = new Set<EvidenceCategory>();

    const fetchTimeout = Number(process.env.DIRECT_FETCH_TIMEOUT_MS) || 20_000;
    const pageTimeout = Number(process.env.INTERNAL_PAGE_TIMEOUT_MS) || 12_000;
    const channelDeadline = Date.now() + fetchTimeout; // 通道软截止：允许已启动页完成

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), fetchTimeout);
      const response = await fetch(targetUrl, { headers: DIRECT_HEADERS, redirect: "follow", signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`官网直连返回 HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))
        throw new Error("官网没有返回可读取的 HTML 页面");

      const html = await response.text();
      const content = cleanSourceText([htmlDescription(html), htmlToText(html)].filter(Boolean).join("\n\n"));
      if (content.length < 240) throw new Error("官网直连内容过少，可能为动态页面或访问限制");

      sources.push({ url: targetUrl, title: htmlTitle(html, baseUrl.hostname), content, sourceType: "official", fetchedAt: new Date().toISOString() });
      covered.add("company");

      const buckets = discoverInternalLinks(html, baseUrl);
      const internalPages: { url: string; category: EvidenceCategory }[] = [];
      for (const [cat, urls] of buckets) for (const url of urls) internalPages.push({ url, category: cat });

      let crawledCount = 0;
      for (const page of internalPages) {
        if (Date.now() > channelDeadline + pageTimeout) break; // 软截止：不再启动新页
        const pageHtml = await fetchPage(page.url);
        if (!pageHtml) {
          failedSources.push({ url: page.url, reason: "http_5xx", channel: "direct", timestamp: new Date().toISOString() });
          continue;
        }
        const pageContent = cleanSourceText([htmlDescription(pageHtml), htmlToText(pageHtml)].filter(Boolean).join("\n\n"));
        if (pageContent.length < 120) {
          failedSources.push({ url: page.url, reason: "content_too_small", channel: "direct", timestamp: new Date().toISOString() });
          continue;
        }
        let sourceType: Source["sourceType"] = "other";
        if (page.category === "news") sourceType = "news";
        else if (page.category === "company" || page.category === "product" || page.category === "business_signal") sourceType = "official";
        sources.push({ url: page.url, title: htmlTitle(pageHtml, new URL(page.url).pathname), content: pageContent, sourceType, fetchedAt: new Date().toISOString() });
        covered.add(page.category);
        crawledCount++;
        if (crawledCount < internalPages.length) await new Promise((r) => setTimeout(r, 300));
      }

      const coveredList = [...covered];
      notes.push(`官网公开页面已通过直连采集${coveredList.length >= 2 ? `（覆盖：${coveredList.map((c) => CATEGORY_LABELS[c]).join("、")}）` : "。"}`);
    } catch (error) {
      const reason = classifyFailureReason(error);
      warnings.push(`官网直连采集失败: ${reason}`);
      failedSources.push({ url: targetUrl, reason, channel: "direct", timestamp: new Date().toISOString() });
    }

    return { sources, notes, warnings, coveredCategories: [...covered], failedSources };
  }
}

// ─── SearchCrawler（spec §4.2.2 第二通道：Jina Reader + Serper.dev 搜索）───
// 实现在 src/lib/web-search.ts 中导出

// ─── 双通道采集：并列 + 独立保存（spec §4.2）───

const ALL_CATEGORIES: EvidenceCategory[] = ["company", "product", "news", "business_signal"];

function detectMissingCategories(covered: EvidenceCategory[]): EvidenceCategory[] {
  const set = new Set(covered);
  return ALL_CATEGORIES.filter((c) => !set.has(c));
}

/** 将错误分类为标准化的失败原因 */
function classifyFailureReason(error: unknown): CollectionFailure["reason"] {
  if (error instanceof DOMException && error.name === "AbortError") return "timeout";
  const message = error instanceof Error ? error.message : "";
  if (/abort|timeout|ETIMEDOUT/i.test(message)) return "timeout";
  if (/ENOTFOUND|DNS|ECONNREFUSED/i.test(message)) return "dns_error";
  if (/\bHTTP\s*4\d{2}\b|\b40[0-9]\b/.test(message)) return "http_4xx";
  if (/\bHTTP\s*5\d{2}\b|\b50[0-9]\b/.test(message)) return "http_5xx";
  if (/内容过少|content.*(?:too|small|<)/i.test(message)) return "content_too_small";
  if (/html|content.type|content-type/i.test(message) && /not|invalid|missing/i.test(message)) return "not_html";
  return "collect_error";
}

function detectCoveredFromSources(sources: RawSource[]): EvidenceCategory[] {
  const covered = new Set<EvidenceCategory>();
  try {
    for (const s of sources) {
      const cat = classifyHref(s.url, s.title);
      if (cat) covered.add(cat);
    }
  } catch { /* skip */ }
  return [...covered];
}

export interface DualChannelResult {
  sources: RawSource[];
  notes: string[];
  warnings: string[];
  coverage: Coverage;
  qualityAuditSeed: {
    directSourceCount: number;
    firecrawlBaseSourceCount: number;
    firecrawlGapSourceCount: number;
    coveredCategories: EvidenceCategory[];
    failedSources: CollectionFailure[];
  };
}

/**
 * 双通道采集（spec §4.2）：直连 + 搜索 并列运行，各自保存结果。
 * 一路超时不清空另一路（spec §4.2.3）。搜索始终作为第二阶段补充。
 * 合并后按缺失类别补采（spec §4.2.4）。
 */
export async function collectBoth(
  input: ResearchInput,
  searchApiKey?: string,
  jinaApiKey?: string,
  options: { fillGaps?: boolean } = {},
): Promise<DualChannelResult> {
  const { SearchCrawler } = await import("@/lib/web-search");
  const directCrawler = new DirectFetchCrawler();
  const searchCrawler = searchApiKey ? new SearchCrawler(searchApiKey, jinaApiKey) : undefined;

  // 两路并列、独立、互不阻塞
  const [directResult, searchResult] = await Promise.allSettled([
    directCrawler.collect(input),
    searchCrawler ? searchCrawler.collect(input) : Promise.resolve<CollectionResult>({ sources: [], notes: [], warnings: [], coveredCategories: [], failedSources: [] }),
  ]);

  const direct = directResult.status === "fulfilled"
    ? directResult.value
    : { sources: [], notes: [], warnings: [`官网直连采集失败: ${classifyFailureReason(directResult.reason)}`], coveredCategories: [], failedSources: [{ url: input.targetUrl, reason: classifyFailureReason(directResult.reason), channel: "direct" as const, timestamp: new Date().toISOString() }] };

  const search = searchResult.status === "fulfilled"
    ? searchResult.value
    : ({ sources: [], notes: [], warnings: ["搜索采集失败。"], coveredCategories: [], failedSources: [{ url: `search://${input.targetUrl}`, reason: "collect_error" as CollectionFailure["reason"], channel: "firecrawl" as const, timestamp: new Date().toISOString() }] }) satisfies CollectionResult;

  const directSourceCount = direct.sources.length;
  const searchBaseSourceCount = search.sources.length;

  // 合并 + 缺口补采
  let merged = [...direct.sources, ...search.sources];
  let notes = [...direct.notes, ...search.notes];
  const warnings = [...direct.warnings, ...search.warnings];
  let failedSources = [...direct.failedSources, ...search.failedSources];

  let searchGapSourceCount = 0;
  let gapFilledCategories: string[] = [];
  if (searchCrawler && options.fillGaps !== false) {
    const covered = detectCoveredFromSources(merged);
    const missing = detectMissingCategories(covered);
    if (missing.length > 0) {
      try {
        const gapResult = await searchCrawler.fillGaps(input.targetUrl, missing);
        searchGapSourceCount = gapResult.sources.length;
        gapFilledCategories = missing;
        merged = [...merged, ...gapResult.sources];
        notes = [...notes, ...gapResult.notes];
        failedSources = [...failedSources, ...gapResult.failedSources];
      } catch {
        // 缺口补采失败不阻塞
      }
    }
  } else if (!searchCrawler) {
    notes.push("未配置搜索 API，当前仅使用官网公开直连资料。");
  }

  const finalCovered = detectCoveredFromSources(merged);
  return {
    sources: merged,
    notes,
    warnings,
    coverage: {
      directChannels: directSourceCount,
      firecrawlChannels: searchBaseSourceCount + searchGapSourceCount,
      gapFilledCategories,
    },
    qualityAuditSeed: {
      directSourceCount,
      firecrawlBaseSourceCount: searchBaseSourceCount,
      firecrawlGapSourceCount: searchGapSourceCount,
      coveredCategories: finalCovered,
      failedSources,
    },
  };
}

/**
 * Production collection keeps the existing direct/search channels, but makes
 * Firecrawl the first-party website collector whenever a key is configured.
 * A Firecrawl failure is isolated so the report can still be honestly marked
 * partial from the remaining public sources.
 */
export async function collectProductionSources(
  input: ResearchInput,
  options: {
    searchApiKey?: string;
    jinaApiKey?: string;
    firecrawlApiKey?: string;
    firecrawlBaseUrl?: string;
  },
): Promise<DualChannelResult> {
  const legacyPromise = collectBoth(input, options.searchApiKey, options.jinaApiKey, {
    // SearchCrawler already runs focused core-fact queries. A second gap-fill
    // pass duplicates slow web requests and can exceed the hosting deadline.
    // Firecrawl covers first-party pages. External search still fills missing
    // company, product, market and business-signal evidence.
    fillGaps: false,
  });
  if (!options.firecrawlApiKey) {
    const legacy = await legacyPromise;
    return {
      ...legacy,
      warnings: [...legacy.warnings, "未配置 FIRECRAWL_API_KEY：当前使用直连与搜索降级采集，官网正文可能不完整。"],
    };
  }

  const { FirecrawlClient, FirecrawlCrawler } = await import("@/lib/firecrawl");
  const firecrawlPromise = new FirecrawlCrawler(
    new FirecrawlClient(options.firecrawlApiKey, {
      baseUrl: options.firecrawlBaseUrl,
      timeoutMs: Number(process.env.FIRECRAWL_TIMEOUT_MS) || 15_000,
    }),
  ).collect(input);

  const [legacyResult, firecrawlResult] = await Promise.allSettled([legacyPromise, firecrawlPromise]);
  const legacy = legacyResult.status === "fulfilled"
    ? legacyResult.value
    : {
      sources: [],
      notes: [],
      warnings: ["直连与搜索采集失败。"],
      coverage: { directChannels: 0, firecrawlChannels: 0, gapFilledCategories: [] },
      qualityAuditSeed: {
        directSourceCount: 0,
        firecrawlBaseSourceCount: 0,
        firecrawlGapSourceCount: 0,
        coveredCategories: [],
        failedSources: [{ url: input.targetUrl, reason: "collect_error" as const, timestamp: new Date().toISOString() }],
      },
    };
  const firecrawl = firecrawlResult.status === "fulfilled"
    ? firecrawlResult.value
    : {
      sources: [],
      notes: ["Firecrawl 采集未完成。"],
      warnings: ["Firecrawl 采集失败，已保留其他公开来源。"],
      coveredCategories: [],
      failedSources: [{ url: input.targetUrl, reason: "collect_error" as const, channel: "firecrawl" as const, timestamp: new Date().toISOString() }],
    };

  const coveredCategories = [...new Set([...legacy.qualityAuditSeed.coveredCategories, ...firecrawl.coveredCategories])];
  return {
    sources: [...firecrawl.sources, ...legacy.sources],
    notes: [...firecrawl.notes, ...legacy.notes],
    warnings: [...firecrawl.warnings, ...legacy.warnings],
    coverage: {
      directChannels: legacy.coverage.directChannels,
      firecrawlChannels: firecrawl.sources.length,
      gapFilledCategories: legacy.coverage.gapFilledCategories,
    },
    qualityAuditSeed: {
      directSourceCount: legacy.qualityAuditSeed.directSourceCount,
      firecrawlBaseSourceCount: firecrawl.sources.length,
      firecrawlGapSourceCount: 0,
      coveredCategories,
      failedSources: [...firecrawl.failedSources, ...legacy.qualityAuditSeed.failedSources],
    },
  };
}

// ─── 信号提取（供 LLM 与兜底使用，复用 evidence.ts）───

// ─── 合成基础 SalesReport（spec §8：字段状态=insufficient，等 LLM 填充）───

const GENERIC_TITLE_SEGMENTS = /^(首页|官网|关于我们|企业介绍|品牌故事|价值观|企业大事记|产品中心|纯牛奶|奶粉|酸奶|儿童|奶卡系列|产业链建设|专业养牛|牧场工厂|数字化建设|新闻与活动|加入我们|adopt a cow)$/i;

export function inferCompanyName(targetUrl: string, sources: Source[]): string {
  const target = new URL(targetUrl);
  const fallback = target.hostname.replace(/^www\./, "");
  const scores = new Map<string, number>();

  for (const source of sources) {
    if (source.sourceType !== "official") continue;
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(source.url);
    } catch {
      continue;
    }
    if (sourceUrl.hostname !== target.hostname) continue;

    const homepageBonus = sourceUrl.pathname === "/" || sourceUrl.pathname === "" ? 2 : 0;
    const segments = source.title
      .split(/[|｜—–_-]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2 && part.length <= 40 && !GENERIC_TITLE_SEGMENTS.test(part));

    for (const segment of new Set(segments)) {
      if (/^(https?:|www\.|[\w.-]+\.(com|cn|net|org))$/i.test(segment)) continue;
      scores.set(segment, (scores.get(segment) ?? 0) + 1 + homepageBonus);
    }
  }

  return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? fallback;
}

export function synthesizeReport(
  input: ResearchInput,
  sources: Source[],
  notes: string[],
  warnings: string[],
  coverage: Coverage,
  auditSeed: DualChannelResult["qualityAuditSeed"],
): SalesReport {
  const preset = getPreset(input.preset);
  const company = inferCompanyName(input.targetUrl, sources);
  const primary = sources[0];
  const primaryIds = primary ? [primary.id] : [];
  const collectedAt = new Date().toISOString();

  // 从已采集来源里抽取兜底信号（仅做事实层兜底，不编造）
  // A raw crawler excerpt is evidence, not a sales conclusion. It is never
  // surfaced as a fake product, customer signal, or company introduction.
  // Those fields are populated only by the structured LLM stage.
  const signals: ResearchListItem[] = [];
  const recentUpdates: ResearchListItem[] = [];

  const insufficient = (note: string): ResearchField => insufficientField(note);

  const customerIntelligence: CustomerIntelligence = {
    companyOverview: insufficient("等待结构化整理公司公开资料。"),
    productsAndServices: [],
    targetCustomersAndMarket: insufficient("等待模型从已获取资料中梳理目标客户与市场。"),
    businessModel: insufficient("等待模型分析商业模式。"),
    productPositioning: insufficient("等待模型分析产品定位。"),
    scaleAndCapability: insufficient("等待模型整理规模与能力信息。"),
    recentUpdates,
    informationGaps: warnings.slice(0, 8),
  };

  const opportunityAnalysis: OpportunityAnalysis = {
    opportunities: [],
    currentSolutionOrCompetition: insufficient("当前方案与竞争信息待补充。"),
    overallConfidence: insufficientField("机会判断待模型整理。"),
  };

  const conversationPlan: ConversationPlan = {
    recommendedContact: insufficient("等待模型分析后推荐联系对象。"),
    communicationGoal: inferredField("验证公开信号与销售方产品之间是否存在真实业务机会。", []),
    opening30s: primary ? inferredField(`已采集 ${company} 公开资料，等待模型生成针对性的开场话术。`, primaryIds) : insufficient("等待公司研究完成。"),
    valueBridge: inferredField(`${input.sellerProfile.productName} 的匹配价值待模型分析后生成。`, []),
    discoveryQuestions: preset.suggestedQuestions.slice(0, 3).map((q) => ({ question: q, purpose: "确认优先级与现有做法。" })),
    objectionResponses: [],
    proofMaterials: [],
    nextStep: verifiedField(input.sellerProfile.callToAction, []),
    avoidTopics: ["不要把公开信息推断描述为已确认的客户内部事实。"],
  };

  const salesVerdict: SalesVerdict = {
    contactSuggestion: insufficientField("等待模型整理后生成联系建议。"),
    recommendationReason: insufficient("等待模型整理后生成推荐理由。"),
    keyCustomerSignals: signals.slice(0, 3),
    priorityContactRole: insufficient("等待模型分析后确认优先联系角色。"),
    priorityOpportunity: insufficient("等待模型基于客户信号生成切入机会。"),
    recommendedNextStep: verifiedField(input.sellerProfile.callToAction, []),
  };

  const qualityAudit: QualityAudit = {
    directSourceCount: auditSeed.directSourceCount,
    firecrawlBaseSourceCount: auditSeed.firecrawlBaseSourceCount,
    firecrawlGapSourceCount: auditSeed.firecrawlGapSourceCount,
    evidencePerCategory: {},
    filteredSources: auditSeed.failedSources.map((f) => ({ url: f.url, reason: f.reason })),
    fieldStatuses: {},
    stageOutcomes: {},
    rejectedFields: [],
    minimumStandardMet: false,
    missingFields: [],
  };

  return {
    reportMeta: { companyName: company, targetUrl: input.targetUrl, sellerProductName: input.sellerProfile.productName, collectedAt, status: "仅采集" },
    salesVerdict,
    contactIntelligence: { channels: [], publicContacts: [] },
    customerIntelligence,
    opportunityAnalysis,
    conversationPlan,
    qualityAudit,
    coverage,
    metrics: { durationMs: 0, sourceCount: sources.length, officialSourceCount: sources.filter((s) => s.sourceType === "official").length, crawlerCalls: searchApiKeyPresent(coverage) ? 2 : 1, llmCalls: 0 },
    sources,
    collectionNotes: notes,
    mainReferenceLinks: [],
  };
}

function searchApiKeyPresent(coverage: Coverage): boolean {
  return coverage.firecrawlChannels > 0 || coverage.gapFilledCategories.length > 0;
}

// ─── 运行研究（同步版，E2E fake 路径用）───

export async function runResearch(
  input: ResearchInput,
  crawler: CrawlerPort,
  config?: AppConfig,
): Promise<SalesReport> {
  const collected = await crawler.collect(input);
  const sources = selectReportSources(dedupeSources(collected.sources), input.targetUrl, 20, input);
  if (!sources.length) throw new Error("未能从公开网页获得足以生成报告的证据。");
  const coverage: Coverage = { directChannels: collected.sources.length, firecrawlChannels: 0, gapFilledCategories: [] };
  const auditSeed = { directSourceCount: collected.sources.length, firecrawlBaseSourceCount: 0, firecrawlGapSourceCount: 0, coveredCategories: collected.coveredCategories, failedSources: collected.failedSources };
  const report = synthesizeReport(input, sources, collected.notes, collected.warnings, coverage, auditSeed);
  return config ? enhanceWithLlm(report, input, sources, config) : report;
}

// ─── 运行研究（双通道生产版，spec §4 + §5）───

export async function runResearchDualChannel(
  input: ResearchInput,
  searchApiKey?: string,
  jinaApiKey?: string,
  config?: AppConfig,
): Promise<SalesReport> {
  const dual = await collectBoth(input, searchApiKey, jinaApiKey);
  const sources = selectReportSources(dedupeSources(dual.sources), input.targetUrl, 20, input);
  if (!sources.length) throw new Error("未能从目标官网获得足以生成报告的高质量公开证据。");
  const report = synthesizeReport(input, sources, dual.notes, dual.warnings, dual.coverage, dual.qualityAuditSeed);
  return config ? enhanceWithLlm(report, input, sources, config) : report;
}
