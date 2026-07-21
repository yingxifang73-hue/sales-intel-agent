import { Firecrawl } from "firecrawl";
import { dedupeSources, type RawSource } from "@/lib/dedupe";
import { getPreset } from "@/lib/presets";
import type { Battlecard, ResearchInput, Source } from "@/lib/types";
import { assertPublicHttpUrl } from "@/lib/url-security";
import { enhanceWithLlm } from "@/lib/llm";
import type { AppConfig } from "@/lib/config";

export interface CollectionResult {
  sources: RawSource[];
  notes: string[];
  warnings: string[];
}

export interface CrawlerPort {
  collect(input: ResearchInput): Promise<CollectionResult>;
}

const DIRECT_HEADERS = { "User-Agent": "SalesIntelligenceDemo/0.1", Accept: "text/html,application/xhtml+xml" };

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
    .slice(0, 30_000);
}

function htmlTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (match?.[1] ?? fallback).replace(/\s+/g, " ").trim().slice(0, 300);
}

function htmlDescription(html: string): string | undefined {
  const match = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

export class DirectFetchCrawler implements CrawlerPort {
  async collect(input: ResearchInput): Promise<CollectionResult> {
    const targetUrl = await assertPublicHttpUrl(input.targetUrl);
    const response = await fetch(targetUrl, { headers: DIRECT_HEADERS, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`官网直连返回 HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("官网没有返回可读取的 HTML 页面");
    const html = await response.text();
    const content = [htmlDescription(html), htmlToText(html)].filter(Boolean).join("\n\n");
    if (content.length < 240) throw new Error("官网直连内容过少，可能为动态页面或访问限制");
    return {
      sources: [{ url: targetUrl, title: htmlTitle(html, new URL(targetUrl).hostname), content, sourceType: "official", fetchedAt: new Date().toISOString() }],
      notes: ["官网公开页面已通过直连采集。"],
      warnings: [],
    };
  }
}

export class HybridCrawler implements CrawlerPort {
  constructor(
    private readonly firecrawlApiKey?: string,
    private readonly directCrawler: CrawlerPort = new DirectFetchCrawler(),
    private readonly supplementalCrawler?: CrawlerPort,
  ) {}

  async collect(input: ResearchInput): Promise<CollectionResult> {
    const sources: RawSource[] = [];
    const notes: string[] = [];
    const warnings: string[] = [];
    let directError: unknown;

    try {
      const direct = await this.directCrawler.collect(input);
      sources.push(...direct.sources);
      notes.push(...direct.notes);
      warnings.push(...direct.warnings);
    } catch (error) {
      directError = error;
      warnings.push("官网直连采集未成功，已继续尝试补充通道。");
    }

    if (this.firecrawlApiKey) {
      try {
        const supplemental = await (this.supplementalCrawler ?? new FirecrawlCrawler(this.firecrawlApiKey)).collect(input);
        sources.push(...supplemental.sources);
        notes.push("Firecrawl 已完成补充采集。", ...supplemental.notes);
        warnings.push(...supplemental.warnings);
      } catch {
        if (sources.length) notes.push("Firecrawl 补充通道本次未返回内容，已保留直连证据。");
        else warnings.push("Firecrawl 补充采集未成功。");
      }
    } else {
      notes.push("未配置 Firecrawl，当前仅使用官网公开直连资料。");
    }

    if (!sources.length && directError) throw directError;
    return { sources, notes, warnings };
  }
}

function sourceFromDocument(document: { url?: string; title?: string; description?: string; markdown?: string; metadata?: { sourceURL?: string; title?: string; publishedTime?: string } }, sourceType: Source["sourceType"]): RawSource | undefined {
  const url = document.url ?? document.metadata?.sourceURL;
  const content = document.markdown ?? document.description;
  if (!url || !content) return undefined;
  return { url, title: document.metadata?.title ?? document.title ?? url, content, sourceType, fetchedAt: new Date().toISOString(), publishedAt: document.metadata?.publishedTime };
}

export class FirecrawlCrawler implements CrawlerPort {
  constructor(private readonly apiKey: string) {}

  async collect(input: ResearchInput): Promise<CollectionResult> {
    const targetUrl = await assertPublicHttpUrl(input.targetUrl);
    const client = new Firecrawl({ apiKey: this.apiKey });
    const queries = getPreset(input.preset).researchFocus.slice(0, 2).map((focus) => `${new URL(targetUrl).hostname} ${focus}`);
    const [targetResult, ...searchResults] = await Promise.allSettled([
      client.scrape(targetUrl, { formats: ["markdown"] }),
      ...queries.map((query) => client.search(query, { limit: 3, sources: ["web", "news"] })),
    ]);
    const sources: RawSource[] = [];
    if (targetResult.status === "fulfilled") {
      const targetSource = sourceFromDocument({ ...targetResult.value, url: targetUrl }, "official");
      if (targetSource) sources.push(targetSource);
    }
    for (const result of searchResults) {
      if (result.status !== "fulfilled") continue;
      for (const item of [...(result.value.web ?? []), ...(result.value.news ?? [])]) {
        const source = sourceFromDocument(item, "news");
        if (source) sources.push(source);
      }
    }
    return {
      sources,
      notes: sources.length ? ["Firecrawl 已补充官网可读内容和公开网页信号。"] : [],
      warnings: sources.length ? [] : ["Firecrawl 未采集到可用公开网页内容。"],
    };
  }
}

export class DemoCrawler implements CrawlerPort {
  async collect(input: ResearchInput): Promise<CollectionResult> {
    const targetUrl = await assertPublicHttpUrl(input.targetUrl, async () => [{ address: "93.184.216.34", family: 4 }]);
    const company = new URL(targetUrl).hostname.replace(/^www\./, "");
    const now = new Date().toISOString();
    return {
      sources: [
        { url: targetUrl, title: `${company} 官网`, content: `${company} 公开介绍其核心产品、客户服务与业务重点。官网内容显示团队持续投入产品与市场拓展。`, sourceType: "official", fetchedAt: now },
        { url: `${new URL(targetUrl).origin}/news`, title: `${company} 近期动态`, content: `公开信息显示 ${company} 近期发布了新的业务动态，关注增长、交付效率和客户体验。`, sourceType: "news", fetchedAt: now },
      ],
      notes: ["当前为演示数据模式。"],
      warnings: [],
    };
  }
}

function sourceInsight(source: Source): string {
  const normalized = source.content.replace(/\s+/g, " ").trim();
  const segments = normalized.split(/(?<=[。！？.!?])\s+/).map((segment) => segment.trim()).filter((segment) => segment.length >= 30);
  return (segments.find((segment) => !/(cookie|privacy|copyright|menu|search)/i.test(segment)) ?? normalized).slice(0, 220);
}

export function synthesizeBattlecard(input: ResearchInput, sources: Source[], collectionNotes: string[], warnings: string[]): Battlecard {
  const preset = getPreset(input.preset);
  const primary = sources[0]!;
  const secondary = sources[1] ?? primary;
  const primaryInsight = sourceInsight(primary);
  const sourceIds = [primary.id, ...(secondary.id === primary.id ? [] : [secondary.id])];
  const company = new URL(input.targetUrl).hostname.replace(/^www\./, "");
  const cited = (text: string) => ({ text, sourceIds });
  return {
    overview: cited(`${company} 的公开页面“${primary.title}”提到：${primaryInsight}。建议先核实这项业务信号对一线协同和增长目标的具体影响。`),
    signals: [{ text: `公开信号：${primary.title} — ${primaryInsight}`, sourceIds: [primary.id] }],
    painHypotheses: [{
      text: `待验证：围绕“${primary.title}”所反映的业务推进，团队可能需要更快地统一客户、渠道或项目相关信息。`,
      sourceIds: [primary.id],
      businessImpact: `若信息无法及时汇总与复用，可能拖慢后续协同和机会推进；需结合“${secondary.title}”的实际场景求证。`,
      confidenceLabel: "低",
      validationQuestion: `从“${primary.title}”这项公开业务信息出发，当前最需要跨团队协调、最容易延误的环节是什么？`,
    }],
    talkTrack: {
      objective: "确认公开业务信号对应的真实优先级、影响范围和是否值得启动小范围验证。",
      opening: cited(`我看到 ${company} 在“${primary.title}”中提到“${primaryInsight}”。想先了解这项推进中最难协同的一步，再判断 ${input.sellerProfile.productName} 是否适合从一个小场景协助验证。`),
      discoveryQuestions: [
        { question: `围绕“${primary.title}”，现在最影响效率的环节是什么？`, purpose: "确认业务痛点。" },
        { question: "这个环节会影响哪些业务指标或客户体验？", purpose: "量化影响。" },
        { question: "谁会参与评估和决定下一步？", purpose: "了解决策路径。" },
      ],
      valueBridge: input.sellerProfile.valueProposition,
      recommendedNextStep: "选择一个与公开业务信号相关的具体场景，约定 20 分钟需求澄清并界定小范围验证。",
      avoid: ["不要把公开信息推断描述为已确认的客户内部事实。"],
    },
    productMappings: [{ ...cited(`以“${primary.title}”的公开信号切入，先验证问题再讨论方案。`), sellerCapability: input.sellerProfile.valueProposition, expectedValue: `帮助 ${input.sellerProfile.targetCustomer} 围绕该业务信号更快形成可执行的下一步。` }],
    questions: [
      ...preset.suggestedQuestions.map((question) => ({ question, purpose: "确认优先级与现有做法。" })),
      { question: "如果这个问题被解决，最希望看到哪项指标改善？", purpose: "定义可衡量价值。" },
      { question: "哪些角色会参与评估与落地？", purpose: "识别决策与使用链路。" },
      { question: "是否有一个适合先验证的小范围场景？", purpose: "推进下一步试点。" },
    ].slice(0, 5),
    opening: cited(`我看到 ${company} 在“${primary.title}”中公开提到相关业务。想先了解这件事当前最难的一步，再判断 ${input.sellerProfile.productName} 是否值得协助做一个小范围验证。`),
    risks: [cited("公开信息有限；所有痛点均为待验证假设，请在沟通中先求证。")],
    sources,
    collectionNotes,
    modelStatus: "evidence_based",
    warnings,
  };
}

export async function runResearch(input: ResearchInput, crawler: CrawlerPort, config?: AppConfig): Promise<Battlecard> {
  const collected = await crawler.collect(input);
  const sources = dedupeSources(collected.sources);
  if (!sources.length) throw new Error("未能从公开网页获得足以生成作战卡的证据。");
  const card = synthesizeBattlecard(input, sources, collected.notes, collected.warnings);
  return config ? enhanceWithLlm(card, input, config) : card;
}
