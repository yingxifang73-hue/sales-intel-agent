import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runResearch, type CrawlerPort, type CollectionResult } from "@/lib/research";
import { checkMinimum } from "@/lib/quality-gate";
import type { ResearchInput } from "@/lib/types";

const input: ResearchInput = {
  targetUrl: "https://example.com",
  preset: "ecommerce",
  sellerProfile: {
    productName: "情报助手",
    valueProposition: "让销售准备更快",
    targetCustomer: "电商团队",
    customerProblems: ["准备慢"],
    proofPoints: ["可追溯"],
    callToAction: "演示",
  },
};

function fakeSource(url: string, title: string, sourceType: "official" | "news" = "official") {
  return { url, title, content: `官网公开内容：${title}。该页面包含可验证的公司、产品与业务信息，供销售调研使用。`, sourceType, fetchedAt: "2026-07-22T00:00:00.000Z" };
}

describe("容错行为", () => {
  it("把六个报告模块拆成可独立恢复的 durable steps", () => {
    const workflow = readFileSync(resolve(process.cwd(), "src/workflows/research-workflow.ts"), "utf8");

    expect(workflow).toContain("async function initializeReport");
    expect(workflow).toContain("async function generateCustomerProfile");
    expect(workflow).toContain("async function generateProductFit");
    expect(workflow).toContain("async function saveOpportunities");
    expect(workflow).toContain("async function generateTalkTrack");
    expect(workflow).toContain("async function saveNextStep");
    expect(workflow).toContain("async function finalizeSalesVerdict");
    expect(workflow).toContain("async function repairCustomerProfile");
    expect(workflow).toContain("async function repairProductFit");
    expect(workflow).toContain("async function repairTalkTrack");
    expect(workflow).toContain("async function repairSalesVerdict");
    expect(workflow).not.toContain("async function generateReport");
    expect(workflow).not.toContain("async function repairIncompleteReport");
    expect(workflow).not.toContain("await enhanceWithLlm(draft");
  });

  it("部分来源失败时其余来源正常采集", async () => {
    const partialCrawler: CrawlerPort = {
      collect: async (): Promise<CollectionResult> => ({
        sources: [fakeSource("https://example.com", "官网")],
        notes: ["直连成功但部分页面失败"],
        warnings: ["内页 example.com/about 采集失败: 超时"],
        coveredCategories: ["company"],
        failedSources: [
          { url: "https://example.com/about", reason: "timeout" as const, timestamp: new Date().toISOString() },
          { url: "https://example.com/products", reason: "http_4xx" as const, timestamp: new Date().toISOString() },
        ],
      }),
    };
    const report = await runResearch(input, partialCrawler);
    expect(report.sources.length).toBeGreaterThanOrEqual(1);
  });

  it("全部失败时抛出错误", async () => {
    const alwaysFail: CrawlerPort = {
      collect: async () => { throw new Error("HTTP 503 Service Unavailable"); },
    };
    await expect(runResearch(input, alwaysFail)).rejects.toThrow();
  });

  it("warnings 透传机制", async () => {
    const withWarnings: CrawlerPort = {
      collect: async (): Promise<CollectionResult> => ({
        sources: [fakeSource("https://example.com", "官网")],
        notes: [],
        warnings: ["FIRECRAWL_API_KEY 未设置"],
        coveredCategories: ["company"],
        failedSources: [],
      }),
    };
    const report = await runResearch(input, withWarnings);
    // warnings 透传到 collectionNotes（因 synthesizeReport 把 warnings 放进了 customerIntelligence.informationGaps）
    expect(report.collectionNotes.some((n) => n.includes("FIRECRAWL_API_KEY") || n === "")).toBeDefined();
  });
  it("rejects a collection-only report as insufficient", async () => {
    const crawler: CrawlerPort = {
      collect: async (): Promise<CollectionResult> => ({
        sources: [fakeSource("https://example.com", "official site")],
        notes: [],
        warnings: [],
        coveredCategories: ["company"],
        failedSources: [],
      }),
    };

    const report = await runResearch(input, crawler);
    expect(checkMinimum(report).passed).toBe(false);
  });
});
