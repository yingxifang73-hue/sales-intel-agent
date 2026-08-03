import { describe, expect, it } from "vitest";
import { checkBanRules, checkMinimum } from "@/lib/quality-gate";
import { normalizeSalesReportNarrative } from "@/lib/report-text";
import type { SalesReport } from "@/lib/types";

const sourceId = "quality-source";
const field = (value: string, status: "verified" | "inferred" = "verified") => ({
  value,
  status,
  sourceIds: [sourceId],
});
const item = (value: string, status: "verified" | "inferred" = "verified") => ({
  value,
  status,
  sourceIds: [sourceId],
});

function opportunity(index: number) {
  return {
    signal: item(`目标公司正在持续建设第${index}类数字化商业能力，并服务多渠道经营场景。`),
    painPoint: item(`在第${index}类业务扩展过程中，内容生产效率、投放一致性和跨渠道协同可能成为需要验证的运营约束。`, "inferred" as const),
    businessImpact: field("如果素材生产和投放验证周期较长，可能影响营销活动上线速度、测试成本和渠道转化效率。", "inferred" as const),
    productMatch: field("我方产品可围绕自动生成多版本投放素材、品牌规范控制和效果反馈闭环进行场景匹配。", "inferred" as const),
    validationQuestion: field("目前从活动策划到多渠道素材上线通常需要多久，最耗时的审核或修改环节是什么？", "inferred" as const),
    confidence: field("中等：存在公开业务场景支撑，但具体流程、预算和采购计划仍需首次沟通确认。", "inferred" as const),
  };
}

function completeReport(): SalesReport {
  const now = new Date().toISOString();
  return {
    reportMeta: {
      companyName: "示例商业科技有限公司",
      targetUrl: "https://example.com",
      sellerProductName: "AI 智能投放素材生成引擎",
      collectedAt: now,
      status: "达标",
    },
    salesVerdict: {
      contactSuggestion: field("建议联系数字营销、增长运营或电商平台负责人，先确认素材生产流程和渠道投放计划。", "inferred"),
      recommendationReason: field("目标公司具有多渠道商业平台和营销能力建设场景，可围绕素材规模化生产与效果迭代开展发现式沟通。", "inferred"),
      keyCustomerSignals: [item("公司公开介绍显示其为品牌和商家提供线上商店、营销、支付及线下零售能力。")],
      priorityContactRole: field("数字营销、增长运营或电商平台负责人。", "inferred"),
      priorityOpportunity: field("优先验证多渠道营销素材生产、审核和效果迭代环节的效率目标。", "inferred"),
      recommendedNextStep: field("安排一次三十分钟需求访谈，确认现有流程、渠道数量、内容产能与试点范围。", "inferred"),
    },
    customerIntelligence: {
      companyOverview: field("示例商业科技有限公司是一家面向全球品牌与商家的统一商业平台，提供线上线下一体化经营工具与数字化服务。"),
      productsAndServices: [
        item("提供独立站建设、商品与订单管理、支付和会员运营能力。"),
        item("提供营销自动化、社交渠道经营和线下销售点管理工具。"),
      ],
      targetCustomersAndMarket: field("主要服务需要开展多渠道零售、跨境电商和品牌数字化经营的企业客户与成长型商家。"),
      businessModel: field("通过软件订阅、支付与增值服务为商家提供持续运营能力，并围绕交易和生态服务形成收入。"),
      productPositioning: field("定位为连接线上商店、社交渠道和实体零售的一体化商业基础设施。"),
      scaleAndCapability: field("其业务覆盖多个国家和市场，并具备产品研发、支付、营销及零售系统交付能力。"),
      recentUpdates: [item("2026年7月，公司发布营销自动化和多渠道经营功能更新，并扩展合作伙伴生态。")],
      informationGaps: [],
    },
    opportunityAnalysis: {
      opportunities: [opportunity(1), opportunity(2)],
      currentSolutionOrCompetition: field("目标公司已有营销工具体系，但具体素材生产工具、供应商与自研边界尚未公开。", "inferred"),
      overallConfidence: field("中等：业务场景和产品方向相关，但真实痛点、技术接口、预算和采购时间需要沟通确认。", "inferred"),
    },
    conversationPlan: {
      recommendedContact: field("优先联系数字营销、增长运营、电商产品或营销技术负责人。", "inferred"),
      communicationGoal: field("确认目标公司的素材生产规模、渠道协同流程、审核约束和效果反馈方式，判断是否适合小范围试点。", "inferred"),
      opening30s: field("我们关注到贵公司正在持续完善多渠道商业与营销能力。我们提供 AI 智能投放素材生成引擎，希望先了解目前不同渠道素材从策划、制作到审核上线的流程，看是否有适合验证效率和一致性的试点场景。", "inferred"),
      valueBridge: field("如果当前团队需要为多个渠道持续制作不同规格和语言的素材，我方能力可用于生成初稿、控制品牌规范并缩短测试迭代周期。", "inferred"),
      discoveryQuestions: [
        { question: "目前主要投放哪些渠道，每月大约需要制作多少套素材？", purpose: "确认内容规模和优先渠道。" },
        { question: "从需求提出到素材审核上线，哪个环节最耗时？", purpose: "识别流程瓶颈和协作成本。" },
        { question: "团队如何评价不同素材版本的表现并反馈到下一轮制作？", purpose: "确认效果闭环和系统集成机会。" },
      ],
      objectionResponses: [item("如客户担心生成质量，建议从单一渠道和少量商品开始试点，并由现有审核流程把关。", "inferred")],
      proofMaterials: [],
      nextStep: field("由双方产品与营销负责人确定一个渠道、一个活动和一组评价指标，安排试点需求评审。", "inferred"),
      avoidTopics: ["不声称目标公司已经存在采购计划或既有工具效果不佳。"],
    },
    contactIntelligence: { channels: [], publicContacts: [] },
    qualityAudit: {
      directSourceCount: 1,
      firecrawlBaseSourceCount: 1,
      firecrawlGapSourceCount: 0,
      evidencePerCategory: {},
      filteredSources: [],
      fieldStatuses: {},
      stageOutcomes: { facts: "partial", opportunity: "partial", conversation: "partial" },
      rejectedFields: [],
      minimumStandardMet: true,
      missingFields: [],
    },
    coverage: { directChannels: 1, firecrawlChannels: 1, gapFilledCategories: [] },
    metrics: { durationMs: 1, sourceCount: 1, officialSourceCount: 1, crawlerCalls: 1, llmCalls: 3 },
    sources: [{
      id: sourceId,
      url: "https://example.com/news/product-update",
      canonicalUrl: "https://example.com/news/product-update",
      title: "示例公司产品更新公告",
      content: "示例公司公开介绍、产品服务、目标市场、经营模式、能力与近期动态正文。".repeat(10),
      sourceType: "official",
      fetchedAt: now,
      publishedAt: now,
      contentHash: "c".repeat(64),
    }],
    collectionNotes: [],
    mainReferenceLinks: [{ title: "示例公司官网", url: "https://example.com" }],
  };
}

