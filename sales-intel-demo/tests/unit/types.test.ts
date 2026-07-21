import { describe, expect, it } from "vitest";
import { getConfig, requireResearchConfig } from "@/lib/config";
import { PRESETS } from "@/lib/presets";
import { CompanyAnalysisSchema, CompanyOverviewSchema, ResearchInputSchema, SalesStrategySchema } from "@/lib/types";

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

  it("拒绝缺少关键卖方信息的输入", () => {
    expect(() => ResearchInputSchema.parse({ ...validInput, sellerProfile: { ...validInput.sellerProfile, proofPoints: [] } })).toThrow();
  });

  it("在读取配置时给出默认值，在真正研究前检查密钥", () => {
    const config = getConfig({});
    expect(config.OPENAI_MODEL).toBe("gpt-4.1-mini");
    expect(() => requireResearchConfig(config)).toThrow("研究服务尚未配置");
  });

  it("定义完整的售前调研报告章节", () => {
    const cited = { text: "公开官网资料显示企业持续拓展海外服务网络。", sourceIds: ["source-01"] };
    expect(CompanyOverviewSchema.parse({ companyIntroduction: cited, productsAndServices: [cited], industryAndCoverage: cited, recentUpdates: [cited] }).recentUpdates).toHaveLength(1);
    expect(CompanyAnalysisSchema.parse({ businessModel: cited, productPositioning: cited, targetCustomers: cited, competitionObservation: cited, painHypotheses: [{ ...cited, businessImpact: "可能影响服务响应效率。", confidenceLabel: "低", validationQuestion: "当前最难协调的服务环节是什么？" }] }).painHypotheses).toHaveLength(1);
    expect(SalesStrategySchema.parse({ entryPoints: [cited], recommendation: cited, opening: cited, potentialNeeds: [cited], discoveryQuestions: [{ question: "当前最难协同的环节是什么？", purpose: "验证公开信号。" }, { question: "会影响哪些客户体验？", purpose: "量化影响。" }, { question: "谁参与下一步评估？", purpose: "明确决策。" }], recommendedNextStep: "安排一次小范围需求澄清。", avoid: ["不要将公开推断当作已确认事实。"] }).discoveryQuestions).toHaveLength(3);
  });
});
