import type { SourceFactExtractionResult } from "@/lib/llm";
import type { SalesReport } from "@/lib/types";

export const REPORT_MODULE_STAGES = [
  { id: "customer_profile", label: "客户画像", progress: 76 },
  { id: "product_fit", label: "产品匹配", progress: 82 },
  { id: "opportunities", label: "机会与痛点", progress: 86 },
  { id: "talk_track", label: "沟通方案", progress: 90 },
  { id: "next_step", label: "下一步", progress: 93 },
  { id: "sales_verdict", label: "销售结论", progress: 96 },
] as const;

export type ReportModuleStage = typeof REPORT_MODULE_STAGES[number]["id"];

const MODULE_OUTCOMES = {
  customer_profile: "facts",
  product_fit: "opportunity",
  opportunities: "opportunity",
  talk_track: "conversation",
  next_step: "conversation",
  sales_verdict: "quality_review",
} as const;

export function reportModuleProgress(stage: ReportModuleStage): number {
  return REPORT_MODULE_STAGES.find((item) => item.id === stage)?.progress ?? 76;
}

export function reportModuleLabel(stage: ReportModuleStage): string {
  return REPORT_MODULE_STAGES.find((item) => item.id === stage)?.label ?? "销售调研报告";
}

export function isReportModuleComplete(report: SalesReport, stage: ReportModuleStage): boolean {
  const outcome = report.qualityAudit?.stageOutcomes?.[MODULE_OUTCOMES[stage]];
  return outcome === "success" || outcome === "partial" || outcome === "failed";
}

// Every selected source is still processed. Larger durable batches are run in
// parallel by the workflow, reducing serial waiting without discarding source
// coverage.
export const SOURCE_FACT_BATCH_SIZE = 3;

export function sourceFactBatchCount(sourceCount: number): number {
  return Math.ceil(Math.max(0, sourceCount) / SOURCE_FACT_BATCH_SIZE);
}

export function mergeSourceFactExtraction(
  existing: SourceFactExtractionResult | undefined,
  next: SourceFactExtractionResult,
): SourceFactExtractionResult {
  const bundles = new Map<string, SourceFactExtractionResult["bundles"][number]>();
  for (const bundle of [...(existing?.bundles ?? []), ...next.bundles]) {
    bundles.set(bundle.sourceId, bundle);
  }

  return {
    bundles: [...bundles.values()],
    outcomes: {
      ...(existing?.outcomes ?? {}),
      facts: existing?.outcomes.facts === "partial" || next.outcomes.facts === "partial"
        ? "partial"
        : next.outcomes.facts,
    },
    rejected: [...(existing?.rejected ?? []), ...next.rejected],
  };
}
