import { describe, expect, it } from "vitest";
import { selectRepairStages } from "@/lib/report-repair";

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
});
