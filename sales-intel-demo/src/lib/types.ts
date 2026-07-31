import { z } from "zod";

export const PresetSchema = z.enum([
  "general",
  "ecommerce",
  "foreign_trade",
  "ai",
  "manufacturing",
]);

export type Preset = z.infer<typeof PresetSchema>;

/** 默认 CTA，与 page.tsx 一致 */
export const DEFAULT_CALL_TO_ACTION = "安排一次初步沟通，验证客户需求与产品匹配度。";

export const SellerProfileSchema = z.object({
  productName: z.string().trim().min(1).max(80),
  valueProposition: z.string().trim().max(300).default(""),
  targetCustomer: z.string().trim().max(160).default(""),
  customerProblems: z.array(z.string().trim().max(160)).max(5).default([]),
  proofPoints: z.array(z.string().trim().max(200)).max(5).default([]),
  callToAction: z.string().trim().max(160).default(DEFAULT_CALL_TO_ACTION),
});

export type SellerProfile = z.infer<typeof SellerProfileSchema>;

export const ResearchInputSchema = z.object({
  targetUrl: z.url().max(2_048),
  preset: PresetSchema,
  customIndustry: z.string().trim().min(2).max(80).optional(),
  sellerProfile: SellerProfileSchema,
});

export type ResearchInput = z.infer<typeof ResearchInputSchema>;

// ─── 来源 ───

export const SourceTypeSchema = z.enum(["official", "news", "social", "registry", "other"]);

export const SourceSchema = z.object({
  id: z.string().min(8),
  url: z.url(),
  canonicalUrl: z.url(),
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(80_000),
  sourceType: SourceTypeSchema,
  publishedAt: z.string().datetime().optional(),
  fetchedAt: z.string().datetime(),
  contentHash: z.string().length(64),
});

export type Source = z.infer<typeof SourceSchema>;

// ─── 字段状态系统（spec §2.1）───

export const FieldStatusSchema = z.enum([
  "verified", // 公开证据直接支持的事实
  "inferred", // 由公开信号推导出的分析判断
  "insufficient", // 已定向查找但没找到足够证据
  "conflicting", // 不同来源出现矛盾
]);
export type FieldStatus = z.infer<typeof FieldStatusSchema>;

/**
 * 统一字段结构（spec §8）。每个销售合同字段都用这个结构：
 * value = 字段值；status = 字段状态；sourceIds = 支撑来源；note = 缺口/冲突说明。
 */
export const ResearchFieldSchema = z.object({
  value: z.string().trim().max(2_000).optional(),
  status: FieldStatusSchema,
  sourceIds: z.array(z.string().min(8)).max(10).default([]),
  note: z.string().trim().max(500).optional(),
});
export type ResearchField = z.infer<typeof ResearchFieldSchema>;

/** 生成一个已验证字段 */
export function verifiedField(value: string, sourceIds: string[], note?: string): ResearchField {
  return { value, status: "verified", sourceIds, note };
}
/** 生成一个推断字段；可信度由 status 保存，不污染用户可读内容。 */
export function inferredField(value: string, sourceIds: string[], note?: string): ResearchField {
  return { value, status: "inferred", sourceIds, note };
}
/** 生成一个缺口字段 */
export function insufficientField(note: string): ResearchField {
  return { status: "insufficient", sourceIds: [], note };
}
/** 生成一个冲突字段 */
export function conflictingField(note: string): ResearchField {
  return { status: "conflicting", sourceIds: [], note };
}

// ─── 数组型字段（列表项也带状态和来源）───

export const ResearchListItemSchema = z.object({
  value: z.string().trim().min(2).max(2_000),
  status: FieldStatusSchema,
  sourceIds: z.array(z.string().min(8)).max(10).default([]),
  note: z.string().trim().max(500).optional(),
});
export type ResearchListItem = z.infer<typeof ResearchListItemSchema>;

// ─── 企业联系方式（只保存可追溯的公开信息）───

export const ContactChannelSchema = z.object({
  kind: z.enum(["website", "contact_page", "phone", "email", "online_channel", "address"]),
  label: z.string().trim().min(2).max(80),
  value: z.string().trim().min(2).max(500),
  url: z.url().optional(),
  status: z.enum(["verified", "conflicting"]),
  sourceIds: z.array(z.string().min(8)).min(1).max(5),
});
export type ContactChannel = z.infer<typeof ContactChannelSchema>;

