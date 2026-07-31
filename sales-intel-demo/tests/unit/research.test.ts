import { describe, expect, it } from "vitest";
import { discoverMarkdownCandidates, runResearch, type CrawlerPort } from "@/lib/research";
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

const crawler: CrawlerPort = {
  collect: async () => ({
    notes: ["直连成功"],
    warnings: [],
    sources: [
      {
        url: "https://example.com",
        title: "官网发布渠道升级计划",
        content: "官网公开说明企业正在推进海外渠道伙伴协同与订单交付效率提升。",
        sourceType: "official",
        fetchedAt: "2026-07-21T00:00:00.000Z",
      },
    ],
    coveredCategories: ["company"],
    failedSources: [],
  }),
};

describe("研究流水线", () => {
  it("从官网 markdown 中只保留可调研的同域候选页", () => {
    const candidates = discoverMarkdownCandidates(
      [
        "[关于我们](/about)",
        "[产品与服务](/products)",
        "[新闻动态](/news)",
        "[登录](/admin/login)",
        "[外部讨论](https://reddit.com/r/example)",
      ].join("\n"),
      "https://example.com/",
    );
    expect(candidates).toEqual([
      { url: "https://example.com/about", category: "company" },
      { url: "https://example.com/products", category: "product" },
      { url: "https://example.com/news", category: "news" },
    ]);
  });

  it("保留来源并生成发现型问题", async () => {
    const report = await runResearch(input, crawler);
    expect(report.sources).toHaveLength(1);
    expect(report.conversationPlan.discoveryQuestions.length).toBeGreaterThanOrEqual(2);
    expect(report.salesVerdict.recommendationReason.status).toBeDefined();
    expect(report.collectionNotes).toContain("直连成功");
  });

  it("合并来源并透传采集备注", async () => {
    const multiSource: CrawlerPort = {
      collect: async () => ({
        notes: ["直连", "补充"],
        warnings: [],
        sources: [
          {
            url: "https://example.com",
            title: "官网",
            content: "企业公开发布新的渠道服务计划，覆盖海外客户支持。",
            sourceType: "official",
            fetchedAt: "2026-07-21T00:00:00.000Z",
          },
          {
            url: "https://news.example.com/launch",
            title: "业务新闻",
            content: [
              "公开新闻介绍企业扩展了经销商服务网络，并在多个重点区域增加本地客户支持与交付团队。",
              "新计划覆盖合作伙伴培训、订单协同、售后响应和渠道运营，旨在缩短客户上线与问题处理周期。",
              "公司表示将持续跟踪合作伙伴的服务质量、交付效率和客户满意度，并依据运营结果调整区域资源。",
              "该新闻同时披露了项目的实施范围、业务目标和后续推进安排，可作为近期渠道扩张的完整业务信号。",
              "首批区域项目将在季度内启动。",
            ].join(""),
            sourceType: "news",
            fetchedAt: "2026-07-21T00:00:00.000Z",
          },
        ],
        coveredCategories: ["company", "news"],
        failedSources: [],
      }),
    };
    const report = await runResearch(input, multiSource);
    expect(report.sources.length).toBeGreaterThanOrEqual(2);
    expect(report.collectionNotes).toContain("直连");
    expect(report.collectionNotes).toContain("补充");
  });

  it("无来源时抛出错误", async () => {
    const emptyCrawler: CrawlerPort = {
      collect: async () => ({
        notes: [],
        warnings: [],
        sources: [],
        coveredCategories: [],
        failedSources: [],
      }),
    };
    await expect(runResearch(input, emptyCrawler)).rejects.toThrow();
  });
});
