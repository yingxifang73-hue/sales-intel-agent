import { describe, expect, it } from "vitest";
import { normalizeCompanyResearch, normalizeSalesStrategy } from "@/lib/llm";
import type { Battlecard } from "@/lib/types";

const sourceId = "source-01";
const cited = (text: string) => ({ text, sourceIds: [sourceId] });
const pain = { ...cited("待验证：渠道与生产信息可能需要更快协同。"), businessImpact: "可能影响交付响应效率。", confidenceLabel: "低" as const, validationQuestion: "目前最难协调的环节是什么？" };
const questions = ["当前生产计划如何同步？", "哪个环节最影响交付？", "如何衡量改进效果？", "谁会参与方案评估？", "是否有适合先验证的产线？"].map((question) => ({ question, purpose: "验证业务现状。" }));
const card: Battlecard = {
  overview: cited("已采集目标公司的公开资料。"),
  signals: [cited("官网包含产品和市场信息。")],
  painHypotheses: [pain],
  talkTrack: { objective: "验证业务需求。", opening: cited("想了解当前业务情况。"), discoveryQuestions: questions.slice(0, 3), valueBridge: "谨慎验证产品关联。", recommendedNextStep: "安排需求交流。", avoid: ["不要把推断当作事实。"] },
  productMappings: [{ ...cited("结合公开信号验证产品机会。"), sellerCapability: "冰箱制造器", expectedValue: "需要沟通验证。" }],
  questions,
  opening: cited("想了解当前业务情况。"),
  risks: [cited("公开资料有限。")],
  companyOverview: { companyIntroduction: cited("已采集公司资料，等待中文研究。"), productsAndServices: [cited("已采集产品资料，等待中文研究。")], industryAndCoverage: cited("已采集行业资料，等待中文研究。"), recentUpdates: [cited("已采集动态资料，等待中文研究。")] },
  companyAnalysis: { businessModel: cited("商业模式等待中文研究。"), productPositioning: cited("产品定位等待中文研究。"), targetCustomers: cited("目标客户等待中文研究。"), competitionObservation: cited("竞争信息等待中文研究。"), painHypotheses: [pain] },
  salesStrategy: { entryPoints: [cited("结合公开信号验证业务需求。")], recommendation: cited("冰箱制造器的具体关联需要沟通验证。"), opening: cited("想了解当前业务情况。"), potentialNeeds: [cited("潜在需求需要沟通验证。")], discoveryQuestions: questions, recommendedNextStep: "安排需求交流。", avoid: ["不要把推断当作事实。"] },
  sources: [{ id: sourceId, url: "https://example.com", canonicalUrl: "https://example.com/", title: "目标公司官网", content: "Company public information.", sourceType: "official", fetchedAt: "2026-07-21T00:00:00.000Z", contentHash: "a".repeat(64) }],
  collectionNotes: ["官网资料已采集。"],
  modelStatus: "evidence_based",
  warnings: [],
};

const companyResearch = {
  companyOverview: {
    companyIntroduction: cited("美的是一家全球化家电制造企业，业务覆盖多个家电品类。"),
    productsAndServices: [cited("主要产品包括冰箱、空调、洗衣设备及相关智慧家居产品。")],
    industryAndCoverage: cited("公司位于家电制造与智慧家居行业，业务覆盖多个国家和地区。"),
    recentUpdates: [cited("官网近期披露了海外合作与节能产品方面的业务动态。")],
  },
  companyAnalysis: {
    businessModel: cited("公司通过家电产品销售、渠道合作及相关解决方案服务市场。"),
    productPositioning: cited("产品定位强调家电制造能力、智能化体验和全球市场覆盖。"),
    targetCustomers: cited("目标客户包括家庭消费者、渠道合作伙伴及部分商业客户。"),
    competitionObservation: cited("公开资料不足以确认具体竞争比较，建议沟通中验证现有方案与评估标准。"),
    painHypotheses: [pain],
  },
};

