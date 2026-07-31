import { describe, expect, it } from "vitest";
import { formatFullResearchArchive } from "@/lib/research-archive";
import type { ResearchInput, Source } from "@/lib/types";

const input: ResearchInput = {
  targetUrl: "https://example.com",
  preset: "ecommerce",
  sellerProfile: {
    productName: "无菌包装材料",
    valueProposition: "",
    targetCustomer: "",
    customerProblems: [],
    proofPoints: [],
    callToAction: "安排沟通",
  },
};

const source: Source = {
  id: "1234567890abcdef",
  url: "https://example.com/about",
  canonicalUrl: "https://example.com/about",
  title: "公司介绍",
  content: "这是完整保留的原始清洗正文，不应被摘要截断。",
  sourceType: "official",
  fetchedAt: "2026-07-28T00:00:00.000Z",
  contentHash: "a".repeat(64),
};

describe("formatFullResearchArchive", () => {
  it("includes the complete collected正文 and marks report selection", () => {
    const archive = formatFullResearchArchive({
      generatedAt: "2026-07-28T00:00:00.000Z",
      input,
      researchPlan: [{ id: 1, label: "公司与身份", categories: ["company"] }],
      collection: { notes: ["官网采集完成"], warnings: [], failures: [] },
      sources: [source],
      selectedSourceIds: new Set([source.id]),
      report: { status: "complete" },
    });

    expect(archive).toContain("无删减研究档案");
    expect(archive).toContain(source.content);
    expect(archive).toContain("已进入最终报告");
    expect(archive).toContain("官网采集完成");
  });
});
