/**
 * Jina Reader + Serper.dev 替代旧 Firecrawl 方案
 *
 * - Jina Reader: GET https://r.jina.ai/{url} → 返回 Markdown（免费 1000次/天）
 * - Serper.dev:  POST https://google.serper.dev/search → Google 搜索
 * - Serper.dev:  POST https://google.serper.dev/news → Google 新闻搜索
 *
 * 搜索策略（v2 — 广度优先）：
 * 1. 先用 Google News 搜公司品牌名（最新报道）
 * 2. 多维度 Google Web 搜索（融资/产品/合作/竞争/招聘/行业）
 * 3. 每类结果独立去重，给 LLM 提供多角度证据
 */
import type { EvidenceCategory } from "@/lib/source-quality";
import type { ResearchInput, Source } from "@/lib/types";
import { cleanSourceText } from "@/lib/evidence";
import type { RawSource } from "@/lib/dedupe";
import { assertPublicHttpUrl } from "@/lib/url-security";
import type { CrawlerPort, CollectionResult, CollectionFailure } from "@/lib/research";
import { getPreset } from "@/lib/presets";

// ─── 简单的页面抓取（Jina + 直连双重 fallback）───

const DIRECT_HEADERS = { "User-Agent": "SalesIntelligenceDemo/0.3", Accept: "text/html,application/xhtml+xml" };

export interface ScrapeResult {
  url: string;
  title: string;
  markdown: string;
  publishedAt?: string;
}