describe("完整报告模型结果归一化", () => {
  it("接受带有效来源的中文公司研究", () => {
    const result = normalizeCompanyResearch(JSON.stringify(companyResearch), card);
    expect(result?.companyOverview.companyIntroduction.text).toContain("全球化家电制造企业");
    expect(result?.companyAnalysis.painHypotheses).toHaveLength(1);
  });

  it("竞争资料不足时保留诚实的信息缺口，不让单个栏位拖垮报告", () => {
    const incompleteCompetition = structuredClone(companyResearch);
    incompleteCompetition.companyAnalysis.competitionObservation.sourceIds = [];
    const result = normalizeCompanyResearch(JSON.stringify(incompleteCompetition), card);
    expect(result?.companyAnalysis.competitionObservation.text).toContain("信息缺口");
    expect(result?.companyAnalysis.competitionObservation.sourceIds).toEqual([sourceId]);
  });

  it("拒绝英文主导、HTML 实体和未知来源", () => {
    const english = structuredClone(companyResearch);
    english.companyOverview.companyIntroduction.text = "Midea is the world's largest producer of major appliances.";
    expect(normalizeCompanyResearch(JSON.stringify(english), card)).toBeUndefined();
    const entity = structuredClone(companyResearch);
    entity.companyOverview.companyIntroduction.text = "美的是 World&#39;s No.1 家电品牌。";
    expect(normalizeCompanyResearch(JSON.stringify(entity), card)).toBeUndefined();
    const unknown = structuredClone(companyResearch);
    unknown.companyOverview.companyIntroduction.sourceIds = ["unknown-01"];
    expect(normalizeCompanyResearch(JSON.stringify(unknown), card)).toBeUndefined();
  });

  it("销售策略必须关联用户产品、客户信号和五个问题", () => {
    const raw = JSON.stringify({ salesStrategy: { entryPoints: [cited("从美的公开披露的冰箱与节能产品布局切入，验证生产环节需求。")], recommendation: cited("冰箱制造器与美的冰箱生产场景可能存在关联，但具体能力和适配范围需要沟通验证。"), opening: cited("了解到贵司持续推进冰箱与节能产品布局，我们提供冰箱制造器，想先了解当前生产环节最希望改善的问题。"), potentialNeeds: [cited("待验证：冰箱生产环节可能关注设备适配、效率和质量稳定性。")], discoveryQuestions: questions, recommendedNextStep: "选择一条具体产线，安排一次需求澄清并确认设备适配条件。", avoid: ["不要在未确认产品能力前承诺具体效率指标。"] } });
    const result = normalizeSalesStrategy(raw, card, "冰箱制造器");
    expect(result?.salesStrategy.recommendation.text).toContain("冰箱制造器");
    expect(result?.salesStrategy.discoveryQuestions).toHaveLength(5);
  });

  it("兼容模型返回的角度/信号/关联结构，并继承已校验证据", () => {
    const raw = JSON.stringify({ salesStrategy: {
      entryPoints: [{ angle: "冰箱制造器可能提升冰箱生产效率。", signal: "公开资料显示美的覆盖冰箱等家电品类。", relevance: "验证现有生产设备的改造或更新计划。" }],
      recommendation: "建议将冰箱制造器作为待验证方案，不预设具体能力，先确认产线环节和设备要求。",
      opening: "了解到贵司覆盖冰箱等家电品类，我们提供冰箱制造器，想先了解当前产线是否有设备更新或改造计划。",
      potentialNeeds: [{ need: "待验证：冰箱产线可能存在设备更新需求。", basis: "依据公开产品布局提出，不视为已确认事实。" }],
      discoveryQuestions: questions,
      recommendedNextStep: "安排一次需求交流，确认产线、设备要求和参与角色。",
      avoid: ["不要承诺未提供的产品参数。"],
    } });
    const result = normalizeSalesStrategy(raw, card, "冰箱制造器");
    expect(result?.salesStrategy.entryPoints[0].text).toContain("公开资料");
    expect(result?.salesStrategy.entryPoints[0].text).not.toContain("提升冰箱生产效率");
    expect(result?.salesStrategy.recommendation.sourceIds).toEqual([sourceId]);
    expect(result?.salesStrategy.recommendation.text).toContain("不能据此推断功能或效果");
    expect(result?.salesStrategy.opening.text).not.toContain("提升效率");
  });

  it("模型切入点都夹带产品能力时，从公司产品证据生成安全切入点", () => {
    const evidenceCard = structuredClone(card);
    evidenceCard.companyOverview.productsAndServices = [cited("目标公司公开产品包括冰箱、空调和洗衣设备。")];
    const raw = JSON.stringify({ salesStrategy: {
      entryPoints: [{ angle: "冰箱制造器可以提升效率。", signal: "冰箱制造器适合该企业。", relevance: "冰箱制造器能够降低成本。" }],
      recommendation: "建议了解冰箱制造器的适配情况。",
      opening: "我们提供冰箱制造器，想了解贵司需求。",
      potentialNeeds: ["待验证：冰箱制造环节可能有设备更新需求。"],
      discoveryQuestions: questions,
      recommendedNextStep: "安排需求交流并确认产品能力。",
      avoid: ["不要承诺未提供的产品效果。"],
    } });
    const result = normalizeSalesStrategy(raw, evidenceCard, "冰箱制造器");
    expect(result?.salesStrategy.entryPoints[0].text).toContain("产品包括冰箱");
    expect(result?.salesStrategy.entryPoints[0].text).not.toContain("降低成本");
  });
});
