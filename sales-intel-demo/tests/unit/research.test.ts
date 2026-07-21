import { describe, expect, it } from "vitest";
import { HybridCrawler, runResearch, type CrawlerPort } from "@/lib/research";
import type { ResearchInput } from "@/lib/types";

const input: ResearchInput = { targetUrl: "https://example.com", preset: "ecommerce", sellerProfile: { productName: "情报助手", valueProposition: "让销售准备更快", targetCustomer: "电商团队", customerProblems: ["准备慢"], proofPoints: ["可追溯"], callToAction: "演示" } };
const crawler: CrawlerPort = { collect: async () => ({ notes: ["直连成功"], warnings: [], sources: [{ url: "https://example.com", title: "官网发布渠道升级计划", content: "官网公开说明企业正在推进海外渠道伙伴协同与订单交付效率提升。", sourceType: "official", fetchedAt: "2026-07-21T00:00:00.000Z" }] }) };

describe("研究流水线", () => {
  it("保留来源并生成恰好五个销售问题", async () => {
    const card = await runResearch(input, crawler);
    expect(card.sources).toHaveLength(1);
    expect(card.questions).toHaveLength(5);
    expect(card.overview.sourceIds[0]).toBe(card.sources[0]?.id);
    expect(card.overview.text).toContain("渠道升级计划");
    expect(card.collectionNotes).toContain("直连成功");
  });

  it("直连成功后仍执行 Firecrawl 补充并合并来源", async () => {
    let directCalls = 0;
    let supplementalCalls = 0;
    const direct: CrawlerPort = { collect: async () => { directCalls += 1; return { notes: ["直连"], warnings: [], sources: [{ url: "https://example.com", title: "官网", content: "企业公开发布新的渠道服务计划，覆盖海外客户支持。", sourceType: "official", fetchedAt: "2026-07-21T00:00:00.000Z" }] }; } };
    const supplemental: CrawlerPort = { collect: async () => { supplementalCalls += 1; return { notes: ["补充"], warnings: [], sources: [{ url: "https://news.example.com/launch", title: "业务新闻", content: "公开新闻介绍企业扩展了经销商服务网络。", sourceType: "news", fetchedAt: "2026-07-21T00:00:00.000Z" }] }; } };
    const result = await new HybridCrawler("test-key", direct, supplemental).collect(input);
    expect(directCalls).toBe(1);
    expect(supplementalCalls).toBe(1);
    expect(result.sources).toHaveLength(2);
    expect(result.notes).toContain("Firecrawl 已完成补充采集。");
  });

  it("直连失败时仍使用 Firecrawl 的来源", async () => {
    const failedDirect: CrawlerPort = { collect: async () => { throw new Error("network unavailable"); } };
    const supplemental: CrawlerPort = { collect: async () => ({ notes: ["补充"], warnings: [], sources: [{ url: "https://example.com/press", title: "新闻中心", content: "企业发布了新的产品交付与客户服务项目。", sourceType: "news", fetchedAt: "2026-07-21T00:00:00.000Z" }] }) };
    const card = await runResearch(input, new HybridCrawler("test-key", failedDirect, supplemental));
    expect(card.sources).toHaveLength(1);
    expect(card.warnings).toContain("官网直连采集未成功，已继续尝试补充通道。");
  });
});
