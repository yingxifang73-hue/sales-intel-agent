import { describe, expect, it } from "vitest";
import { buildBroadSearchQueries, sourceFromOfficialSearchSnippet } from "@/lib/web-search";
import type { ResearchInput } from "@/lib/types";

const input: ResearchInput = {
  targetUrl: "https://www.doubao.com",
  preset: "ai",
  customIndustry: "人工智能",
  sellerProfile: {
    productName: "企业团队 AI 对话额度统一管理后台",
    valueProposition: "",
    targetCustomer: "",
    customerProblems: [],
    proofPoints: [],
    callToAction: "安排初步沟通",
  },
};

describe("official search fallback", () => {
  it("turns a sufficiently detailed same-site search result into official evidence", () => {
    const source = sourceFromOfficialSearchSnippet({
      title: "豆包－字节跳动旗下 AI 智能助手",
      link: "https://www.doubao.com/",
      snippet: "豆包是字节跳动旗下的 AI 智能助手，可提供智能对话、问答、写作、翻译和编程辅助，并支持企业与个人用户完成多种工作任务。",
    }, "www.doubao.com");

    expect(source?.sourceType).toBe("official");
    expect(source?.content).toContain("字节跳动旗下");
  });

  it("never treats a third-party search snippet as official evidence", () => {
    expect(sourceFromOfficialSearchSnippet({
      title: "第三方豆包教程",
      link: "https://example.com/doubao",
      snippet: "这是一篇第三方教程，虽然提到了目标公司，但不应成为官方公司画像的替代来源。",
    }, "www.doubao.com")).toBeUndefined();
  });

  it("prioritizes company identity queries before seller-product queries", () => {
    const queries = buildBroadSearchQueries("www.doubao.com", "豆包", input);

    expect(queries[0]).toContain("official company");
    expect(queries.slice(0, 4).some((query) => query.includes("公司简介"))).toBe(true);
    expect(queries.findIndex((query) => query.includes("企业团队")))
      .toBeGreaterThan(1);
  });
});
