import { describe, expect, it } from "vitest";
import {
  normalizeSalesReport,
  fieldStatusLabel,
} from "@/lib/report-viewmodel";
import {
  insufficientField,
  inferredField,
  verifiedField,
  type SalesReport,
} from "@/lib/types";

function buildFullReport(): SalesReport {
  const baseSource = {
    id: "src-0001",
    url: "https://example.com",
    canonicalUrl: "https://example.com",
    title: "官网",
    content: "公司介绍内容文本。该公司的产品线覆盖多个业务领域。",
    sourceType: "official" as const,
    fetchedAt: new Date().toISOString(),
    contentHash: "a".repeat(64),
  };

  return {
    reportMeta: {
      companyName: "测试公司",
      targetUrl: "https://example.com",
      sellerProductName: "测试产品",
      collectedAt: new Date().toISOString(),
      status: "达标",
    },
    salesVerdict: {
      contactSuggestion: inferredField("建议联系：已发现公开信号", ["src-0001"]),
      recommendationReason: inferredField("客户近期有新品发布", ["src-0001"]),
      keyCustomerSignals: [
        { value: "2025年新工厂投产", status: "verified", sourceIds: ["src-0001"] },
        { value: "线上渠道增长50%", status: "inferred", sourceIds: ["src-0001"] },
        { value: "招聘采购经理", status: "verified", sourceIds: ["src-0001"] },
      ],
      priorityContactRole: inferredField("建议优先联系采购负责人", ["src-0001"]),
      priorityOpportunity: inferredField("新工厂需要供应商", ["src-0001"]),
      recommendedNextStep: verifiedField("安排沟通", ["src-0001"]),
    },
    contactIntelligence: {
      channels: [
        {
          kind: "email",
          label: "商务邮箱",
          value: "sales@example.com",
          status: "verified",
          sourceIds: ["src-0001"],
        },
      ],
      publicContacts: [],
    },
    customerIntelligence: {
      companyOverview: verifiedField("该公司成立于2020年，主营...", ["src-0001"]),
      productsAndServices: [
        { value: "产品A - 主粮产品", status: "verified", sourceIds: ["src-0001"] },
        { value: "产品B - 零食产品", status: "verified", sourceIds: ["src-0001"] },
        { value: "产品C - 罐头产品", status: "inferred", sourceIds: ["src-0001"] },
        { value: "产品D", status: "verified", sourceIds: ["src-0001"] },
        { value: "产品E", status: "verified", sourceIds: ["src-0001"] },
        { value: "产品F", status: "verified", sourceIds: ["src-0001"] },
        { value: "产品G", status: "inferred", sourceIds: ["src-0001"] },
        { value: "产品H", status: "verified", sourceIds: ["src-0001"] },
      ],
      targetCustomersAndMarket: verifiedField("宠物食品市场", ["src-0001"]),
      businessModel: inferredField("B2C + B2B", ["src-0001"]),
      productPositioning: verifiedField("中高端定位", ["src-0001"]),
      scaleAndCapability: verifiedField("1000+员工", ["src-0001"]),
      recentUpdates: [
        { value: "2025年Q3新品发布", status: "verified", sourceIds: ["src-0001"] },
        { value: "线下渠道扩张", status: "verified", sourceIds: ["src-0001"] },
      ],
      informationGaps: ["缺少配料表", "缺少采购量"],
    },
    opportunityAnalysis: {
      opportunities: [
        {
          signal: { value: "新工厂投产", status: "verified", sourceIds: ["src-0001"] },
          painPoint: { value: "待验证：新产线需要原料供应", status: "inferred", sourceIds: ["src-0001"] },
          businessImpact: { value: "可能影响生产效率", status: "inferred", sourceIds: [] },
          productMatch: { value: "我方产品匹配新产线需求", status: "inferred", sourceIds: [] },
          validationQuestion: { value: "新工厂原料由谁采购？", status: "inferred", sourceIds: [] },
          confidence: { value: "中 — 基于公开新闻推断", status: "inferred", sourceIds: [] },
        },
        {
          signal: { value: "线上增长50%", status: "verified", sourceIds: ["src-0001"] },
          painPoint: { value: "待验证：扩产需要稳定供应商", status: "inferred", sourceIds: ["src-0001"] },
          businessImpact: { value: "供货量可能增加", status: "inferred", sourceIds: [] },
          productMatch: { value: "我方可批量供应", status: "inferred", sourceIds: [] },
          validationQuestion: { value: "当前采购量和周期？", status: "inferred", sourceIds: [] },
          confidence: { value: "低 — 信息不足", status: "inferred", sourceIds: [] },
        },
      ],
      currentSolutionOrCompetition: insufficientField("未获取竞争信息"),
      overallConfidence: inferredField("中 — 2条信号但缺少直接证据", []),
    },
    conversationPlan: {
      recommendedContact: inferredField("采购总监 或 供应链负责人", ["src-0001"]),
      communicationGoal: inferredField("验证新工厂原料需求", []),
      opening30s: verifiedField("您好，注意到贵司近期有新工厂投产...", ["src-0001"]),
      valueBridge: inferredField("我方可配合新工厂的原料需求", ["src-0001"]),
      discoveryQuestions: [
        { question: "新工厂主要生产什么产品？", purpose: "确认产品适用范围" },
        { question: "原料采购由哪个部门负责？", purpose: "确认决策链" },
        { question: "对供应商有何要求？", purpose: "确认准入标准" },
        { question: "当前采购量大约多少？", purpose: "确认需求规模" },
        { question: "是否考虑新供应商？", purpose: "确认机会" },
        { question: "生产周期怎样？", purpose: "确认供货节奏" },
      ],
      objectionResponses: [
        { value: "已有稳定供应商 — 回应：理解，我们可提供比较报价", status: "inferred", sourceIds: [] },
        { value: "暂无需求 — 回应：先建立联系，等有需求时再沟通", status: "inferred", sourceIds: [] },
      ],
      proofMaterials: ["检测报告", "产地证明"],
      nextStep: verifiedField("给采购负责人发简短介绍", []),
      avoidTopics: ["不要提及价格战", "不要评论竞品"],
    },
    qualityAudit: {
      directSourceCount: 2,
      firecrawlBaseSourceCount: 3,
      firecrawlGapSourceCount: 1,
      evidencePerCategory: {},
      filteredSources: [
        { url: "https://bad.example.com/noise", reason: "low_value_page" },
        { url: "https://bad.example.com/tiny", reason: "content_too_small" },
      ],
      fieldStatuses: {
        "ci.companyOverview": "verified",
        "oa.opp[0].signal": "verified",
      },
      stageOutcomes: { facts: "success", opportunity: "success", conversation: "success" },
      rejectedFields: [],
      minimumStandardMet: true,
      missingFields: [],
    },
    coverage: {
      directChannels: 2,
      firecrawlChannels: 3,
      gapFilledCategories: ["news"],
    },
    metrics: {
      durationMs: 35000,
      sourceCount: 5,
      officialSourceCount: 3,
      crawlerCalls: 2,
      llmCalls: 3,
    },
    sources: [
      baseSource,
      {
        ...baseSource,
        id: "src-0002",
        url: "https://example.com/news",
        title: "新闻",
        content: "近期新闻内容。".repeat(50),
        sourceType: "news",
        contentHash: "b".repeat(64),
      },
      {
        ...baseSource,
        id: "src-0003",
        url: "https://other.com",
        title: "第三方报道",
        content: "第三方来源内容。",
        sourceType: "social",
        contentHash: "c".repeat(64),
      },
    ],
    collectionNotes: [
      "Firecrawl 已补充官网可读内容和公开网页信号。",
      "模型三阶段整理完成（事实/机会/沟通），状态：达标。",
    ],
    mainReferenceLinks: [
      { title: "官网", url: "https://example.com" },
      { title: "新闻", url: "https://example.com/news" },
    ],
  };
}

