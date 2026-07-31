import { describe, expect, it } from "vitest";
import { getConfig } from "@/lib/config";
import { PRESETS } from "@/lib/presets";
import { ResearchInputSchema, SalesReportSchema, legacyBattlecardToReport, verifiedField, insufficientField, inferredField } from "@/lib/types";

const validInput = {
  targetUrl: "https://example.com",
  preset: "manufacturing",
  sellerProfile: {
    productName: "客户洞察助手",
    valueProposition: "将公开信息变成销售拜访前可用的行动建议",
    targetCustomer: "需要拓展大客户的销售团队",
    customerProblems: ["售前准备耗时且信息分散"],
    proofPoints: ["输出每条事实的来源链接"],
    callToAction: "安排一次 20 分钟需求交流",
  },
};

describe("核心数据契约", () => {
  it("接受完整研究输入并提供五个行业预设", () => {
    expect(ResearchInputSchema.parse(validInput)).toEqual(validInput);
    expect(Object.keys(PRESETS)).toHaveLength(5);
  });

  it("接受用户填写的自定义行业", () => {
    expect(ResearchInputSchema.parse({ ...validInput, customIndustry: "宠物食品" }).customIndustry).toBe("宠物食品");
  });

  it("拒绝缺少关键卖方信息的输入", () => {
    // proofPoints 已有 default([])，不再 reject。改为检查 productName 缺失。
    expect(() => ResearchInputSchema.parse({ ...validInput, sellerProfile: { ...validInput.sellerProfile, productName: "" } })).toThrow();
  });

  it("在读取配置时提供真实研究流程的默认值", () => {
    const config = getConfig({});
    expect(config.OPENAI_MODEL).toBe("gpt-4.1-mini");
    expect(config.ENABLE_LLM_ENHANCEMENT).toBe("true");
    expect(config.FIRECRAWL_BASE_URL).toBe("https://api.firecrawl.dev/v2");
  });

  it("SalesReport 包含四个模块顶层对象", () => {
    const report = {
      reportMeta: { companyName: "测试公司", targetUrl: "https://example.com", sellerProductName: "测试产品", collectedAt: new Date().toISOString(), status: "仅采集" },
      salesVerdict: {
        contactSuggestion: insufficientField("证据不足"),
        recommendationReason: insufficientField("不生成通用理由"),
        keyCustomerSignals: [],
        priorityContactRole: insufficientField("待确认"),
        priorityOpportunity: insufficientField("不使用通用痛点"),
        recommendedNextStep: verifiedField("安排沟通", []),
      },
      contactIntelligence: {
        channels: [
          {
            kind: "email",
            label: "商务邮箱",
            value: "sales@example.com",
            status: "verified",
            sourceIds: ["source-0001"],
          },
        ],
        publicContacts: [],
      },
      customerIntelligence: {
        companyOverview: verifiedField("测试公司介绍", ["source-0001"]),
        productsAndServices: [],
        targetCustomersAndMarket: insufficientField("待整理"),
        businessModel: insufficientField("未明确"),
        productPositioning: insufficientField("未明确"),
        scaleAndCapability: insufficientField("待补充"),
        recentUpdates: [],
        informationGaps: [],
      },
      opportunityAnalysis: {
        opportunities: [],
        currentSolutionOrCompetition: insufficientField("待补充"),
        overallConfidence: insufficientField("未评估"),
      },
      conversationPlan: {
        recommendedContact: insufficientField("待确认"),
        communicationGoal: inferredField("验证机会", []),
        opening30s: verifiedField("30秒开场", ["source-0001"]),
        valueBridge: inferredField("价值", []),
        discoveryQuestions: [{ question: "问题一二", purpose: "验证假设" }, { question: "问题二三", purpose: "确认信息" }, { question: "问题三四", purpose: "推进后续" }],
        objectionResponses: [],
        proofMaterials: [],
        nextStep: verifiedField("安排沟通", []),
        avoidTopics: [],
      },
      coverage: { directChannels: 1, firecrawlChannels: 0, gapFilledCategories: [] },
      metrics: { durationMs: 1000, sourceCount: 1, officialSourceCount: 1, crawlerCalls: 1, llmCalls: 0 },
      sources: [{ id: "source-0001", url: "https://example.com", canonicalUrl: "https://example.com", title: "官网", content: "公开内容", sourceType: "official", fetchedAt: new Date().toISOString(), contentHash: "a".repeat(64) }],
      collectionNotes: [],
      mainReferenceLinks: [],
    };
    const parsed = SalesReportSchema.parse(report);
    expect(parsed.contactIntelligence?.channels).toHaveLength(1);
  });

  it("旧 Battlecard 可转换为新 SalesReport", () => {
    const legacy: import("@/lib/types").LegacyBattlecard = {
      overview: { text: "已采集 xx 的公开资料。", sourceIds: ["src-0001"] },
      signals: [],
      painHypotheses: [],
      talkTrack: {
        objective: "验证机会。",
        opening: { text: "开场话术", sourceIds: [] },
        discoveryQuestions: [{ question: "问题？", purpose: "确认" }, { question: "问题2？", purpose: "验证" }, { question: "问题3？", purpose: "推进" }],
        valueBridge: "价值",
        recommendedNextStep: "下一步",
        avoid: ["禁区"],
      },
      productMappings: [{ text: "匹配", sourceIds: ["src-0001"], sellerCapability: "能力", expectedValue: "价值" }],
      questions: [{ question: "问题？", purpose: "确认" }],
      opening: { text: "开场", sourceIds: [] },
      risks: [],
      companyOverview: { companyIntroduction: { text: "公司介绍", sourceIds: ["src-0001"] }, productsAndServices: [], recentUpdates: [] },
      companyAnalysis: { painHypotheses: [{ text: "待验证", sourceIds: ["src-0001"], businessImpact: "影响", confidenceLabel: "低", validationQuestion: "验证？" }] },
      salesStrategy: { entryPoints: [], recommendedNextStep: "下一步" },
      sources: [{ id: "src-0001", url: "https://example.com", canonicalUrl: "https://example.com", title: "官网", content: "内容", sourceType: "official", fetchedAt: new Date().toISOString(), contentHash: "a".repeat(64) }],
      collectionNotes: [],
    };
    const report = legacyBattlecardToReport(legacy, { targetUrl: "https://example.com", sellerProductName: "测试", collectedAt: new Date().toISOString() });
    expect(report.reportMeta.companyName).toBe("example.com");
    expect(report.salesVerdict.contactSuggestion.value).toContain("已采集");
    expect(report.customerIntelligence.companyOverview.value).toBe("公司介绍");
  });
});
