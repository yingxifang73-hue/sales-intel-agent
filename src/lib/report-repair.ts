import type { RejectedField } from "@/lib/types";

export type ReportGenerationStage = "facts" | "opportunity" | "conversation" | "quality_review";

const ALL_STAGES: ReportGenerationStage[] = ["facts", "opportunity", "conversation", "quality_review"];
const OPPORTUNITY_STAGES: ReportGenerationStage[] = ["opportunity", "conversation", "quality_review"];
const CONVERSATION_STAGES: ReportGenerationStage[] = ["conversation", "quality_review"];

export function selectRepairStages(
  missing: string[],
  rejectedFields: RejectedField[] = [],
): ReportGenerationStage[] {
  const details = `${missing.join(" ")} ${rejectedFields.map((item) => `${item.field} ${item.reason}`).join(" ")}`;

  if (/公司概况|产品与服务|客户画像|商业模式|产品定位|规模与能力|近期动态|qualityJudge\.(?:relevance|recent_update|contact)\.(?:customer|contact)/i.test(details)) {
    return ALL_STAGES;
  }
  if (/机会与痛点|模型阶段未完成：opportunity|产品匹配|qualityJudge\.(?:relevance|grounding|contradiction|specificity)\.(?:opportunity|salesVerdict)/i.test(details)) {
    return OPPORTUNITY_STAGES;
  }
  if (/联系角色|沟通目标|开场话术|价值桥接|发现问题|异议回应|明确下一步|模型阶段未完成：conversation|qualityJudge\.[^.]+\.conversationPlan/i.test(details)) {
    return CONVERSATION_STAGES;
  }

  // A generic quality failure is not improved by blindly repeating every
  // expensive stage. Recheck the current report once and preserve the data.
  return ["quality_review"];
}