describe("ReportViewModel — 字段标准化", () => {
  const report = buildFullReport();
  const vm = normalizeSalesReport(report);

  it("保留原始报告", () => {
    expect(vm.rawReport).toBe(report);
  });

  it("正确传递元数据", () => {
    expect(vm.companyName).toBe("测试公司");
    expect(vm.targetUrl).toBe("https://example.com");
    expect(vm.sellerProductName).toBe("测试产品");
    expect(vm.reportStatus).toBe("达标");
  });

  it("verdict 指标完整", () => {
    const v = vm.verdict;
    expect(v.contactSuggestion.status).toBe("inferred");
    expect(v.recommendationReason.status).toBe("inferred");
    expect(v.keyCustomerSignals).toHaveLength(3);
    expect(v.priorityContactRole.status).toBe("inferred");
    expect(v.priorityOpportunity.status).toBe("inferred");
    expect(["A", "B", "C", "D"]).toContain(v.suggestedGrade);
  });

  it("intelligence 指标完整", () => {
    const i = vm.intelligence;
    expect(i.companyOverview.status).toBe("verified");
    expect(i.productsAndServices).toHaveLength(8);
    expect(i.businessModel.status).toBe("inferred");
    expect(i.recentUpdates).toHaveLength(2);
    expect(i.informationGaps).toHaveLength(2);
  });

  it("联系方式完整映射且不虚构联系人", () => {
    expect(vm.contacts.channels.find((item) => item.kind === "email")?.value).toBe("sales@example.com");
    expect(vm.contacts.publicContacts).toHaveLength(0);
  });

  it("opportunity 指标完整 — 不丢数组", () => {
    const o = vm.opportunity;
    expect(o.opportunities).toHaveLength(2);
    expect(o.allOpportunityCount).toBe(2);
    expect(o.opportunities[0]!.signal.status).toBe("verified");
    expect(o.opportunities[0]!.painPoint.status).toBe("inferred");
    expect(o.opportunities[0]!.confidence.status).toBe("inferred");
  });

  it("conversation 指标完整 — 包含所有话术", () => {
    const c = vm.conversation;
    expect(c.opening30s.status).toBe("verified");
    expect(c.valueBridge.status).toBe("inferred");
    expect(c.discoveryQuestions).toHaveLength(6);
    expect(c.objectionResponses).toHaveLength(2);
    expect(c.proofMaterials).toHaveLength(2);
    expect(c.avoidTopics).toHaveLength(2);
    expect(c.nextStep.status).toBe("verified");
  });

  it("evidence 指标完整", () => {
    const e = vm.evidence;
    expect(e.sources).toHaveLength(3);
    expect(e.mainReferenceLinks).toHaveLength(2);
    expect(e.evidenceClaims.length).toBeGreaterThan(0);
    expect(e.collectionNotes).toHaveLength(2);
    expect(e.supplementalNotes).toEqual([]);
  });

  it("quality 统计数据正确", () => {
    const q = vm.quality;
    expect(q.totalSources).toBe(3);
    expect(q.validSources).toBeGreaterThanOrEqual(2);
    expect(q.excludedSources).toBe(2);
    expect(q.failedSources).toHaveLength(2);
    expect(q.totalReportFields).toBeGreaterThan(0);
    expect(q.valuedFieldCount).toBeGreaterThan(0);
    expect(q.unmappedFields).toEqual([]);
  });

  it("字段状态标签正确映射", () => {
    expect(fieldStatusLabel("verified")).toBe("已核验");
    expect(fieldStatusLabel("inferred")).toBe("");
    expect(fieldStatusLabel("insufficient")).toBe("");
    expect(fieldStatusLabel("conflicting")).toBe("风险提醒");
  });

  it("数组内容不丢失 — 产品与服务 8 条全保留", () => {
    expect(vm.intelligence.productsAndServices).toHaveLength(8);
  });

  it("数组内容不丢失 — 发现型问题 6 条全保留", () => {
    expect(vm.conversation.discoveryQuestions).toHaveLength(6);
  });
});

