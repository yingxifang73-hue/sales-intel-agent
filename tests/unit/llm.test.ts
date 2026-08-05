import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSafeProductMatch,
  enhanceWithLlm,
  ensureConversationDepth,
  ensureDiscoveryOpportunity,
  ensureOpportunityDepth,
  extractSourceFactBundles,
} from "@/lib/llm";
import { SourceSchema, type SalesReport, type ResearchInput, type Source } from "@/lib/types";

const sourceId = "source-01";

function baseReport(): SalesReport {
  return {
    reportMeta: { companyName: "测试公司", targetUrl: "https://example.com", sellerProductName: "销售助手", collectedAt: new Date().toISOString(), status: "仅采集" },
    salesVerdict: {
      contactSuggestion: { value: "建议联系", status: "verified", sourceIds: [sourceId] },
      recommendationReason: { value: "有业务信号", status: "inferred", sourceIds: [sourceId] },
      keyCustomerSignals: [{ value: "扩产信号", status: "verified", sourceIds: [sourceId] }],
      priorityContactRole: { value: "采购经理", status: "inferred", sourceIds: [sourceId] },
      priorityOpportunity: { value: "待验证：供应链升级", status: "inferred", sourceIds: [sourceId] },
      recommendedNextStep: { value: "安排沟通", status: "verified", sourceIds: [] },
    },
    customerIntelligence: {
      companyOverview: { value: "测试公司是制造企业。", status: "verified", sourceIds: [sourceId] },
      productsAndServices: [{ value: "零部件制造", status: "verified", sourceIds: [sourceId] }],
      targetCustomersAndMarket: { value: "服务国内外品牌。", status: "verified", sourceIds: [sourceId] },
      businessModel: { value: "OEM 代工", status: "verified", sourceIds: [sourceId] },
      productPositioning: { value: "中高端定位", status: "verified", sourceIds: [sourceId] },
      scaleAndCapability: { value: "年产 500 万件", status: "verified", sourceIds: [sourceId] },
      recentUpdates: [{ value: "2026年7月：产线扩建", status: "verified", sourceIds: [sourceId] }],
      informationGaps: [],
    },
    opportunityAnalysis: {
      opportunities: [{
        signal: { value: "产线扩建", status: "verified", sourceIds: [sourceId] },
        painPoint: { value: "待验证：协同需求上升", status: "inferred", sourceIds: [sourceId] },
        businessImpact: { value: "可能影响交付效率", status: "inferred", sourceIds: [] },
        productMatch: { value: "我方协同工具可帮助同步", status: "inferred", sourceIds: [] },
        validationQuestion: { value: "目前协同最困难的环节？", status: "inferred", sourceIds: [] },
        confidence: { value: "中 — 基于明确扩产信号", status: "inferred", sourceIds: [] },
      }],
      currentSolutionOrCompetition: { value: "未找到明确方案", status: "insufficient", sourceIds: [] },
      overallConfidence: { value: "中", status: "inferred", sourceIds: [] },
    },
    conversationPlan: {
      recommendedContact: { value: "采购经理", status: "inferred", sourceIds: [sourceId] },
      communicationGoal: { value: "验证机会", status: "inferred", sourceIds: [] },
      opening30s: { value: "注意到贵司完成产线扩建……", status: "verified", sourceIds: [sourceId] },
      valueBridge: { value: "从扩建信号连接产品价值", status: "inferred", sourceIds: [sourceId] },
      discoveryQuestions: [
        { question: "问题一", purpose: "验证" },
        { question: "问题二", purpose: "确认" },
        { question: "问题三", purpose: "推进" },
      ],
      objectionResponses: [],
      proofMaterials: [],
      nextStep: { value: "安排需求交流", status: "verified", sourceIds: [] },
      avoidTopics: ["不能假设"],
    },
    coverage: { directChannels: 1, firecrawlChannels: 0, gapFilledCategories: [] },
    metrics: { durationMs: 1000, sourceCount: 1, officialSourceCount: 1, crawlerCalls: 1, llmCalls: 0 },
    sources: [{
      id: sourceId, url: "https://example.com", canonicalUrl: "https://example.com",
      title: "官网", content: "公开内容超过 100 字：包含公司、产品、服务、市场、产能等可核验信息。足以支撑调研。", sourceType: "official",
      fetchedAt: new Date().toISOString(), contentHash: "a".repeat(64),
    }],
    collectionNotes: [],
    mainReferenceLinks: [{ title: "官网", url: "https://example.com" }],
  };
}

