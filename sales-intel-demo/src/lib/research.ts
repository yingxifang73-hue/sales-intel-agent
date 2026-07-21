import { Firecrawl } from "firecrawl";
import { dedupeSources, type RawSource } from "@/lib/dedupe";
import { getPreset } from "@/lib/presets";
import type { Battlecard, ResearchInput, Source } from "@/lib/types";
import { assertPublicHttpUrl } from "@/lib/url-security";
import { enhanceWithLlm } from "@/lib/llm";
import type { AppConfig } from "@/lib/config";
import { cleanSourceText, decodeHtmlEntities, selectEvidenceExcerpts } from "@/lib/evidence";

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
  return decodeHtmlEntities(match?.[1] ?? fallback).replace(/\s+/g, " ").trim().slice(0, 300);
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
    const content = cleanSourceText([htmlDescription(html), htmlToText(html)].filter(Boolean).join("\n\n"));
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
  const content = cleanSourceText(document.markdown ?? document.description ?? "");
  if (!url || !content) return undefined;
  return { url, title: cleanSourceText(document.metadata?.title ?? document.title ?? url).slice(0, 300), content, sourceType, fetchedAt: new Date().toISOString(), publishedAt: document.metadata?.publishedTime };
}

function sourceMatchesTarget(document: { url?: string; title?: string; description?: string; markdown?: string; metadata?: { sourceURL?: string; title?: string } }, targetUrl: string): boolean {
  const target = new URL(targetUrl);
  const brand = target.hostname.replace(/^www\./, "").split(".")[0]!.toLowerCase();
  const sourceUrl = document.url ?? document.metadata?.sourceURL ?? "";
  if (sourceUrl) {
    try {
      const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, "");
      if (sourceHost === target.hostname.replace(/^www\./, "") || sourceHost.endsWith(`.${target.hostname.replace(/^www\./, "")}`)) return true;
    } catch { /* invalid search result URL is rejected below */ }
  }
  const haystack = `${document.metadata?.title ?? ""} ${document.title ?? ""} ${document.description ?? ""} ${(document.markdown ?? "").slice(0, 1_000)}`.toLowerCase();
  return brand.length >= 3 && haystack.includes(brand);
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
      for (const item of result.value.web ?? []) {
        if (!sourceMatchesTarget(item, targetUrl)) continue;
        const source = sourceFromDocument(item, "other");
        if (source) sources.push(source);
      }
      for (const item of result.value.news ?? []) {
        if (!sourceMatchesTarget(item, targetUrl)) continue;
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
  return selectEvidenceExcerpts(source, ["company", "product", "service", "market", "news", "公司", "产品", "服务", "市场", "发布"]).slice(0, 220);
}

export function synthesizeBattlecard(input: ResearchInput, sources: Source[], collectionNotes: string[], warnings: string[]): Battlecard {
  const preset = getPreset(input.preset);
  const primary = sources[0]!;
  const sourceIds = [primary.id];
  const company = new URL(input.targetUrl).hostname.replace(/^www\./, "");
  const cited = (text: string) => ({ text, sourceIds });
  const basePain = {
    text: "待验证：目标公司的具体业务痛点需要结合已采集来源完成中文研究后判断。",
    sourceIds,
    businessImpact: "当前不根据未整理的外文原文推断业务影响。",
    confidenceLabel: "低" as const,
    validationQuestion: "目前最希望改善的业务环节和衡量指标是什么？",
  };
  const fallbackQuestions = [
    ...preset.suggestedQuestions.map((question) => ({ question, purpose: "确认优先级与现有做法。" })),
    { question: "如果这个问题被解决，最希望看到哪项指标改善？", purpose: "定义可衡量价值。" },
    { question: "目前使用什么方式或方案处理这项工作？", purpose: "了解现状和替代方式。" },
    { question: "哪些角色会参与评估与落地？", purpose: "识别决策与使用链路。" },
    { question: "是否有一个适合先验证的小范围场景？", purpose: "推进下一步试点。" },
  ].slice(0, 5);
  return {
    overview: cited(`已采集 ${company} 的公开资料，等待中文研究和证据归类。`),
    signals: [cited("公开来源已经采集，但未将未经中文整理的原文直接作为业务结论。")],
    painHypotheses: [basePain],
    talkTrack: {
      objective: "等待中文公司研究完成后，再验证客户信号与销售方产品之间的真实关联。",
      opening: cited(`已采集 ${company} 的公开来源；中文研究未完成前不生成可能误导的开场话术。`),
      discoveryQuestions: fallbackQuestions.slice(0, 3),
      valueBridge: `${input.sellerProfile.productName} 的具体能力和适用场景需要销售人员与客户共同确认。`,
      recommendedNextStep: "请重试中文研究；研究完成后再准备正式沟通。",
      avoid: ["不要把公开信息推断描述为已确认的客户内部事实。"],
    },
    productMappings: [{ ...cited(`等待中文研究完成后，再判断 ${input.sellerProfile.productName} 与客户公开信号的关联。`), sellerCapability: input.sellerProfile.productName, expectedValue: "具体价值和适用范围需要沟通验证。" }],
    questions: fallbackQuestions,
    opening: cited(`已采集 ${company} 的公开来源；中文研究未完成前不生成正式开场话术。`),
    risks: [cited("公开信息有限；所有痛点均为待验证假设，请在沟通中先求证。")],
    companyOverview: {
      companyIntroduction: cited("公司公开资料已采集，中文公司介绍尚未通过质量检查。"),
      productsAndServices: [cited("产品与服务资料已采集，等待中文归类。")],
      industryAndCoverage: cited("行业与业务覆盖等待中文研究，当前不展示外文原文拼接。"),
      recentUpdates: [cited("近期动态需要新闻语义和时间校验，当前尚未形成合格结论。")],
    },
    companyAnalysis: {
      businessModel: cited("商业模式等待中文研究，不根据原始网页片段直接推断。"),
      productPositioning: cited("产品定位等待中文研究，不展示未经整理的英文原文。"),
      targetCustomers: cited("目标客户等待中文研究，当前公开证据尚未形成合格结论。"),
      competitionObservation: cited("当前公开资料不足以确认竞争情况，建议沟通中验证现有方案与评估标准。"),
      painHypotheses: [basePain],
    },
    salesStrategy: {
      entryPoints: [cited("中文公司研究未完成，暂不生成可能误导的电话切入点。")],
      recommendation: cited(`${input.sellerProfile.productName} 的推荐理由必须同时依据客户公开信号和产品能力，当前等待研究完成。`),
      opening: cited(`中文公司研究未完成，暂不生成关于 ${input.sellerProfile.productName} 的正式开场话术。`),
      potentialNeeds: [cited("潜在需求需要基于客户证据并在沟通中验证，当前不做无依据推断。")],
      discoveryQuestions: fallbackQuestions,
      recommendedNextStep: "请重试中文研究；研究通过质量检查后再准备电话。",
      avoid: ["不要把公开信息推断描述为已确认的客户内部事实。"],
    },
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