describe("ReportViewModel — 空值兜底", () => {
  it("空报告不会崩溃", () => {
    const empty: SalesReport = {
      reportMeta: {
        companyName: "空",
        targetUrl: "https://empty.com",
        sellerProductName: "空",
        collectedAt: new Date().toISOString(),
        status: "未达标",
      },
      salesVerdict: {
        contactSuggestion: insufficientField("不足"),
        recommendationReason: insufficientField("不足"),
        keyCustomerSignals: [],
        priorityContactRole: insufficientField("不足"),
        priorityOpportunity: insufficientField("不足"),
        recommendedNextStep: insufficientField("不足"),
      },
      customerIntelligence: {
        companyOverview: insufficientField("不足"),
        productsAndServices: [],
        targetCustomersAndMarket: insufficientField("不足"),
        businessModel: insufficientField("不足"),
        productPositioning: insufficientField("不足"),
        scaleAndCapability: insufficientField("不足"),
        recentUpdates: [],
        informationGaps: [],
      },
      opportunityAnalysis: {
        opportunities: [],
        currentSolutionOrCompetition: insufficientField("不足"),
        overallConfidence: insufficientField("不足"),
      },
      conversationPlan: {
        recommendedContact: insufficientField("不足"),
        communicationGoal: insufficientField("不足"),
        opening30s: insufficientField("不足"),
        valueBridge: insufficientField("不足"),
        discoveryQuestions: [],
        objectionResponses: [],
        proofMaterials: [],
        nextStep: insufficientField("不足"),
        avoidTopics: [],
      },
      coverage: { directChannels: 0, firecrawlChannels: 0, gapFilledCategories: [] },
      metrics: { durationMs: 0, sourceCount: 0, officialSourceCount: 0, crawlerCalls: 0, llmCalls: 0 },
      sources: [],
      collectionNotes: [],
      mainReferenceLinks: [],
    };
    const vm = normalizeSalesReport(empty);
    expect(vm.verdict.suggestedGrade).toBe("D");
    expect(vm.quality.totalReportFields).toBeGreaterThanOrEqual(0);
  });
});