const input: ResearchInput = {
  targetUrl: "https://example.com",
  preset: "general",
  sellerProfile: {
    productName: "销售助手",
    valueProposition: "帮助销售更快准备客户拜访",
    targetCustomer: "B2B 销售团队",
    customerProblems: ["售前准备耗时"],
    proofPoints: ["输出可追溯来源"],
    callToAction: "安排一次 20 分钟需求交流",
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function sseJson(value: unknown): Response {
  const payload = JSON.stringify(value);
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: payload } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("per-source extraction reliability", () => {
  it("processes every eligible source instead of truncating the fact stage to twelve sources", async () => {
    const sources: Source[] = Array.from({ length: 17 }, (_, index) => ({
      id: `official-${index}`,
      url: `https://example.com/page-${index}`,
      canonicalUrl: `https://example.com/page-${index}`,
      title: `官网业务页面 ${index}`,
      content: `测试公司在第${index}个公开页面介绍产品、服务、市场与业务能力。该页面包含可以用于客户画像的完整公司事实。`,
      sourceType: "official",
      fetchedAt: new Date().toISOString(),
      contentHash: String(index).padEnd(64, "a").slice(0, 64),
    }));
    const config = {
      OPENAI_API_KEY: undefined,
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: "gpt-test",
    } as import("@/lib/config").AppConfig;

    const result = await extractSourceFactBundles(config, input, sources);

    expect(result.bundles).toHaveLength(17);
    expect(new Set(result.bundles.map((bundle) => bundle.sourceId)).size).toBe(17);
  });

  it("extracts six sources in two smaller structured provider requests without dropping any source", async () => {
    const sources: Source[] = Array.from({ length: 6 }, (_, index) => ({
      id: `batch-source-${index}`,
      url: `https://example.com/products/page-${index}`,
      canonicalUrl: `https://example.com/products/page-${index}`,
      title: `产品能力 ${index}`,
      content: `测试公司第${index}项产品能力面向企业客户提供业务处理、统计分析和系统接口服务。`.repeat(5),
      sourceType: "official",
      fetchedAt: new Date().toISOString(),
      contentHash: String(index).padEnd(64, "b").slice(0, 64),
    }));
    const responsePayload = {
      bundles: sources.map((source, index) => ({
        sourceId: source.id,
        productsAndServices: [{
          value: `第${index}项产品提供企业级业务处理、统计分析和系统接口能力。`,
          status: "verified",
          sourceIds: [source.id],
        }],
      })),
    };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(sseJson(responsePayload)));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: "https://api.example.com",
      OPENAI_MODEL: "qwen-test",
      MODEL_REQUEST_TIMEOUT_MS: 5_000,
    } as import("@/lib/config").AppConfig;

    const result = await extractSourceFactBundles(config, input, sources);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.outcomes.facts).toBe("success");
    expect(result.bundles).toHaveLength(6);
    expect(new Set(result.bundles.map((bundle) => bundle.sourceId)).size).toBe(6);
  });

  it("retries a transient timeout and keeps the successful structured bundle", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
      .mockResolvedValueOnce(sseJson({
        companyOverview: {
          value: "SHOPLINE 是为商家提供建站、支付、营销与零售工具的一体化商业平台。",
          status: "verified",
          sourceIds: ["official-source"],
        },
        productsAndServices: [{
          value: "平台提供在线商店、支付、营销自动化和销售点管理能力。",
          status: "verified",
          sourceIds: ["official-source"],
        }],
        targetCustomersAndMarket: {
          value: "主要服务需要开展线上与线下零售业务的品牌和商家。",
          status: "verified",
          sourceIds: ["official-source"],
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const officialSource: Source = {
      id: "official-source",
      url: "https://www.shopline.com/about",
      canonicalUrl: "https://www.shopline.com/about",
      title: "About SHOPLINE",
      content: "SHOPLINE is a unified commerce platform for merchants. It provides online stores, payments, marketing automation, point-of-sale and customer management tools for brands selling across markets. ".repeat(5),
      sourceType: "official",
      fetchedAt: new Date().toISOString(),
      contentHash: "b".repeat(64),
    };
    const config = {
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: "https://api.example.com",
      OPENAI_MODEL: "qwen-test",
      MODEL_REQUEST_TIMEOUT_MS: 5_000,
    } as import("@/lib/config").AppConfig;

    const result = await extractSourceFactBundles(config, input, [officialSource]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.outcomes.facts).toBe("success");
    expect(result.rejected).toEqual([]);
    expect(result.bundles[0]?.companyOverview?.value).toContain("一体化商业平台");
  });

  it("repairs a malformed structured response once before falling back to deterministic facts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseJson("这不是可用的结构化结果"))
      .mockResolvedValueOnce(sseJson({
        companyOverview: { value: "示例企业提供面向品牌商家的数字化经营服务。", status: "verified", sourceIds: ["retry-source"] },
        productsAndServices: [{ value: "提供在线交易、营销自动化和客户运营工具。", status: "verified", sourceIds: ["retry-source"] }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    const source: Source = {
      id: "retry-source", url: "https://example.com/about", canonicalUrl: "https://example.com/about", title: "公司介绍",
      content: "示例企业提供面向品牌商家的数字化经营服务，并提供在线交易、营销自动化和客户运营工具。".repeat(4),
      sourceType: "official", fetchedAt: new Date().toISOString(), contentHash: "c".repeat(64),
    };
    const config = {
      OPENAI_API_KEY: "test-key", OPENAI_BASE_URL: "https://api.example.com", OPENAI_MODEL: "qwen-test", MODEL_REQUEST_TIMEOUT_MS: 5_000,
    } as import("@/lib/config").AppConfig;

    const result = await extractSourceFactBundles(config, input, [source]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.outcomes.facts).toBe("success");
    expect(result.bundles[0]?.companyOverview?.value).toContain("数字化经营服务");
  });
});

describe("enhanceWithLlm (无 API key 降级)", () => {
  it("无 API key 时直接返回仅采集中状态", async () => {
    const config = {
      OPENAI_API_KEY: undefined as string | undefined,
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: "gpt-4.1-mini",
    } as import("@/lib/config").AppConfig;
    const report = baseReport();
    const result = await enhanceWithLlm(report, input, report.sources, config);
    // 无 key 时保持原样，note 说明未配置
    expect(result.reportMeta.status).toBe("仅采集");
    expect(result.collectionNotes.some((n) => n.includes("未配置中文研究模型"))).toBe(true);
    expect(result.customerIntelligence.companyOverview.status).toBe("verified");
  });

  it("report 结构完整性不因 LLM 降级而变", async () => {
    const config = {
      OPENAI_API_KEY: undefined as string | undefined,
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: "gpt-4.1-mini",
    } as import("@/lib/config").AppConfig;
    const report = baseReport();
    const result = await enhanceWithLlm(report, input, report.sources, config);
    // 四个模块都存在
    expect(result.salesVerdict).toBeDefined();
    expect(result.customerIntelligence).toBeDefined();
    expect(result.opportunityAnalysis).toBeDefined();
    expect(result.conversationPlan).toBeDefined();
    // 底部链接保留
    expect(result.mainReferenceLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("报告生成边界会再次修复历史或缓存中的空来源标题", async () => {
    const config = {
      OPENAI_API_KEY: undefined as string | undefined,
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: "gpt-4.1-mini",
    } as import("@/lib/config").AppConfig;
    const report = baseReport();
    report.sources[0]!.title = "";

    const result = await enhanceWithLlm(report, input, report.sources, config);

    expect(result.sources[0]?.title).toBe("example.com 官网");
    expect(() => SourceSchema.parse(result.sources[0])).not.toThrow();
  });
});

describe("机会兜底", () => {
  it("没有直接机会时不再强制生成通用机会", () => {
    const report = baseReport();
    const result = ensureDiscoveryOpportunity(input, report.customerIntelligence, {
      ...report.opportunityAnalysis,
      opportunities: [],
    });

    expect(result.opportunities).toHaveLength(0);
  });

  it("话术兜底只引用清理后的完整事实句，不复制整段网页导航", () => {
    const report = baseReport();
    const navigation = "首页 关于我们 集团简介 董事长简介 企业荣誉 集团新闻 媒体报道 品牌专区 产品中心 投资者关系 人才招聘 联系我们";
    const fact = "测试公司成立于2010年，主要从事工业设备研发与制造。";
    report.customerIntelligence.recentUpdates = [{
      value: `${navigation} ${fact}`,
      status: "verified",
      sourceIds: [sourceId],
    }];

    const opportunity = ensureDiscoveryOpportunity(input, report.customerIntelligence, {
      ...report.opportunityAnalysis,
      opportunities: [],
    });
    const conversation = ensureConversationDepth(
      input,
      report.customerIntelligence,
      opportunity,
      {
        ...report.conversationPlan,
        opening30s: { status: "insufficient", sourceIds: [] },
      },
    );

    expect(opportunity.opportunities).toHaveLength(0);
    expect(conversation.opening30s.value).toContain(fact);
    expect(conversation.opening30s.value).not.toContain("人才招聘");
  });

  it("does not turn generic company context into two fabricated opportunities", () => {
    const report = baseReport();
    const result = ensureOpportunityDepth(input, report.customerIntelligence, {
      ...report.opportunityAnalysis,
      opportunities: [],
    });

    expect(result.opportunities).toHaveLength(0);
  });

  it("fills a complete first-conversation plan when a model stage degrades", () => {
    const report = baseReport();
    const result = ensureConversationDepth(
      input,
      report.customerIntelligence,
      ensureOpportunityDepth(input, report.customerIntelligence, { ...report.opportunityAnalysis, opportunities: [] }),
      {
        ...report.conversationPlan,
        recommendedContact: { status: "insufficient", sourceIds: [] },
        communicationGoal: { status: "insufficient", sourceIds: [] },
        opening30s: { status: "insufficient", sourceIds: [] },
        valueBridge: { status: "insufficient", sourceIds: [] },
        discoveryQuestions: [],
        objectionResponses: [],
        nextStep: { status: "insufficient", sourceIds: [] },
      },
    );

    expect(result.opening30s.value).toContain(input.sellerProfile.productName);
    expect(result.opening30s.value?.length).toBeGreaterThan(60);
    expect(result.discoveryQuestions.length).toBeGreaterThanOrEqual(3);
    expect(result.objectionResponses.length).toBeGreaterThanOrEqual(1);
    expect(result.nextStep.value?.length).toBeGreaterThan(24);
  });
});

describe("模型阶段超时降级", () => {
  it("facts 阶段全部超时且报告已有客户画像时降级为 partial 而非 failed", async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: "https://api.example.com",
      OPENAI_MODEL: "qwen-test",
      MODEL_REQUEST_TIMEOUT_MS: 5_000,
    } as import("@/lib/config").AppConfig;
    const report = baseReport(); // 已有完整 customerIntelligence

    const result = await enhanceWithLlm(report, input, report.sources, config, undefined, {
      stages: ["facts", "quality_review"],
    });

    expect(result.qualityAudit?.stageOutcomes.facts).toBe("partial");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("opportunity 阶段全部超时且报告已有机会时降级为 partial 而非 failed", async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: "https://api.example.com",
      OPENAI_MODEL: "qwen-test",
      MODEL_REQUEST_TIMEOUT_MS: 5_000,
    } as import("@/lib/config").AppConfig;
    const report = baseReport(); // 已有 1 条 opportunity

    const result = await enhanceWithLlm(report, input, report.sources, config, undefined, {
      stages: ["opportunity", "quality_review"],
    });

    expect(result.qualityAudit?.stageOutcomes.opportunity).toBe("partial");
  });
});

describe("产品名称驱动的匹配分析", () => {
  it("将汽车业务与车规离线语音芯片形成明确但非事实性的匹配判断", () => {
    const result = buildSafeProductMatch(
      { ...input, customIndustry: "新能源汽车制造", sellerProfile: { ...input.sellerProfile, productName: "车规级离线 AI 语音算力芯片" } },
      "目标公司主营新能源汽车与乘用车业务。",
      [sourceId],
    );
    expect(result.status).toBe("inferred");
    expect(result.value).toContain("智能座舱离线语音交互");
    expect(result.sourceIds).toEqual([sourceId]);
  });
});