export const PublicContactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  role: z.string().trim().min(2).max(120),
  contact: z.string().trim().max(200).optional(),
  status: z.enum(["verified", "conflicting"]),
  sourceIds: z.array(z.string().min(8)).min(1).max(5),
});
export type PublicContact = z.infer<typeof PublicContactSchema>;

export const ContactIntelligenceSchema = z.object({
  channels: z.array(ContactChannelSchema).max(20).default([]),
  publicContacts: z.array(PublicContactSchema).max(10).default([]),
});
export type ContactIntelligence = z.infer<typeof ContactIntelligenceSchema>;

// ─── 01 销售结论（spec §3 模块 01）───

export const SalesVerdictSchema = z.object({
  contactSuggestion: ResearchFieldSchema, // 联系建议：是否值得投入时间
  recommendationReason: ResearchFieldSchema, // 推荐理由：为什么现在联系
  keyCustomerSignals: z.array(ResearchListItemSchema).max(3), // 三个关键客户信号
  priorityContactRole: ResearchFieldSchema, // 优先联系角色
  priorityOpportunity: ResearchFieldSchema, // 优先切入机会
  recommendedNextStep: ResearchFieldSchema, // 建议下一步
});
export type SalesVerdict = z.infer<typeof SalesVerdictSchema>;

// ─── 02 客户情报（spec §3 模块 02）───

export const CustomerIntelligenceSchema = z.object({
  companyOverview: ResearchFieldSchema, // 公司概况
  productsAndServices: z.array(ResearchListItemSchema).max(6), // 产品与服务
  targetCustomersAndMarket: ResearchFieldSchema, // 目标客户与市场
  businessModel: ResearchFieldSchema, // 商业模式
  productPositioning: ResearchFieldSchema, // 产品定位
  scaleAndCapability: ResearchFieldSchema, // 规模与能力
  recentUpdates: z.array(ResearchListItemSchema).max(5), // 近期动态
  informationGaps: z.array(z.string().trim().max(200)).max(8).default([]), // 信息缺口（集中简短说明）
});
export type CustomerIntelligence = z.infer<typeof CustomerIntelligenceSchema>;

// ─── 03 机会判断（spec §3 模块 03）───

/**
 * 单条机会的纵向链路：信号→痛点→影响→匹配→验证问题→置信度，保持在同一卡片。
 */
export const OpportunityChainSchema = z.object({
  signal: ResearchListItemSchema, // 公开业务触发信号
  painPoint: ResearchListItemSchema, // 分析得到的潜在痛点（必须 inferred）
  businessImpact: ResearchFieldSchema, // 业务影响
  productMatch: ResearchFieldSchema, // 产品能力匹配
  validationQuestion: ResearchFieldSchema, // 验证问题（与痛点一一对应）
  confidence: ResearchFieldSchema, // 置信度 低/中/高 + 原因
});
export type OpportunityChain = z.infer<typeof OpportunityChainSchema>;

export const OpportunityAnalysisSchema = z.object({
  opportunities: z.array(OpportunityChainSchema).max(3),
  relationshipType: z.enum(["complementary", "replacement", "competitive", "self_built", "unclear"]).optional(),
  currentSolutionOrCompetition: ResearchFieldSchema, // 当前方案/竞争（多为缺口）
  overallConfidence: ResearchFieldSchema, // 整体置信度
});
export type OpportunityAnalysis = z.infer<typeof OpportunityAnalysisSchema>;

// ─── 04 沟通作战（spec §3 模块 04）───

export const DiscoveryQuestionSchema = z.object({
  question: z.string().trim().min(4).max(300),
  purpose: z.string().trim().min(4).max(300),
});
export type DiscoveryQuestion = z.infer<typeof DiscoveryQuestionSchema>;

export const ConversationPlanSchema = z.object({
  recommendedContact: ResearchFieldSchema, // 推荐联系对象
  communicationGoal: ResearchFieldSchema, // 沟通目标
  opening30s: ResearchFieldSchema, // 30 秒开场（全宽重点面板）
  valueBridge: ResearchFieldSchema, // 价值表达
  discoveryQuestions: z.array(DiscoveryQuestionSchema).min(0).max(5), // 发现型问题 3-5 个，带目的
  objectionResponses: z.array(ResearchListItemSchema).max(3), // 异议与回应方向（只写方向）
  proofMaterials: z.array(z.string().trim().max(200)).max(5).default([]), // 证明材料（未提供不显示）
  nextStep: ResearchFieldSchema, // 下一步（明确责任人与动作）
  avoidTopics: z.array(z.string().trim().max(200)).max(3).default([]), // 沟通禁区：防止错误假设
});
export type ConversationPlan = z.infer<typeof ConversationPlanSchema>;

