import { describe, expect, it } from "vitest";
import { getConfig, requireResearchConfig } from "@/lib/config";
import { PRESETS } from "@/lib/presets";
import { ResearchInputSchema } from "@/lib/types";

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
});
