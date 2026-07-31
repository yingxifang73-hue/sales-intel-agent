import { describe, expect, it } from "vitest";
import { normalizeSalesReportAudit } from "@/lib/quality-audit";
import { SalesReportSchema, type ResearchInput, type SalesReport, type Source } from "@/lib/types";
import { synthesizeReport } from "@/lib/research";

const input: ResearchInput = {
  targetUrl: "https://example.com",
  preset: "ecommerce",
  sellerProfile: {
    productName: "客户洞察助手",
    valueProposition: "把公开资料整理为销售洞察",
    targetCustomer: "企业销售团队",
    customerProblems: ["售前准备耗时"],
    proofPoints: ["来源可追溯"],
    callToAction: "安排需求沟通",
  },
};

const sources: Source[] = [{
  id: "source-quality-audit-0001",
  url: input.targetUrl,
  canonicalUrl: input.targetUrl,
  title: "目标公司官网",
  content: "目标公司提供企业服务，并公开介绍了产品能力和客户场景。",
  sourceType: "official",
  fetchedAt: "2026-07-30T00:00:00.000Z",
  contentHash: "a".repeat(64),
}];

describe("quality audit normalization", () => {
  it("keeps the report content intact while bounding accumulated diagnostics", () => {
    const report = synthesizeReport(
      input,
      sources,
      [],
      [],
      { directChannels: 1, firecrawlChannels: 0, gapFilledCategories: [] },
      {
        directSourceCount: 1,
        firecrawlBaseSourceCount: 0,
        firecrawlGapSourceCount: 0,
        coveredCategories: ["company"],
        failedSources: [],
      },
    );
    const oversized = {
      ...report,
      qualityAudit: {
        ...report.qualityAudit!,
        rejectedFields: [
          ...Array.from({ length: 40 }, (_, index) => ({
            field: `facts.field.${index}`,
            reason: `旧诊断 ${index}`,
          })),
          { field: "qualityJudge.relevance.companyOverview", reason: "最新语义复核结果" },
          { field: "qualityJudge.relevance.companyOverview", reason: "最新语义复核结果" },
        ],
        filteredSources: Array.from({ length: 45 }, (_, index) => ({
          url: `https://example.com/${index}`,
          reason: `过滤原因 ${index}`,
        })),
        missingFields: Array.from({ length: 25 }, (_, index) => `缺失字段 ${index}`),
      },
    } satisfies SalesReport;

    const normalized = normalizeSalesReportAudit(oversized);
    const parsed = SalesReportSchema.parse(normalized);

    expect(parsed.qualityAudit?.rejectedFields).toHaveLength(40);
    expect(parsed.qualityAudit?.rejectedFields.at(-1)).toEqual({
      field: "qualityJudge.relevance.companyOverview",
      reason: "最新语义复核结果",
    });
    expect(parsed.qualityAudit?.filteredSources).toHaveLength(40);
    expect(parsed.qualityAudit?.missingFields).toHaveLength(20);
    expect(parsed.customerIntelligence).toEqual(report.customerIntelligence);
    expect(parsed.opportunityAnalysis).toEqual(report.opportunityAnalysis);
    expect(parsed.conversationPlan).toEqual(report.conversationPlan);
    expect(parsed.sources).toEqual(report.sources);
  });
});
