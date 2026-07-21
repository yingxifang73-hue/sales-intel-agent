import { Firecrawl } from "firecrawl";
import { dedupeSources, type RawSource } from "@/lib/dedupe";
import { getPreset } from "@/lib/presets";
import type { Battlecard, ResearchInput, Source } from "@/lib/types";
import { assertPublicHttpUrl } from "@/lib/url-security";
import { enhanceWithLlm } from "@/lib/llm";
import type { AppConfig } from "@/lib/config";

export interface CrawlerPort {
  collect(input: ResearchInput): Promise<{ sources: RawSource[]; warnings: string[] }>;
}

const DIRECT_HEADERS = { "User-Agent": "SalesIntelligenceDemo/0.1", Accept: "text/html,application/xhtml+xml" };

function htmlToText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim().slice(0, 30_000);
}

function htmlTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (match?.[1] ?? fallback).replace(/\s+/g, " ").trim().slice(0, 300);
}

export class DirectFetchCrawler implements CrawlerPort {
  async collect(input: ResearchInput): Promise<{ sources: RawSource[]; warnings: string[] }> {
    const targetUrl = await assertPublicHttpUrl(input.targetUrl);
    const response = await fetch(targetUrl, { headers: DIRECT_HEADERS, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`官网直连返回 HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("官网没有返回可读取的 HTML 页面");
    const html = await response.text();
    const content = htmlToText(html);
    if (content.length < 240) throw new Error("官网直连内容过少，可能为动态页面或访问限制");
    return { sources: [{ url: targetUrl, title: htmlTitle(html, new URL(targetUrl).hostname), content, sourceType: "official", fetchedAt: new Date().toISOString() }], warnings: ["官网资料通过公开直连采集。"] };
  }
}

export class HybridCrawler implements CrawlerPort {
  constructor(private readonly firecrawlApiKey?: string) {}

  async collect(input: ResearchInput): Promise<{ sources: RawSource[]; warnings: string[] }> {
    try {
      return await new DirectFetchCrawler().collect(input);
    } catch (directError) {
      if (!this.firecrawlApiKey) throw directError;
      const fallback = await new FirecrawlCrawler(this.firecrawlApiKey).collect(input);
      return { ...fallback, warnings: ["官网直连未成功，已改用 Firecrawl 补充采集。", ...fallback.warnings] };
    }
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

  async collect(input: ResearchInput) {
    const targetUrl = await assertPublicHttpUrl(input.targetUrl);
    const client = new Firecrawl({ apiKey: this.apiKey });
    const target = await client.scrape(targetUrl, { formats: ["markdown"] });
    const queries = getPreset(input.preset).researchFocus.slice(0, 2).map((focus) => `${new URL(targetUrl).hostname} ${focus}`);
    const searches = await Promise.all(queries.map((query) => client.search(query, { limit: 3, sources: ["web", "news"] })));
    const collected: RawSource[] = [];
    const targetSource = sourceFromDocument({ ...target, url: targetUrl }, "official");
    if (targetSource) collected.push(targetSource);
    for (const result of searches) {
      for (const item of [...(result.web ?? []), ...(result.news ?? [])]) {
        const source = sourceFromDocument(item, "news");
        if (source) collected.push(source);
      }
    }
    return { sources: collected, warnings: collected.length ? [] : ["未采集到可用公开网页内容。"] };
  }
}

export class DemoCrawler implements CrawlerPort {
  async collect(input: ResearchInput): Promise<{ sources: RawSource[]; warnings: string[] }> {
    const targetUrl = await assertPublicHttpUrl(input.targetUrl, async () => [{ address: "93.184.216.34", family: 4 }]);
    const company = new URL(targetUrl).hostname.replace(/^www\./, "");
    const now = new Date().toISOString();
    return { sources: [
      { url: targetUrl, title: `${company} 官网`, content: `${company} 公开介绍其核心产品、客户服务与业务重点。官网内容显示团队持续投入产品与市场拓展。`, sourceType: "official", fetchedAt: now },
      { url: `${new URL(targetUrl).origin}/news`, title: `${company} 近期动态`, content: `公开信息显示 ${company} 近期发布了新的业务动态，关注增长、交付效率和客户体验。`, sourceType: "news", fetchedAt: now },
    ], warnings: ["当前为演示数据模式；请配置密钥后获取实时网页情报。"] };
  }
}

export function synthesizeBattlecard(input: ResearchInput, sources: Source[], warnings: string[]): Battlecard {
  const preset = getPreset(input.preset);
  const sourceIds = sources.slice(0, 2).map((source) => source.id);
  const company = new URL(input.targetUrl).hostname.replace(/^www\./, "");
  const cited = (text: string) => ({ text, sourceIds });
  return {
    overview: cited(`${company} 的公开信息显示其正在围绕${preset.researchFocus.slice(0, 2).join("、")}推进业务。建议先确认当前增长目标与执行阻力，再以 ${input.sellerProfile.productName} 的具体能力切入。`),
    signals: [cited("官网与近期公开内容均提及产品、客户或业务推进，适合作为本次拜访的开场事实。")],
    painHypotheses: [{ ...cited(`待验证：信息分散可能使团队难以将 ${preset.researchFocus[0]} 转化为一致的销售行动。`), businessImpact: "可能延长响应与协同周期，影响机会推进效率。", confidenceLabel: "低", validationQuestion: `围绕 ${preset.researchFocus[0]}，团队现在最花时间、最难协同的环节是什么？` }],
    talkTrack: { objective: "确认问题是否真实存在、影响范围和是否值得启动小范围验证。", opening: cited(`我看到 ${company} 的公开动态，想先了解业务推进中最难的一步，再判断是否有必要做小范围验证。`), discoveryQuestions: [{ question: `围绕${preset.researchFocus[0]}，现在最影响效率的环节是什么？`, purpose: "确认业务痛点。" }, { question: "这一问题会影响哪些业务指标或客户体验？", purpose: "量化影响。" }, { question: "谁会参与评估和决定下一步？", purpose: "了解决策路径。" }], valueBridge: input.sellerProfile.valueProposition, recommendedNextStep: "选择一个具体场景，约定 20 分钟需求澄清与小范围验证范围。", avoid: ["不要把公开推断描述为已被确认的事实。"] },
    productMappings: [{ ...cited("以公开信号切入，先验证问题再讨论方案。"), sellerCapability: input.sellerProfile.valueProposition, expectedValue: `帮助 ${input.sellerProfile.targetCustomer} 更快形成可执行的下一步。` }],
    questions: [
      ...preset.suggestedQuestions.map((question) => ({ question, purpose: "确认优先级与现有做法。" })),
      { question: `如果这个问题被解决，最希望看到哪项指标改善？`, purpose: "定义可衡量价值。" },
      { question: "哪些角色会参与评估与落地？", purpose: "识别决策与使用链路。" },
      { question: "是否有一个适合先验证的小范围场景？", purpose: "推进下一步试点。" },
    ].slice(0, 5),
    opening: cited(`我看到 ${company} 最近在推进相关业务。想先了解这件事当前最难的一步，再判断 ${input.sellerProfile.productName} 是否值得帮您做一个小范围验证。`),
    risks: [cited("公开信息有限；所有痛点均为待验证假设，请在沟通中先求证。")],
    sources,
    warnings,
  };
}

export async function runResearch(input: ResearchInput, crawler: CrawlerPort, config?: AppConfig): Promise<Battlecard> {
  const collected = await crawler.collect(input);
  const sources = dedupeSources(collected.sources);
  if (!sources.length) throw new Error("未能从公开网页获得足以生成作战卡的证据。");
  const card = synthesizeBattlecard(input, sources, collected.warnings);
  return config ? enhanceWithLlm(card, input, config) : card;
}