/** Jina Reader 抓取页面 Markdown。免费，无需 API Key 也能用。*/
async function jinaScrape(url: string, apiKey?: string): Promise<ScrapeResult | undefined> {
  try {
    const headers: Record<string, string> = {
      Accept: "text/markdown",
      "X-Return-Format": "markdown",
      "X-Timeout": "30",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const timeout = Number(process.env.INTERNAL_PAGE_TIMEOUT_MS) || 30_000;
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return undefined;
    const markdown = await res.text();
    if (!markdown || markdown.length < 120) return undefined;
    const title = markdown.match(/^Title:\s*(.+)$/m)?.[1]
      ?? markdown.match(/^#\s*(.+)$/m)?.[1]
      ?? new URL(url).hostname;
    return { url, title: cleanSourceText(title).slice(0, 300), markdown };
  } catch {
    return undefined;
  }
}

/** 直连 fallback：抓原始 HTML 转文本 */
async function directScrape(url: string): Promise<ScrapeResult | undefined> {
  try {
    const timeout = Number(process.env.INTERNAL_PAGE_TIMEOUT_MS) || 12_000;
    const res = await fetch(url, { headers: DIRECT_HEADERS, redirect: "follow", signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return undefined;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml+xml")) return undefined;
    const html = await res.text();
    const text = stripHtml(html);
    if (text.length < 120) return undefined;
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? new URL(url).hostname;
    return { url, title: cleanSourceText(title).slice(0, 300), markdown: text };
  } catch {
    return undefined;
  }
}

function stripHtml(html: string): string {
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

/** 抓取页面：Jina 优先，失败时直连 fallback */
export async function scrapePage(url: string, jinaApiKey?: string): Promise<ScrapeResult | undefined> {
  const result = await jinaScrape(url, jinaApiKey);
  if (result) return result;
  return directScrape(url);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) return;
      try {
        results[index] = { status: "fulfilled", value: await worker(item) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function sourceTypeForUrl(url: string, category: EvidenceCategory, targetHostname: string): Source["sourceType"] {
  if (new URL(url).hostname === targetHostname) return "official";
  return category === "news" ? "news" : "other";
}

// ─── Serper.dev 搜索 ───

export interface SerperSearchItem {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  source?: string;
}

interface SerperSearchResult {
  organic: SerperSearchItem[];
  news?: SerperSearchItem[];
}

interface SerperNewsResult {
  news: SerperSearchItem[];
}

/** Google Web 搜索 */
async function serperSearch(query: string, apiKey: string, limit = 10): Promise<SerperSearchItem[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: limit, gl: "cn", hl: "zh-cn" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
  const data = (await res.json()) as SerperSearchResult;
  const items: SerperSearchItem[] = [...(data.organic ?? [])];
  // 合并 news 结果（去重）
  const seen = new Set(items.map((i) => i.link));
  for (const n of data.news ?? []) {
    if (!seen.has(n.link)) { seen.add(n.link); items.push(n); }
  }
  return items;
}

/** Google News 搜索（实时新闻、行业报道） */
async function serperNews(query: string, apiKey: string, limit = 10): Promise<SerperSearchItem[]> {
  const res = await fetch("https://google.serper.dev/news", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: limit, gl: "cn", hl: "zh-cn", tbs: "qdr:m" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as SerperNewsResult;
  return data.news ?? [];
}

// ─── 搜索结果转换 ───

function sourceFromScrape(r: ScrapeResult, sourceType: Source["sourceType"]): RawSource | undefined {
  const content = cleanSourceText(r.markdown);
  if (!content) return undefined;
  return { url: r.url, title: r.title, content, sourceType, fetchedAt: new Date().toISOString(), publishedAt: normalizePublishedAt(r.publishedAt) };
}

function normalizePublishedAt(value?: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function normalizedHostname(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

/**
 * Search snippets are normally discovery metadata, not report evidence. The
 * only exception is an exact first-party-domain result when the same page is
 * blocked to both Jina and direct crawling (common for client-rendered SPAs).
 * Third-party snippets can never enter this fallback.
 */
export function sourceFromOfficialSearchSnippet(
  item: SerperSearchItem,
  targetHostname: string,
): RawSource | undefined {
  let parsed: URL;
  try {
    parsed = new URL(item.link);
  } catch {
    return undefined;
  }
  if (normalizedHostname(parsed.hostname) !== normalizedHostname(targetHostname)) return undefined;

  const title = cleanSourceText(item.title ?? "").replace(/\s+/g, " ").trim();
  const snippet = cleanSourceText(item.snippet ?? "")
    .replace(/\s*(?:\.{3}|…)+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length < 4 || snippet.length < 55) return undefined;
  const content = cleanSourceText(`${title}。${snippet}`);
  if (content.length < 70) return undefined;

  return {
    url: parsed.toString(),
    title,
    content,
    sourceType: "official",
    fetchedAt: new Date().toISOString(),
    publishedAt: normalizePublishedAt(item.date),
  };
}

// ─── URL 分类 ───

function classifyUrl(href: string, text: string): EvidenceCategory {
  const combined = (href + " " + text).toLowerCase();
  if (/about|关于|公司|about[-_]?us|corporate|profile|简介|overview|who[-_]we|认识|走进/.test(combined)) return "company";
  if (/product|产品|service|服务|solution|解决方案|核心业务|业务板块/.test(combined)) return "product";
  if (/news|新闻|blog|博客|动态|press|media|announcement|公告|insights|update|article|最新|资讯/.test(combined)) return "news";
  if (/case|案例|客户|customer|client|partner|合作|success|investor|投资|career|招聘|contact|联系|融资|轮|上市|财报|收购|扩产/.test(combined)) return "business_signal";
  return "company";
}

// ─── 搜索查询生成（v2：广度优先）───

/**
 * 多维度搜索查询：
 * - 品牌名直接从域名和页面标题提取
 * - 覆盖：融资/新闻/产品/合作/竞争/招聘/行业 7 个维度
 */
export type CompanyIdentity = {
  primaryName: string;
  aliases: string[];
};

function cleanIdentityCandidate(value: string): string {
  return cleanSourceText(value)
    .replace(/(?:官网|官方网站|首页|品牌介绍|公司简介|关于我们|about\s*us|home)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/** Derives the target-company identity afresh from the current website. */
export function identifyCompany(hostname: string, homepageMarkdown: string): CompanyIdentity {
  const domainLabel = hostname.replace(/^www\./, "").split(".")[0] ?? hostname;
  const candidates: string[] = [];
  const add = (value?: string) => {
    if (!value) return;
    const cleaned = cleanIdentityCandidate(value);
    if (cleaned.length >= 2 && !candidates.includes(cleaned)) candidates.push(cleaned);
  };

  const title = homepageMarkdown.match(/^Title:\s*(.+)$/mi)?.[1]
    ?? homepageMarkdown.match(/^#\s*(.+)$/m)?.[1];
  for (const part of (title ?? "").split(/[|｜—–_-]/)) add(part);
  // Headings are only a fallback. Navigation labels such as “新闻与活动” are
  // not company names and must never widen the external-result filter.
  if (true) {
    const heading = (homepageMarkdown.match(/^#{1,2}\s*(.+)$/m) ?? [])[1];
    if (heading) {
      const text = heading.replace(/^#{1,2}\s*/, "").trim();
      for (const name of text.match(/[\u3400-\u9fff]{3,12}/g) ?? []) add(name);
    }
  }
  add(domainLabel);

  const usableCandidates = candidates.filter((candidate) =>
    /[\u3400-\u9fff]/.test(candidate) || /^[a-z0-9][a-z0-9 .-]{2,}$/i.test(candidate),
  );
  const primaryName = usableCandidates.find((candidate) => /[\u3400-\u9fff]/.test(candidate)) ?? usableCandidates[0] ?? domainLabel;
  return { primaryName, aliases: [...new Set([...usableCandidates, primaryName, domainLabel])].filter(Boolean).slice(0, 5) };
}

function contentMentionsCompany(value: string, identity: CompanyIdentity): boolean {
  const haystack = value.toLowerCase();
  return identity.aliases.some((alias) => haystack.includes(alias.toLowerCase()));
}

export function isRelevantCompanySearchResult(item: SerperSearchItem, identity: CompanyIdentity, targetHostname: string): boolean {
  try {
    if (new URL(item.link).hostname === targetHostname) return true;
  } catch {
    return false;
  }
  return contentMentionsCompany(`${item.title} ${item.snippet}`, identity);
}

function compactProductTerms(input: ResearchInput): string[] {
  const raw = [
    input.sellerProfile.productName,
    input.sellerProfile.valueProposition,
    ...input.sellerProfile.customerProblems,
  ].join(" ");
  return [...new Set(raw.match(/[A-Za-z][A-Za-z0-9+._-]{2,}|[\u3400-\u9fff]{2,8}/g) ?? [])]
    .filter((term) => !/^(?:产品|服务|平台|系统|方案|技术|客户|提供|相关|智能|管理|公司)$/i.test(term))
    .slice(0, 8);
}

export function buildBroadSearchQueries(
  hostname: string,
  homepageMarkdown: string,
  input: ResearchInput,
  researchFocus: string[] = [],
): string[] {
  const identity = identifyCompany(hostname, homepageMarkdown);
  const brand = identity.primaryName;
  const queries: string[] = [];
  const productTerms = compactProductTerms(input);
  const productFocus = productTerms.slice(0, 5).join(" ");

  // Identity comes first. Otherwise seller-product queries can crowd the
  // official homepage/about page out of the fixed search budget.
  queries.push(`"${brand}" official company`);
  queries.push(`${brand} 官方 公司简介 主营业务 产品服务`);
  queries.push(`${brand} 所属公司 旗下 官方`);
  queries.push(`site:${hostname} 关于 公司 产品 服务`);

  if (productFocus) {
    queries.push(`${brand} ${productFocus}`);
    queries.push(`site:${hostname} ${productFocus}`);
    queries.push(`${brand} ${productFocus} API SDK 价格 计费 用量`);
    queries.push(`${brand} ${productFocus} 自研 现有方案 合作`);
  }
  queries.push(`${brand} 客户 市场 合作伙伴 案例`);
  queries.push(`${brand} 新闻 公告 发布 最新动态`);
  queries.push(`${brand} 官方 联系方式 电话 邮箱 地址`);
  if (researchFocus.length) queries.push(`${brand} ${researchFocus.slice(0, 3).join(" ")}`);

  return [...new Set(queries)].slice(0, 12);
}

/** 从官网 Markdown 提取品牌名 */
function extractSearchTerms(hostname: string, homepageMarkdown: string): string[] {
  return identifyCompany(hostname, homepageMarkdown).aliases;
  const names: string[] = [];
  const base = hostname.replace(/^www\./, "").split(".")[0]; // furbulous.com → furbulous
  if (base && base.length >= 2) names.push(base);

  // 从页面 h1/h2 提取中文公司名
  const headings = homepageMarkdown.match(/^#{1,2}\s*(.+)$/gm) ?? [];
  for (const h of headings) {
    const text = h.replace(/^#{1,2}\s*/, "").trim();
    // 提取 2-6 字中文名
    const zhNames = text.match(/[一-鿿]{2,6}/g) ?? [];
    for (const n of zhNames) {
      if (n !== base && !names.includes(n)) names.push(n);
    }
  }

  return names.slice(0, 3);
}

function hasEvidenceFor(sources: RawSource[], pattern: RegExp): boolean {
  return sources.some((source) => pattern.test(`${source.title}\n${source.content.slice(0, 8_000)}`));
}

export function coreFactGapQueries(
  identity: CompanyIdentity,
  sources: RawSource[],
  input?: ResearchInput,
): Array<{ query: string; category: EvidenceCategory }> {
  const brand = identity.primaryName;
  const queries: Array<{ query: string; category: EvidenceCategory }> = [];
  if (!hasEvidenceFor(sources, /公司简介|企业简介|成立于|创立于|品牌介绍|主营业务|关于我们/i)) {
    queries.push({ query: `${brand} 公司简介 主营业务`, category: "company" });
  }
  if (!hasEvidenceFor(sources, /员工|团队|工厂|生产基地|产能|研发|仓储|门店|融资|规模|供应链/i)) {
    queries.push({ query: `${brand} 产能 工厂 团队 规模`, category: "company" });
  }
  if (!hasEvidenceFor(sources, /客户|合作伙伴|合作|案例|服务于|入驻|渠道|经销商/i)) {
    queries.push({ query: `${brand} 客户 合作伙伴 案例 渠道`, category: "business_signal" });
  }
  if (!hasEvidenceFor(sources, /@|电话|联系电话|邮箱|联系地址|办公地址|注册地址|联系我们/i)) {
    queries.push({ query: `${brand} 官方 联系方式 电话 邮箱 地址`, category: "business_signal" });
  }
  const productFocus = input ? compactProductTerms(input).slice(0, 5).join(" ") : "";
  if (productFocus && !hasEvidenceFor(sources, new RegExp(productFocus.split(/\s+/).map(escapeRegex).join("|"), "i"))) {
    queries.unshift({ query: `${brand} ${productFocus} API SDK 计费 价格 现有方案`, category: "product" });
  }
  return queries;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── 低价值 URL 过滤 ───

const LOW_VALUE_DOMAINS = [
  /instagram\.com/i, /facebook\.com/i, /twitter\.com/i, /x\.com$/i,
  /linkedin\.com/i, /youtube\.com/i, /pinterest\.com/i,
  /amazon\.(com|co\.uk|de|co\.jp|cn)/i, /ebay\.com/i,
  /google\.com\/search/i, /bing\.com\/search/i,
];

const LOW_VALUE_PATH = [
  /\/login/i, /\/signin/i, /\/signup/i, /\/register/i,
  /\/cart/i, /\/checkout/i, /\/account/i,
  /\/faq\/?$/i, /\/help\/?$/i,
  /\/privacy/i, /\/terms/i, /\/cookies/i, /\/legal/i,
];

function isLowValueUrl(url: string): boolean {
  const lower = url.toLowerCase();
  for (const pattern of LOW_VALUE_DOMAINS) {
    if (pattern.test(lower)) return true;
  }
  for (const pattern of LOW_VALUE_PATH) {
    if (pattern.test(lower)) return true;
  }
  return false;
}

// ─── CrawlerPort 实现 ───

export type ResearchCandidate = { url: string; category: EvidenceCategory };

export class SearchCrawler implements CrawlerPort {
  constructor(
    private readonly serperApiKey: string,
    private readonly jinaApiKey?: string,
  ) {}

  async collect(input: ResearchInput): Promise<CollectionResult> {
    const targetUrl = await assertPublicHttpUrl(input.targetUrl);
    const hostname = new URL(targetUrl).hostname;
    const sources: RawSource[] = [];
    const notes: string[] = [];
    const warnings: string[] = [];
    const failedSources: CollectionFailure[] = [];
    const officialSearchFallbacks = new Map<string, RawSource>();
    // 收集需要深层抓取的 URL（去重后）
    const deepScrapeUrls = new Map<string, EvidenceCategory>();

    // Step 1: 抓取目标官网首页（始终）
    const homepage = await scrapePage(targetUrl, this.jinaApiKey);
    if (homepage) {
      const src = sourceFromScrape(homepage, "official");
      if (src) sources.push(src);
      notes.push("已通过 Jina Reader / 直连采集目标官网首页。");
    } else {
      notes.push("目标官网首页采集失败（Jina Reader 和直连均未返回可用内容），将依赖搜索引擎补充。");
    }

    // Never reuse a previously researched company: the identity is derived
    // from this request's hostname and homepage only.
    const companyIdentity = identifyCompany(hostname, homepage?.markdown ?? "");
    notes.push(`本次检索主体：${companyIdentity.primaryName}。外部结果须包含该主体名称才会保留。`);

    // Step 2: 发现内部页面链接
    const internalCandidates = homepage
      ? discoverLinksFromMarkdown(homepage.markdown, targetUrl)
      : [];
    const seenInternal = new Set<string>();
    for (const c of internalCandidates.slice(0, 5)) {
      const canonical = c.url.split("#")[0]!.replace(/\/$/, "");
      if (seenInternal.has(canonical)) continue;
      seenInternal.add(canonical);
      deepScrapeUrls.set(c.url, c.category);
    }

    // Step 3: Google News 搜索 + 收集 top 链接
    const brands = extractSearchTerms(hostname, homepage?.markdown ?? "");
    const newsResults = await mapWithConcurrency(brands, 5, (brand) => serperNews(brand, this.serperApiKey, 6));
    for (const result of newsResults) {
      if (result.status === "fulfilled") {
        const newsItems = result.value;
        for (const item of newsItems) {
          if (isLowValueUrl(item.link)) continue;
          if (!isRelevantCompanySearchResult(item, companyIdentity, hostname)) continue;
          // Search snippets only discover URLs. They cannot become report
          // evidence until the full page below is successfully read.
          if (!deepScrapeUrls.has(item.link) && deepScrapeUrls.size < 10) {
            deepScrapeUrls.set(item.link, "news");
          }
        }
      }
    }

    // Step 4: Google Web 多维度搜索 + 收集 snippet
    const researchFocus = getPreset(input.preset).researchFocus;
    const searchQueries = homepage
      ? buildBroadSearchQueries(hostname, homepage.markdown, input, researchFocus)
      : buildBroadSearchQueries(hostname, hostname, input, researchFocus);

    const selectedQueries = searchQueries.slice(0, 10);
    const searchResults = await mapWithConcurrency(selectedQueries, 5, (query) => serperSearch(query, this.serperApiKey, 6));
    for (let index = 0; index < searchResults.length; index++) {
      const result = searchResults[index];
      const query = selectedQueries[index];
      if (result?.status === "fulfilled") {
        const items = result.value;
        for (const item of items) {
          if (isLowValueUrl(item.link)) continue;
          if (!isRelevantCompanySearchResult(item, companyIdentity, hostname)) continue;
          const officialFallback = sourceFromOfficialSearchSnippet(item, hostname);
          if (officialFallback) {
            officialSearchFallbacks.set(officialFallback.url.split("#")[0]!, officialFallback);
          }
          // Search snippets only discover URLs. They cannot become report
          // evidence except for the exact first-party fallback above.
          if (!deepScrapeUrls.has(item.link) && deepScrapeUrls.size < 10) {
            const cat = classifyUrl(item.link, item.title);
            deepScrapeUrls.set(item.link, cat);
          }
        }
      } else if (query) {
        failedSources.push({
          url: `search://${encodeURIComponent(query)}`,
          reason: "collect_error",
          channel: "firecrawl",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Step 5: 对精选 top 页面做深层抓取（Jina 全页内容）
    const coreGapQueries = coreFactGapQueries(companyIdentity, sources, input);
    const coreGapResults = await mapWithConcurrency(coreGapQueries, 5, ({ query }) => serperSearch(query, this.serperApiKey, 4));
    for (let index = 0; index < coreGapResults.length; index++) {
      const result = coreGapResults[index];
      const task = coreGapQueries[index];
      if (result?.status !== "fulfilled" || !task) continue;
      for (const item of result.value) {
        if (isLowValueUrl(item.link) || !isRelevantCompanySearchResult(item, companyIdentity, hostname)) continue;
        const officialFallback = sourceFromOfficialSearchSnippet(item, hostname);
        if (officialFallback) {
          officialSearchFallbacks.set(officialFallback.url.split("#")[0]!, officialFallback);
        }
        if (!deepScrapeUrls.has(item.link) && deepScrapeUrls.size < 14) deepScrapeUrls.set(item.link, task.category);
      }
    }

    const deepUrls = [...deepScrapeUrls.entries()].slice(0, 14);
    const deepResults = await mapWithConcurrency(deepUrls, 5, async ([url, category]) => ({ page: await scrapePage(url, this.jinaApiKey), category }));
    for (let index = 0; index < deepResults.length; index++) {
      const result = deepResults[index];
      const candidate = deepUrls[index];
      if (result?.status === "fulfilled" && result.value.page && candidate) {
        const src = sourceFromScrape(result.value.page, sourceTypeForUrl(candidate[0], result.value.category, hostname));
        const isTargetWebsite = new URL(candidate[0]).hostname === hostname;
        if (src && (isTargetWebsite || contentMentionsCompany(`${src.title} ${src.content}`, companyIdentity))) sources.push(src);
      } else if (candidate) {
        const fallback = officialSearchFallbacks.get(candidate[0].split("#")[0]!);
        if (fallback) sources.push(fallback);
      }
    }

    // Keep first-party snippets even when a blocked homepage URL was not chosen
    // for deep scraping. dedupeSources will later prefer a full page whenever
    // one exists and otherwise retain this richer same-domain fallback.
    sources.push(...officialSearchFallbacks.values());

    const hasContent = sources.length > 0;
    if (hasContent) {
      notes.push(`多维度搜索完成：${sources.length} 条来源（含 ${deepUrls.length} 个深度页面）。`);
    } else {
      warnings.push("所有采集渠道均未返回可用内容。");
    }

    return {
      sources,
      notes,
      warnings,
      coveredCategories: detectCoveredFromSources(sources),
      failedSources,
    };
  }

  /** 按缺失类别补充搜索 */
  async fillGaps(targetUrl: string, missingCategories: EvidenceCategory[]): Promise<CollectionResult> {
    const targetHostname = new URL(targetUrl).hostname;
    const hostname = targetHostname.replace(/^www\./, "");
    const sources: RawSource[] = [];
    const notes: string[] = [];
    const failedSources: CollectionFailure[] = [];

    const queries = missingCategories.flatMap((category) => gapQueries(hostname, category).map((query) => ({ category, query }))).slice(0, 6);
    const searchResults = await mapWithConcurrency(queries, 5, ({ query }) => serperSearch(query, this.serperApiKey, 4));
    const candidates: Array<{ url: string; category: EvidenceCategory }> = [];
    for (let index = 0; index < searchResults.length; index++) {
      const result = searchResults[index];
      const task = queries[index];
      if (result?.status !== "fulfilled" || !task) {
        if (task) failedSources.push({ url: `search-gap://${encodeURIComponent(task.query)}`, reason: "collect_error", channel: "firecrawl", timestamp: new Date().toISOString() });
        continue;
      }
      for (const item of result.value.slice(0, 2)) {
        if (!isLowValueUrl(item.link)) candidates.push({ url: item.link, category: task.category });
      }
    }
    const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].slice(0, 8);
    const pages = await mapWithConcurrency(unique, 5, async (candidate) => ({ candidate, page: await scrapePage(candidate.url, this.jinaApiKey) }));
    for (const result of pages) {
      if (result.status !== "fulfilled" || !result.value.page) continue;
      const src = sourceFromScrape(result.value.page, sourceTypeForUrl(result.value.candidate.url, result.value.candidate.category, targetHostname));
      if (src) sources.push(src);
    }

    if (sources.length) notes.push(`搜索渠道已针对缺失类别（${missingCategories.map((c) => catLabel(c)).join("、")}）进行补充采集。`);
    return { sources, notes, warnings: [], coveredCategories: [], failedSources };
  }
}

// ─── 辅助函数 ───

function discoverLinksFromMarkdown(markdown: string, baseUrl: string): { url: string; category: EvidenceCategory }[] {
  const base = new URL(baseUrl);
  const results: { url: string; category: EvidenceCategory }[] = [];
  const seen = new Set<string>();

  const linkPattern = /\[([^\]]+)\]\(([^\s)]+)(?:\s+[^)]*)?\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(markdown)) !== null) {
    const text = match[1]?.trim() ?? "";
    const rawUrl = match[2]?.trim();
    if (!rawUrl) continue;
    let parsed: URL;
    try { parsed = new URL(rawUrl, base.origin); } catch { continue; }
    if (parsed.hostname !== base.hostname) continue;
    if (/\.(pdf|zip|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|mp4|webp|ico)$/i.test(parsed.pathname)) continue;
    parsed.hash = "";
    const url = parsed.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    const category = classifyUrl(url, text);
    results.push({ url, category });
  }
  return results;
}

function gapQueries(hostname: string, cat: EvidenceCategory): string[] {
  switch (cat) {
    case "company":
      return [
        `${hostname} 公司 介绍`,
        `${hostname} 创始人 团队`,
        `${hostname} 简介 OR about`,
      ];
    case "product":
      return [
        `${hostname} 产品 服务`,
        `${hostname} 技术 专利`,
        `${hostname} product OR service`,
      ];
    case "news":
      return [
        `${hostname} 新闻 最新`,
        `${hostname} 动态 报道`,
        `${hostname} press OR news`,
      ];
    case "business_signal":
      return [
        `${hostname} 融资 OR 投资`,
        `${hostname} 合作 OR 客户`,
        `${hostname} 招聘 OR 扩张`,
      ];
  }
}

function catLabel(cat: EvidenceCategory): string {
  const map: Record<EvidenceCategory, string> = {
    company: "公司介绍",
    product: "产品/服务",
    news: "新闻动态",
    business_signal: "业务信号",
  };
  return map[cat];
}

function detectCoveredFromSources(sources: RawSource[]): EvidenceCategory[] {
  const covered = new Set<EvidenceCategory>();
  for (const s of sources) {
    covered.add(classifyUrl(s.url, s.title));
  }
  return [...covered];
}
