import { describe, expect, it } from "vitest";
import {
  buildSemanticRepairInstruction,
  selectRepairStages,
  shouldStoreRepairCandidate,
} from "@/lib/report-repair";

describe("selectRepairStages", () => {
  it("只重跑缺失的机会和其下游沟通模块", () => {
    expect(selectRepairStages(["缺少有直接证据支撑的机会与痛点"])).toEqual([
      "opportunity",
      "conversation",
      "quality_review",
    ]);
  });

  it("只缺沟通内容时不重复事实与机会分析", () => {
    expect(selectRepairStages(["首次沟通开场话术内容不足"])).toEqual([
      "conversation",
      "quality_review",
    ]);
  });

  it("客户画像不足时从事实层开始定向修复", () => {
    expect(selectRepairStages(["客户画像关键维度不足"])).toEqual([
      "facts",
      "opportunity",
      "conversation",
      "quality_review",
    ]);
  });

  it("仅语义复核失败时根据问题字段选择最小修复范围", () => {
    expect(selectRepairStages(
      ["语义质量复核未通过"],
      [{ field: "qualityJudge.specificity.conversationPlan.opening30s", reason: "开场空泛" }],
    )).toEqual(["conversation", "quality_review"]);
  });

  it("把语义复核的具体问题传给修复模型，而不是盲目重复生成", () => {
    expect(buildSemanticRepairInstruction([
      {
        field: "qualityJudge.relevance.customerIntelligence.companyOverview",
        reason: "公司概况被具体产品页面带偏",
      },
      { field: "sourceFacts.S1", reason: "与本次定向修复无关" },
    ])).toContain("公司概况被具体产品页面带偏");
  });

  it("语义标记尚未清除时仍保存已经通过客观门槛的内容修复", () => {
    expect(shouldStoreRepairCandidate({
      modelStage: "facts",
      before: { passed: false, missing: ["语义质量复核未通过"] },
      after: { passed: false, missing: ["语义质量复核未通过"] },
      beforeDelivery: { passed: true, missing: [] },
      afterDelivery: { passed: true, missing: [] },
      moduleChanged: true,
    })).toBe(true);
  });

  it("不保存没有产生内容变化或引入客观缺陷的修复结果", () => {
    const base = {
      modelStage: "opportunity" as const,
      before: { passed: false, missing: ["语义质量复核未通过"] },
      after: { passed: false, missing: ["语义质量复核未通过"] },
      beforeDelivery: { passed: true, missing: [] },
    };
    expect(shouldStoreRepairCandidate({
      ...base,
      afterDelivery: { passed: true, missing: [] },
      moduleChanged: false,
    })).toBe(false);
    expect(shouldStoreRepairCandidate({
      ...base,
      afterDelivery: { passed: false, missing: ["产品匹配内容不足"] },
      moduleChanged: true,
    })).toBe(false);
  });
});