describe("report minimum quality", () => {
  it("accepts a complete structured report with partial-but-usable recovery stages", () => {
    expect(checkMinimum(completeReport())).toEqual({ passed: true, missing: [] });
  });

  it("does not reject normal Chinese punctuation after a closing quotation mark", () => {
    const report = completeReport();
    report.conversationPlan.opening30s = field(
      "我们关注到贵司已发布“智能营销平台”。希望进一步了解该平台目前覆盖的业务流程、评价指标和系统接口。",
      "inferred",
    );

    expect(checkBanRules(report)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "no_malformed_punctuation" }),
    ]));
  });

  it("normalizes malformed punctuation across every generated narrative before audit", () => {
    const report = completeReport();
    report.salesVerdict.recommendationReason.value = "目标公司已发布新品。。";
    report.customerIntelligence.companyOverview.value = "公开资料提到“公司已发布新品。”。";
    report.opportunityAnalysis.opportunities[0]!.productMatch.value = "可先验证接口兼容性。。";
    report.conversationPlan.valueBridge.value = "帮助团队提升效率。。";

    const normalized = normalizeSalesReportNarrative(report);

    expect(normalized.salesVerdict.recommendationReason.value).toBe("目标公司已发布新品。");
    expect(normalized.customerIntelligence.companyOverview.value).toBe("公开资料提到“公司已发布新品。”");
    expect(normalized.opportunityAnalysis.opportunities[0]!.productMatch.value).toBe("可先验证接口兼容性。");
    expect(normalized.conversationPlan.valueBridge.value).toBe("帮助团队提升效率。");
    expect(checkBanRules(normalized)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "no_malformed_punctuation" }),
    ]));
  });

  it("rejects thin core chapters and placeholder contamination", () => {
    const report = completeReport();
    report.customerIntelligence.companyOverview = field("公司是一家企业。");
    report.customerIntelligence.productsAndServices[0] = item("[搜索摘要] 公司产品很多...");
    report.opportunityAnalysis.opportunities = report.opportunityAnalysis.opportunities.slice(0, 1);
    report.conversationPlan.discoveryQuestions = report.conversationPlan.discoveryQuestions.slice(0, 2);

    const result = checkMinimum(report);

    expect(result.passed).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining([
      "公司概况内容过少",
      "产品与服务内容质量不足",
      "首次沟通发现问题少于3条",
    ]));
  });

  it("rejects reports that reuse the same navigation-heavy page text across core fields", () => {
    const report = completeReport();
    const navigationBlob = `${"首页 关于我们 集团简介 董事长简介 企业荣誉 集团新闻 媒体报道 品牌专区 产品中心 投资者关系 人才招聘 联系我们 ".repeat(3)}温氏食品集团股份有限公司创立于1983年，是一家现代农牧企业集团。`;
    report.customerIntelligence.companyOverview = field(navigationBlob);
    report.customerIntelligence.productsAndServices = [item(navigationBlob), item(navigationBlob)];
    report.salesVerdict.keyCustomerSignals = [item(navigationBlob)];

    expect(checkBanRules(report)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "no_navigation_boilerplate" }),
      expect.objectContaining({ rule: "no_cross_field_duplicate" }),
    ]));
  });

  it("rejects script payloads and generic public-material lead-ins", () => {
    const report = completeReport();
    report.customerIntelligence.companyOverview = field(
      `目标公司公开资料显示：公司持续建设数字化能力。\n{"1":"var arg1='5d4473171c07296d118a3c85d3e54a3e148818eb4cb9d05698';"}\n${"AbCdEf0123456789+/".repeat(20)}`,
    );

    expect(checkBanRules(report)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "no_placeholder_or_search_summary" }),
      expect.objectContaining({ rule: "no_script_or_encoded_payload" }),
    ]));
  });

  it("rejects generic opportunity fallback and untranslated crawler text", () => {
    const report = completeReport();
    report.salesVerdict.priorityOpportunity = field("当前公开信息不足以做出明确机会判断，建议首次沟通重点探索客户当前痛点和采购计划。", "inferred");
    report.conversationPlan.opening30s = field("Click to expand the latest news menu", "inferred");

    const violations = checkBanRules(report);
    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "no_generic_opportunity_fallback" }),
      expect.objectContaining({ rule: "no_untranslated_english_noise" }),
    ]));
  });

  it("rejects cross-industry fallback text in a software SDK report", () => {
    const report = completeReport();
    report.reportMeta.sellerProductName = "会议录音批量转写 Token 计费统计 SDK";
    report.conversationPlan.valueBridge = field(
      "需要先核对目标公司的现有设备、包材规格和认证要求，再安排样品及小批量测试。",
      "inferred",
    );
    report.conversationPlan.objectionResponses = [
      item("如客户关注食品安全，应优先提供检测报告。", "inferred"),
    ];

    expect(checkBanRules(report)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "no_cross_industry_template" }),
    ]));
    expect(checkMinimum(report).passed).toBe(false);
  });

  it("rejects a direct-contact recommendation that contradicts a self-built competing solution", () => {
    const report = completeReport();
    report.reportMeta.sellerProductName = "会议录音批量转写 Token 计费统计 SDK";
    report.opportunityAnalysis.currentSolutionOrCompetition = field(
      "目标公司已经自研语音转写、会议纪要和调用量计费体系。",
      "verified",
    );
    report.salesVerdict.contactSuggestion = field(
      "建议直接联系并推销会议录音批量转写 Token 计费统计 SDK。",
      "inferred",
    );
    report.salesVerdict.recommendationReason = field(
      "目标公司具有语音业务，因此存在采购需求。",
      "inferred",
    );

    expect(checkBanRules(report)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "no_self_built_fit_contradiction" }),
    ]));
  });

  it("does not count a static platform description as a recent update", () => {
    const report = completeReport();
    report.customerIntelligence.recentUpdates = [
      item("公司成立于2010年，目前提供多项平台能力并服务开发者。"),
    ];
    report.sources[0] = {
      ...report.sources[0]!,
      url: "https://example.com",
      canonicalUrl: "https://example.com",
      title: "示例公司官网",
      publishedAt: undefined,
    };

    const result = checkMinimum(report);

    expect(result.passed).toBe(false);
    expect(result.missing).toContain("近期动态缺少日期或新闻来源");
  });
});
