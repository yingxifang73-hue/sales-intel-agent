import { cleanSourceText } from "@/lib/evidence";
import type { RawSource } from "@/lib/dedupe";
import type { CollectionFailure, CollectionResult, CrawlerPort } from "@/lib/research";
import type { EvidenceCategory } from "@/lib/source-quality";
import type { ResearchInput, Source } from "@/lib/types";
import { assertPublicHttpUrl } from "@/lib/url-security";

const DEFAULT_BASE_URL = "https://api.firecrawl.dev/v2";
const MAX_PAGES = 10;
const SCRAPE_CONCURRENCY = 5;

type FirecrawlFetch = typeof fetch;

interface FirecrawlMetadata {
  title?: string;
  sourceURL?: string;
  url?: string;
  publishedTime?: string;
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  markdown?: string;
  data?: {
    markdown?: string;
    metadata?: FirecrawlMetadata;
  };
}

interface FirecrawlMapResponse {
  success?: boolean;
  links?: string[];
  data?: { links?: string[] };
}

export interface FirecrawlClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FirecrawlFetch;
}

export interface FirecrawlPage {
  url: string;
  title: string;
  markdown: string;
  publishedAt?: string;
}

export class FirecrawlClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FirecrawlFetch;

  constructor(
    private readonly apiKey: string,
    options: FirecrawlClientOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async map(url: string): Promise<string[]> {
    const response = await this.request<FirecrawlMapResponse>("/map", {
      url,
      limit: 50,
      sitemap: "include",
      includeSubdomains: false,
      ignoreQueryParameters: true,
    });
    return [...new Set(response.links ?? response.data?.links ?? [])];
  }

  async scrape(url: string): Promise<FirecrawlPage | undefined> {
    const response = await this.request<FirecrawlScrapeResponse>("/scrape", {
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    });
    const markdown = cleanSourceText(response.data?.markdown ?? response.markdown ?? "");
    if (markdown.length < 120) return undefined;

    const metadata = response.data?.metadata;
    return {
      url: metadata?.sourceURL ?? metadata?.url ?? url,
      title: cleanSourceText(metadata?.title ?? new URL(url).hostname).slice(0, 300),
      markdown,
      publishedAt: normalizePublishedAt(metadata?.publishedTime),
    };
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Firecrawl HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
    return response.json() as Promise<T>;
  }
}

function normalizePublishedAt(value?: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function categoryForUrl(url: string): EvidenceCategory | undefined {
  const value = url.toLowerCase();
  if (/contact|contact-us|contactus|address|\u8054\u7cfb\u6211\u4eec|\u8054\u7cfb\u65b9\u5f0f|\u5730\u5740/.test(value)) return "business_signal";
  if (/about|company|corporate|profile|overview|who-we-are|关于|公司|简介/.test(value)) return "company";
  if (/product|service|solution|产品|服务|解决方案/.test(value)) return "product";
  if (/news|blog|press|media|insight|update|新闻|动态|资讯/.test(value)) return "news";
  if (/case|customer|partner|career|investor|客户|案例|合作|招聘|投资/.test(value)) return "business_signal";
  return undefined;
}

export function selectPages(targetUrl: string, links: string[]): Array<{ url: string; category: EvidenceCategory }> {
  const target = new URL(targetUrl);
  const selected = new Map<string, EvidenceCategory>();
  selected.set(target.href, "company");

  const candidates: Array<{ url: string; category?: EvidenceCategory; score: number }> = [];
  for (const rawUrl of links) {
    let candidate: URL;
    try {
      candidate = new URL(rawUrl);
    } catch {
      continue;
    }
    if (candidate.origin !== target.origin || !/^https?:$/.test(candidate.protocol)) continue;
    if (/\.(pdf|zip|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|mp4|webp|ico)$/i.test(candidate.pathname)) continue;
    candidate.hash = "";
    candidate.search = "";
    const category = categoryForUrl(candidate.href);
    if (selected.has(candidate.href)) continue;
    const pathname = candidate.pathname.toLowerCase();
    const genericRoute = pathname.split("/").filter(Boolean).length <= 2 && !/^(?:\/(?:tag|category|search|wp-)|\/page\/\d+\/?$)/i.test(pathname);
    const score = category ? 100 : genericRoute ? 30 : 0;
    if (score) candidates.push({ url: candidate.href, category, score });
  }

  const perCategory = new Map<EvidenceCategory, number>();
  const contactCandidate = candidates.find((candidate) => /contact|contact-us|contactus|address|\u8054\u7cfb\u6211\u4eec|\u8054\u7cfb\u65b9\u5f0f|\u5730\u5740/i.test(candidate.url));
  if (contactCandidate) {
    selected.set(contactCandidate.url, "business_signal");
    perCategory.set("business_signal", 1);
  }
  for (const candidate of candidates.sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))) {
    if (selected.size >= MAX_PAGES) break;
    const category = candidate.category ?? "company";
    const count = perCategory.get(category) ?? 0;
    if (candidate.category && count >= 3) continue;
    selected.set(candidate.url, category);
    perCategory.set(category, count + 1);
  }

  return [...selected].map(([url, category]) => ({ url, category }));
}