describe("ReportViewModel — 长内容不截断", () => {
  it("长文本字段 value 完整保留", () => {
    const longText = "这是一段很长的公司介绍文本内容，包含了关于公司的详细描述和业务信息。".repeat(20);
    const report = buildFullReport();
    report.customerIntelligence.companyOverview = verifiedField(longText, ["src-0001"]);

    const vm = normalizeSalesReport(report);
    expect(vm.intelligence.companyOverview.value).toBe(longText);
    expect(vm.intelligence.companyOverview.value.length).toBe(longText.length);
  });
});

describe("ReportViewModel — 历史报告异常内容兜底", () => {
  it("清除脚本载荷和公开资料模板前缀，只保留有效事实", () => {
    const report = buildFullReport();
    const fact = "小鹏汽车成立于2014年，专注智能电动汽车研发与制造。";
    report.customerIntelligence.companyOverview = verifiedField(
      `目标公司公开资料显示：${fact}\n{"1":"var arg1='5d4473171c07296d118a3c85d3e54a3e148818eb4cb9d05698';"}\n${"AbCdEf0123456789+/".repeat(20)}`,
      ["src-0001"],
    );

    const vm = normalizeSalesReport(report);

    expect(vm.intelligence.companyOverview.value).toBe(fact);
  });

  it("隐藏纯标点条目和未翻译的英文网页长文，保留中文与短品牌名", () => {
    const report = buildFullReport();
    report.customerIntelligence.productsAndServices = [
      { value: "“；", status: "verified", sourceIds: ["src-0001"] },
      {
        value: "Asia Global Variety Plus Icon Click to expand the Mega Plus Icon Click to Expand Input Variety",
        status: "verified",
        sourceIds: ["src-0001"],
      },
      { value: "Character.AI", status: "verified", sourceIds: ["src-0001"] },
      { value: "公司提供面向企业客户的智能对话产品与服务。", status: "verified", sourceIds: ["src-0001"] },
    ];

    const vm = normalizeSalesReport(report);

    expect(vm.intelligence.productsAndServices.map((item) => item.value)).toEqual([
      "Character.AI",
      "公司提供面向企业客户的智能对话产品与服务。",
    ]);
  });
});
