import { describe, expect, it } from "vitest";
import { normalizeModelAdvice } from "@/lib/llm";
import type { Battlecard } from "@/lib/types";

const sourceId = "source-01";
const card: Battlecard = {
  overview: { text: "示例企业公开发布海外渠道协同计划。", sourceIds: [sourceId] },
  signals: [{ text: "公开信号：渠道协同计划。", sourceIds: [sourceId] }],
  painHypotheses: [{ text: "待验证：渠道信息可能需要统一。", businessImpact: "可能影响响应效率。", confidenceLabel: "低", validationQuestion: "目前最难协同的环节是什么？", sourceIds: [sourceId] }],
  talkTrack: { objective: "确认问题。", opening: { text: "我看到公开渠道计划。", sourceIds: [sourceId] }, discoveryQuestions: [{ question: "当前阻碍是什么？", purpose: "确认痛点。" }, { question: "影响什么指标？", purpose: "量化影响。" }, { question: "谁参与决策？", purpose: "了解决策。" }], valueBridge: "帮助团队整理公开信号。", recommendedNextStep: "约一次需求交流。", avoid: ["不要将推断当作事实。"] },
  productMappings: [{ text: "从公开信号切入。", sourceIds: [sourceId], sellerCapability: "整理公开信号。", expectedValue: "提升准备效率。" }],
  questions: [{ question: "今年最优先的增长目标是什么？", purpose: "确认优先级。" }, { question: "最大的阻碍是什么？", purpose: "确认痛点。" }, { question: "希望改善什么指标？", purpose: "定义价值。" }, { question: "哪些角色参与决策？", purpose: "识别链路。" }, { question: "是否有小范围场景？", purpose: "推进试点。" }],
  opening: { text: "我看到公开渠道计划。", sourceIds: [sourceId] },
  risks: [{ text: "公开资料有限。", sourceIds: [sourceId] }],
  sources: [{ id: sourceId, url: "https://example.com", canonicalUrl: "https://example.com/", title: "渠道协同计划", content: "企业公开发布海外渠道协同计划。", sourceType: "official", fetchedAt: "2026-07-21T00:00:00.000Z", contentHash: "a".repeat(64) }],
  collectionNotes: ["直连完成。"],
  modelStatus: "evidence_based",
  warnings: [],
};

describe("模型建议归一化", () => {
  it("接受 Markdown JSON 和字符串 avoid", () => {
    const result = normalizeModelAdvice("```json\n{\"painHypotheses\":[{\"text\":\"待验证：渠道伙伴信息同步可能影响跟进。\",\"businessImpact\":\"影响跟进速度。\",\"validationQuestion\":\"伙伴信息目前如何同步？\",\"sourceIds\":[\"source-01\"]}],\"talkTrack\":{\"objective\":\"确认渠道协同效率。\",\"opening\":\"我看到贵司的渠道协同计划。\",\"discoveryQuestions\":[\"渠道信息现在由谁维护？\",\"哪些场景最容易延误？\",\"谁参与评估？\"],\"avoid\":\"不要把推断当作事实。\"}}\n```", card);
    expect(result?.painHypotheses[0]?.text).toContain("渠道伙伴");
    expect(result?.talkTrack.avoid).toEqual(["不要把推断当作事实。"]);
    expect(result?.talkTrack.discoveryQuestions).toHaveLength(3);
  });

  it("缺少非关键字段时用证据卡片补全", () => {
    const result = normalizeModelAdvice("{\"painHypotheses\":[{\"text\":\"待验证：信息传递可能有延迟。\"}]}", card);
    expect(result?.painHypotheses[0]?.businessImpact).toBe("可能影响响应效率。");
    expect(result?.talkTrack.opening.text).toBe(card.talkTrack.opening.text);
  });

  it("截断 JSON 不会抛错，也不会覆盖现有证据建议", () => {
    expect(normalizeModelAdvice("{\"painHypotheses\":[", card)).toBeUndefined();
  });
});