// ─── 质量审计（后台用，前台不展示，spec §8 + §9）───

export const StageOutcomeSchema = z.enum(["success", "partial", "failed"]);
export type StageOutcome = z.infer<typeof StageOutcomeSchema>;

export const RejectedFieldSchema = z.object({
  field: z.string(),
  reason: z.string(),
});
export type RejectedField = z.infer<typeof RejectedFieldSchema>;

export const QualityAuditSchema = z.object({
  directSourceCount: z.number().int().nonnegative(),
  firecrawlBaseSourceCount: z.number().int().nonnegative(),
  firecrawlGapSourceCount: z.number().int().nonnegative(),
  evidencePerCategory: z.record(z.string(), z.number().int().nonnegative()).default({}),
  filteredSources: z.array(z.object({ url: z.string(), reason: z.string() })).max(40).default([]),
  fieldStatuses: z.record(z.string(), FieldStatusSchema).default({}),
  stageOutcomes: z.record(z.string(), StageOutcomeSchema).default({}),
  rejectedFields: z.array(RejectedFieldSchema).max(40).default([]),
  minimumStandardMet: z.boolean(),
  missingFields: z.array(z.string()).max(20).default([]),
});
export type QualityAudit = z.infer<typeof QualityAuditSchema>;

// ─── 覆盖度（spec §8 coverage）───

export const CoverageSchema = z.object({
  directChannels: z.number().int().nonnegative(),
  firecrawlChannels: z.number().int().nonnegative(),
  gapFilledCategories: z.array(z.string()).default([]),
});
export type Coverage = z.infer<typeof CoverageSchema>;

// ─── 指标（spec §8 metrics）───

export const MetricsSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  officialSourceCount: z.number().int().nonnegative(),
  crawlerCalls: z.number().int().nonnegative(),
  llmCalls: z.number().int().nonnegative(),
});
export type Metrics = z.infer<typeof MetricsSchema>;

// ─── 顶层报告（spec §8）───

