import { describe, expect, it } from "vitest";
import { runResearch, type CrawlerPort } from "@/lib/research";
import type { ResearchInput } from "@/lib/types";

const input: ResearchInput = { targetUrl: "https://example.com", preset: "ecommerce", sellerProfile: { productName: "情报助手", valueProposition: "让销售准备更快", targetCustomer: "电商团队", customerProblems: ["准备慢"], proofPoints: ["可追溯"], callToAction: "演示" } };
const crawler: CrawlerPort = { collect: async () => ({ warnings: [], sources: [{ url: "https://example.com", title: "官网", content: "公开业务信息", sourceType: "official", fetchedAt: "2026-07-21T00:00:00.000Z" }] }) };

describe("研究流水线", () => {
  it("保留来源并生成恰好五个销售问题", async () => {
    const card = await runResearch(input, crawler);
    expect(card.sources).toHaveLength(1);
    expect(card.questions).toHaveLength(5);
    expect(card.overview.sourceIds[0]).toBe(card.sources[0]?.id);
  });
});
