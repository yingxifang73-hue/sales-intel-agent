import { describe, expect, it } from "vitest";
import {
  REPORT_MODULE_STAGES,
  isReportModuleComplete,
  mergeSourceFactExtraction,
  reportModuleProgress,
  sourceFactBatchCount,
} from "@/lib/research-workflow-state";
import type { SalesReport } from "@/lib/types";

describe("research workflow state", () => {
  it("uses the six approved business module names and stable progress points", () => {
    expect(REPORT_MODULE_STAGES.map((stage) => stage.label)).toEqual([
      "客户画像",
      "产品匹配",
      "机会与痛点",
      "沟通方案",
      "下一步",
      "销售结论",
    ]);
    expect(reportModuleProgress("customer_profile")).toBe(76);
    expect(reportModuleProgress("product_fit")).toBe(82);
    expect(reportModuleProgress("opportunities")).toBe(86);
    expect(reportModuleProgress("talk_track")).toBe(90);
    expect(reportModuleProgress("next_step")).toBe(93);
    expect(reportModuleProgress("sales_verdict")).toBe(96);
  });

  it("treats a persisted shared model result as complete for both related modules", () => {
    const report = {
      qualityAudit: {
        stageOutcomes: {
          facts: "partial",
          opportunity: "success",
          conversation: "partial",
          quality_review: "failed",
        },
      },
    } as unknown as SalesReport;

    expect(isReportModuleComplete(report, "customer_profile")).toBe(true);
    expect(isReportModuleComplete(report, "product_fit")).toBe(true);
    expect(isReportModuleComplete(report, "opportunities")).toBe(true);
    expect(isReportModuleComplete(report, "talk_track")).toBe(true);
    expect(isReportModuleComplete(report, "next_step")).toBe(true);
    expect(isReportModuleComplete(report, "sales_verdict")).toBe(true);
  });

  it("does not skip a model module before its outcome has been persisted", () => {
    const report = { qualityAudit: { stageOutcomes: {} } } as unknown as SalesReport;
    for (const stage of REPORT_MODULE_STAGES) {
      expect(isReportModuleComplete(report, stage.id)).toBe(false);
    }
  });

  it("batches every selected source without silently truncating coverage", () => {
    expect(sourceFactBatchCount(0)).toBe(0);
    expect(sourceFactBatchCount(1)).toBe(1);
    expect(sourceFactBatchCount(2)).toBe(2);
    expect(sourceFactBatchCount(3)).toBe(3);
    expect(sourceFactBatchCount(4)).toBe(4);
    expect(sourceFactBatchCount(6)).toBe(6);
    expect(sourceFactBatchCount(7)).toBe(7);
    expect(sourceFactBatchCount(17)).toBe(17);
  });

  it("merges durable fact batches without duplicating a retried source", () => {
    const first = {
      bundles: [{ sourceId: "a", companyOverview: { value: "A", status: "verified" as const, sourceIds: ["a"] }, productsAndServices: [], recentUpdates: [], signals: [] }],
      outcomes: { facts: "success" as const },
      rejected: [],
    };
    const retry = {
      bundles: [
        { sourceId: "a", companyOverview: { value: "A revised", status: "verified" as const, sourceIds: ["a"] }, productsAndServices: [], recentUpdates: [], signals: [] },
        { sourceId: "b", companyOverview: { value: "B", status: "verified" as const, sourceIds: ["b"] }, productsAndServices: [], recentUpdates: [], signals: [] },
      ],
      outcomes: { facts: "partial" as const },
      rejected: [{ field: "companyOverview", reason: "bad source" }],
    };

    const merged = mergeSourceFactExtraction(first, retry);
    expect(merged.bundles.map((bundle) => bundle.sourceId)).toEqual(["a", "b"]);
    expect(merged.bundles[0]?.companyOverview?.value).toBe("A revised");
    expect(merged.outcomes.facts).toBe("partial");
    expect(merged.rejected).toEqual([{ field: "companyOverview", reason: "bad source" }]);
  });
});