export const ReportStatusSchema = z.enum(["达标", "未达标", "证据版", "仅采集"]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const ReportMetaSchema = z.object({
  companyName: z.string().trim().max(200),
  targetUrl: z.url(),
  sellerProductName: z.string().trim().max(80),
  collectedAt: z.string().datetime(),
  status: ReportStatusSchema,
});
export type ReportMeta = z.infer<typeof ReportMetaSchema>;

export const SalesReportSchema = z.object({
  reportMeta: ReportMetaSchema,
  salesVerdict: SalesVerdictSchema,
  contactIntelligence: ContactIntelligenceSchema.optional(),
  customerIntelligence: CustomerIntelligenceSchema,
  opportunityAnalysis: OpportunityAnalysisSchema,
  conversationPlan: ConversationPlanSchema,
  qualityAudit: QualityAuditSchema.optional(), // 后台/开发诊断，前台不展示
  coverage: CoverageSchema,
  metrics: MetricsSchema,
  sources: z.array(SourceSchema).min(0).max(20),
  collectionNotes: z.array(z.string().trim().max(240)).max(10).default([]),
  mainReferenceLinks: z.array(z.object({ title: z.string(), url: z.url() })).max(5).default([]),
});
export type SalesReport = z.infer<typeof SalesReportSchema>;

// ─── 旧 Battlecard 兼容（spec §8：历史报告读取时转换，不删用户历史）───

export const CitedTextCompatSchema = z.object({
  text: z.string(),
  sourceIds: z.array(z.string()).default([]),
});

/** 兼容层类型，仅在读取旧 Battlecard 时使用 */
export type LegacyBattlecard = {
  overview?: { text: string; sourceIds: string[] };
  signals?: Array<{ text: string; sourceIds: string[] }>;
  painHypotheses?: Array<{
    text: string; sourceIds: string[]; businessImpact: string;
    confidenceLabel: string; validationQuestion: string;
  }>;
  talkTrack?: {
    objective?: string; opening?: { text: string; sourceIds: string[] };
    discoveryQuestions?: Array<{ question: string; purpose: string }>;
    valueBridge?: string; recommendedNextStep?: string; avoid?: string[];
  };
  productMappings?: Array<{ text: string; sourceIds: string[]; sellerCapability: string; expectedValue: string }>;
  questions?: Array<{ question: string; purpose: string }>;
  opening?: { text: string; sourceIds: string[] };
  risks?: Array<{ text: string; sourceIds: string[] }>;
  companyOverview?: {
    companyIntroduction?: { text: string; sourceIds: string[] };
    productsAndServices?: Array<{ text: string; sourceIds: string[] }>;
    industryAndCoverage?: { text: string; sourceIds: string[] };
    recentUpdates?: Array<{ text: string; sourceIds: string[] }>;
    evidenceNotes?: string[];
  };
  companyAnalysis?: {
    businessModel?: { text: string; sourceIds: string[] };
    productPositioning?: { text: string; sourceIds: string[] };
    targetCustomers?: { text: string; sourceIds: string[] };
    competitionObservation?: { text: string; sourceIds: string[] };
    painHypotheses?: Array<{
      text: string; sourceIds: string[]; businessImpact: string;
      confidenceLabel: string; validationQuestion: string;
    }>;
    evidenceNotes?: string[];
  };
  salesStrategy?: {
    entryPoints?: Array<{ text: string; sourceIds: string[] }>;
    recommendation?: { text: string; sourceIds: string[] };
    opening?: { text: string; sourceIds: string[] };
    potentialNeeds?: Array<{ text: string; sourceIds: string[] }>;
    discoveryQuestions?: Array<{ question: string; purpose: string }>;
    recommendedNextStep?: string;
    avoid?: string[];
    evidenceNotes?: string[];
  };
  sources?: Source[];
  collectionNotes?: string[];
  modelStatus?: string;
  warnings?: string[];
  evidenceClaims?: unknown[];
  evidenceSummary?: string;
};

function citedToField(c?: { text: string; sourceIds: string[] }, status: FieldStatus = "verified"): ResearchField {
  if (!c || !c.text) return insufficientField("该字段在历史报告中缺失。");
  return { value: c.text, status, sourceIds: c.sourceIds ?? [], note: undefined };
}

/**
 * 把旧 Battlecard 转换成新 SalesReport 视图（spec §8：历史报告兼容读取层）。
 * 仅供 report-history 读取旧数据时调用，不改变磁盘上的旧数据。
 */
export function legacyBattlecardToReport(
  legacy: LegacyBattlecard,
  meta: { targetUrl: string; sellerProductName: string; collectedAt: string; companyName?: string },
): SalesReport {
  const companyName = meta.companyName ?? (() => {
    try { return new URL(meta.targetUrl).hostname.replace(/^www\./, ""); } catch { return "目标公司"; }
  })();

  const recent = legacy.companyOverview?.recentUpdates ?? [];
  const signals = legacy.signals ?? recent;
  const pains = legacy.companyAnalysis?.painHypotheses ?? legacy.painHypotheses ?? [];
  const questions = legacy.salesStrategy?.discoveryQuestions
    ?? legacy.talkTrack?.discoveryQuestions
    ?? legacy.questions ?? [];

  const opportunities: OpportunityChain[] = pains.slice(0, 3).map((pain): OpportunityChain => ({
    signal: { value: (signals[0]?.text ?? ""), status: "verified", sourceIds: pain.sourceIds ?? [] },
    painPoint: { value: pain.text, status: "inferred", sourceIds: pain.sourceIds ?? [] },
    businessImpact: { value: pain.businessImpact, status: "inferred", sourceIds: pain.sourceIds ?? [] },
    productMatch: citedToField(legacy.productMappings?.[0], "inferred"),
    validationQuestion: { value: pain.validationQuestion, status: "inferred", sourceIds: pain.sourceIds ?? [] },
    confidence: { value: pain.confidenceLabel, status: "inferred", sourceIds: [] },
  }));

  const recommendedNextStepText = legacy.salesStrategy?.recommendedNextStep
    ?? legacy.talkTrack?.recommendedNextStep
    ?? DEFAULT_CALL_TO_ACTION;

  return {
    reportMeta: {
      companyName,
      targetUrl: meta.targetUrl,
      sellerProductName: meta.sellerProductName,
      collectedAt: meta.collectedAt,
      status: "证据版",
    },
    salesVerdict: {
      contactSuggestion: citedToField(legacy.overview, "inferred"),
      recommendationReason: citedToField(legacy.salesStrategy?.recommendation ?? legacy.overview),
      keyCustomerSignals: signals.slice(0, 3).map((s) => ({ value: s.text, status: "verified", sourceIds: s.sourceIds ?? [] })),
      priorityContactRole: insufficientField("历史报告未明确优先联系角色。"),
      priorityOpportunity: citedToField(legacy.salesStrategy?.entryPoints?.[0], "inferred"),
      recommendedNextStep: { value: recommendedNextStepText, status: "verified", sourceIds: [] },
    },
    customerIntelligence: {
      companyOverview: citedToField(legacy.companyOverview?.companyIntroduction),
      productsAndServices: (legacy.companyOverview?.productsAndServices ?? []).slice(0, 3).map((p) => ({ value: p.text, status: "verified", sourceIds: p.sourceIds ?? [] })),
      targetCustomersAndMarket: citedToField(legacy.companyAnalysis?.targetCustomers ?? legacy.companyOverview?.industryAndCoverage),
      businessModel: citedToField(legacy.companyAnalysis?.businessModel),
      productPositioning: citedToField(legacy.companyAnalysis?.productPositioning),
      scaleAndCapability: insufficientField("历史报告未单独记录规模与能力。"),
      recentUpdates: recent.slice(0, 5).map((r) => ({ value: r.text, status: "verified", sourceIds: r.sourceIds ?? [] })),
      informationGaps: [...(legacy.companyOverview?.evidenceNotes ?? []), ...(legacy.companyAnalysis?.evidenceNotes ?? [])].slice(0, 8),
    },
    opportunityAnalysis: {
      opportunities,
      currentSolutionOrCompetition: citedToField(legacy.companyAnalysis?.competitionObservation, "insufficient"),
      overallConfidence: { value: pains[0]?.confidenceLabel ?? "低", status: "inferred", sourceIds: [] },
    },
    conversationPlan: {
      recommendedContact: insufficientField("历史报告未明确推荐联系对象。"),
      communicationGoal: { value: legacy.talkTrack?.objective ?? "验证公开信号与销售方产品之间是否存在真实业务机会。", status: "inferred", sourceIds: [] },
      opening30s: citedToField(legacy.salesStrategy?.opening ?? legacy.talkTrack?.opening ?? legacy.opening),
      valueBridge: { value: legacy.talkTrack?.valueBridge ?? "", status: "inferred", sourceIds: [] },
      discoveryQuestions: questions.slice(0, 5),
      objectionResponses: (legacy.risks ?? []).slice(0, 3).map((r) => ({ value: r.text, status: "verified", sourceIds: r.sourceIds ?? [] })),
      proofMaterials: [],
      nextStep: { value: recommendedNextStepText, status: "verified", sourceIds: [] },
      avoidTopics: legacy.salesStrategy?.avoid ?? legacy.talkTrack?.avoid ?? [],
    },
    qualityAudit: undefined,
    coverage: { directChannels: 0, firecrawlChannels: 0, gapFilledCategories: [] },
    metrics: { durationMs: 0, sourceCount: legacy.sources?.length ?? 0, officialSourceCount: legacy.sources?.filter((s) => s.sourceType === "official").length ?? 0, crawlerCalls: 0, llmCalls: 0 },
    sources: legacy.sources ?? [],
    collectionNotes: legacy.collectionNotes ?? [],
    mainReferenceLinks: (legacy.sources ?? []).slice(0, 5).map((s) => ({ title: s.title, url: s.url })),
  };
}

// ─── 管线状态与流式事件 ───

export const ResearchStatusSchema = z.enum(["queued", "running", "completed", "failed"]);
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>;

// 保留旧 BattlecardSchema 类型名供渐进迁移，最终移除
export type Battlecard = SalesReport;

export const StageNameSchema = z.enum([
  "site",
  "validate",
  "collect",
  "evidence",
  "facts",
  "opportunity",
  "conversation",
  "customer_profile",
  "product_fit",
  "opportunities",
  "talk_track",
  "next_step",
  "sales_verdict",
]);
export type StageName = z.infer<typeof StageNameSchema>;

/**
 * NDJSON 流式事件。服务端生产、客户端消费。
 * completed.report 现为 SalesReport。
 */
export type PipelineEvent =
  | { kind: "started"; runId: string }
  | { kind: "stage"; stage: StageName; progress: number; message: string }
  | { kind: "warning"; message: string }
  | { kind: "completed"; runId: string; report: SalesReport; metrics: Metrics }
  | { kind: "failed"; code: string; message: string };

// 保留旧 ResearchJob（若有持久化用途）
export const ResearchJobSchema = z.object({
  id: z.string().uuid(),
  status: ResearchStatusSchema,
  input: ResearchInputSchema,
  result: SalesReportSchema.optional(),
  error: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type ResearchJob = z.infer<typeof ResearchJobSchema>;