async function mapLimit<T, R>(values: T[], limit: number, worker: (value: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(values.length);
  let index = 0;
  const run = async () => {
    while (index < values.length) {
      const currentIndex = index++;
      const current = values[currentIndex];
      if (current === undefined) return;
      try {
        results[currentIndex] = { status: "fulfilled", value: await worker(current) };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

function failureReason(error: unknown): CollectionFailure["reason"] {
  const message = error instanceof Error ? error.message : "";
  if (/timeout|abort/i.test(message)) return "timeout";
  if (/HTTP 4\d\d/.test(message)) return "http_4xx";
  if (/HTTP 5\d\d/.test(message)) return "http_5xx";
  return "collect_error";
}

function failureLabel(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/insufficient credits/i.test(message)) return "额度不足";
  return failureReason(error);
}

/** Collect only first-party company pages through Firecrawl. */
export class FirecrawlCrawler implements CrawlerPort {
  constructor(private readonly client: FirecrawlClient) {}

  async collect(input: ResearchInput): Promise<CollectionResult> {
    const targetUrl = await assertPublicHttpUrl(input.targetUrl);
    const notes: string[] = [];
    const warnings: string[] = [];
    const failedSources: CollectionFailure[] = [];
    let links: string[] = [];

    try {
      links = await this.client.map(targetUrl);
    } catch (error) {
      warnings.push(`Firecrawl 页面发现失败：${failureLabel(error)}；将尝试抓取首页。`);
      failedSources.push({ url: targetUrl, reason: failureReason(error), channel: "firecrawl", timestamp: new Date().toISOString() });
    }

    const pages = selectPages(targetUrl, links);
    const settled = await mapLimit(pages, SCRAPE_CONCURRENCY, (page) => this.client.scrape(page.url));
    const sources: RawSource[] = [];
    const covered = new Set<EvidenceCategory>();

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const page = pages[i];
      if (!result || !page) continue;
      if (result.status === "rejected") {
        failedSources.push({ url: page.url, reason: failureReason(result.reason), channel: "firecrawl", timestamp: new Date().toISOString() });
        continue;
      }
      if (!result.value) {
        failedSources.push({ url: page.url, reason: "content_too_small", channel: "firecrawl", timestamp: new Date().toISOString() });
        continue;
      }
      const sourceType: Source["sourceType"] = page.category === "news" ? "news" : "official";
      sources.push({
        url: result.value.url,
        title: result.value.title,
        content: result.value.markdown,
        sourceType,
        fetchedAt: new Date().toISOString(),
        publishedAt: result.value.publishedAt,
      });
      covered.add(page.category);
    }

    notes.push(
      sources.length
        ? `Firecrawl 已抓取 ${sources.length} 个目标官网页面。`
        : "Firecrawl 未获得可用官网正文。",
    );
    return { sources, notes, warnings, coveredCategories: [...covered], failedSources };
  }
}
