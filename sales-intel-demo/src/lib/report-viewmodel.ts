/**
 * ReportViewModel — 统一报告展示模型（spec §4 数据展示契约）
 *
 * 后端 SalesReport → normalizeSalesReport → ReportViewModel → 页面组件
 *
 * 职责：
 * 1. 保留原始 rawReport（不裁剪）
 * 2. 统一空值兜底、旧版兼容、数组默认值
 * 3. 字段状态一视同仁（verified/inferred/insufficient/conflicting 都有展示规则）
 * 4. 提供已映射/未映射字段诊断
 */
import type {
  SalesReport,
  ResearchField,
  ResearchListItem,
  ContactChannel,
  PublicContact,
  OpportunityChain,
  DiscoveryQuestion,
  Source,
  Metrics,
  Coverage,
  FieldStatus,
} from "@/lib/types";
import { isUserFacingChineseText, sanitizeReportText } from "@/lib/evidence";

// ═══════════════════════════════════════════════════════════════
// ReportViewModel
// ═══════════════════════════════════════════════════════════════

export interface DisplayField {
  value: string;
  status: FieldStatus;
  sourceIds: string[];
  note?: string;
}

export interface DisplayListItem {
  value: string;
  status: FieldStatus;
  sourceIds: string[];
  note?: string;
}

export interface DisplayOpportunity {
  signal: DisplayListItem;
  painPoint: DisplayListItem;
  businessImpact: DisplayField;
  productMatch: DisplayField;
  validationQuestion: DisplayField;
  confidence: DisplayField;
}

export interface DisplayConversation {
  recommendedContact: DisplayField;
  communicationGoal: DisplayField;
  opening30s: DisplayField;
  valueBridge: DisplayField;
  discoveryQuestions: DiscoveryQuestion[];
  objectionResponses: DisplayListItem[];
  proofMaterials: string[];
  nextStep: DisplayField;
  avoidTopics: string[];
}

export interface DisplayQuality {
  directSourceCount: number;
  firecrawlBaseSourceCount: number;
  firecrawlGapSourceCount: number;
  totalSources: number;
  validSources: number;
  excludedSources: number;
  warnings: string[];
  failedSources: Array<{ url: string; reason: string }>;
  insufficientFieldCount: number;
  conflictingFieldCount: number;
  mappedFieldCount: number;
  foldedFieldCount: number;
  unmappedFields: string[];
  totalReportFields: number;
  valuedFieldCount: number;
}

export interface ReportViewModel {
  // 原始报告（完整保留）
  rawReport: SalesReport;

  // 元数据
  companyName: string;
  targetUrl: string;
  sellerProductName: string;
  collectedAt: string;
  reportStatus: string;
  preset?: string;

  // 01 客户速览
  verdict: {
    contactSuggestion: DisplayField;
    recommendationReason: DisplayField;
    keyCustomerSignals: DisplayListItem[];
    priorityContactRole: DisplayField;
    priorityOpportunity: DisplayField;
    recommendedNextStep: DisplayField;
    // 综合等级（从信号和机会推导）
    suggestedGrade: "A" | "B" | "C" | "D";
    gradeLabel: string;
    gradeReason: string;
  };

  // 02 联系方式与地址（只映射已通过来源校验的数据）
  contacts: {
    channels: ContactChannel[];
    publicContacts: PublicContact[];
  };

  // 03 业务与产品
  intelligence: {
    companyOverview: DisplayField;
    productsAndServices: DisplayListItem[];
    targetCustomersAndMarket: DisplayField;
    businessModel: DisplayField;
    productPositioning: DisplayField;
    scaleAndCapability: DisplayField;
    recentUpdates: DisplayListItem[];
    informationGaps: string[];
  };

  // 03 匹配与机会
  opportunity: {
    opportunities: DisplayOpportunity[];
    currentSolutionOrCompetition: DisplayField;
    overallConfidence: DisplayField;
    // 所有产品匹配（LLM 生成的全部结果）
    allOpportunityCount: number;
  };

  // 04 沟通策略
  conversation: DisplayConversation & {
    // 备用/长内容
    hasMoreContent: boolean;
  };

  // 05 证据与风险
  evidence: {
    sources: Source[];
    mainReferenceLinks: Array<{ title: string; url: string }>;
    evidenceClaims: Array<{
      claim: string;
      type: string; // "原始信息" | "AI归纳" | "AI判断" | "待验证" | "风险提醒"
      basis: string;
      source: string;
      confidence: string;
    }>;
    collectionNotes: string[];
    dataRisks: string[];
    businessRisks: string[];
    opinionRisks: string[];
    supplementalNotes: string[];
  };

  // 质量完整性
  quality: DisplayQuality;

  // 其他
  metrics: Metrics;
  coverage: Coverage;
}

// ═══════════════════════════════════════════════════════════════
// 字段展示分类
// ═══════════════════════════════════════════════════════════════

/** 字段在哪个 Tab 展示 */
export type FieldLocation =
  | "verdict"
  | "intelligence"
  | "opportunity"
  | "conversation"
  | "evidence"
  | "folded"
  | "unmapped";

export interface FieldMapping {
  path: string;
  location: FieldLocation;
  label: string;
  isArray: boolean;
  isFolded: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

function safeField(field: ResearchField | undefined | null): ResearchField {
  return field ?? { status: "insufficient", sourceIds: [] };
}

function safeList(list: ResearchListItem[] | undefined | null): ResearchListItem[] {
  return list ?? [];
}

/** Older locally saved reports may include status prefixes in their values.
 * Status remains available in the view model, but the product copy stays
 * readable and avoids displaying implementation-oriented labels. */
function cleanDisplayValue(value: string | undefined): string {
  const cleaned = sanitizeReportText((value ?? "")
    .replace(/\[(?:搜索摘要|待验证|待确认)\]\s*/gu, "")
    .replace(/^(?:搜索摘要|待验证|待确认)\s*[：:，,]?\s*/u, "")
    // 清理 LLM 输出中残留的 markdown 标记符号
    .replace(/[`*_#~]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim());
  return isUserFacingChineseText(cleaned) ? cleaned : "";
}

function toDisplayField(field: ResearchField | undefined | null): DisplayField {
  if (!field) {
    return { value: "", status: "insufficient", sourceIds: [], note: "字段缺失" };
  }
  return {
    value: cleanDisplayValue(field.value),
    status: field.status,
    sourceIds: field.sourceIds ?? [],
    note: field.note,
  };
}

function toDisplayList(items: ResearchListItem[] | undefined | null): DisplayListItem[] {
  if (!items || !Array.isArray(items)) return [];
  return items
    .map((item) => ({
      value: cleanDisplayValue(item.value),
      status: item.status,
      sourceIds: item.sourceIds ?? [],
      note: item.note,
    }))
    .filter((item) => item.value.length > 0);
}

function toDisplayStrings(items: string[] | undefined | null): string[] {
  return (items ?? []).map((item) => cleanDisplayValue(item)).filter(Boolean);
}

function toDisplayQuestions(items: DiscoveryQuestion[] | undefined | null): DiscoveryQuestion[] {
  return (items ?? []).map((item) => ({
    question: cleanDisplayValue(item.question),
    purpose: cleanDisplayValue(item.purpose),
  })).filter((item) => item.question.length > 0 && item.purpose.length > 0);
}

function toDisplayOpportunity(opp: OpportunityChain): DisplayOpportunity {
  return {
    signal: toDisplayListItem(opp.signal),
    painPoint: toDisplayListItem(opp.painPoint),
    businessImpact: toDisplayField(opp.businessImpact),
    productMatch: toDisplayField(opp.productMatch),
    validationQuestion: toDisplayField(opp.validationQuestion),
    confidence: toDisplayField(opp.confidence),
  };
}

function toDisplayListItem(item: ResearchListItem | undefined | null): DisplayListItem {
  if (!item) return { value: "", status: "insufficient", sourceIds: [], note: "缺失" };
  return {
    value: cleanDisplayValue(item.value),
    status: item.status,
    sourceIds: item.sourceIds ?? [],
    note: item.note,
  };
}

// ═══════════════════════════════════════════════════════════════
// 建议等级推导
// ═══════════════════════════════════════════════════════════════

function deriveGrade(report: SalesReport): { grade: "A" | "B" | "C" | "D"; label: string; reason: string } {
  const sv = report.salesVerdict;
  const oa = report.opportunityAnalysis;
  const ci = report.customerIntelligence;
  const cp = report.conversationPlan;

  const hasSignals = (sv?.keyCustomerSignals?.length ?? 0) > 0;
  const hasVerifiedSignals = (sv?.keyCustomerSignals ?? []).some((s) => s?.status === "verified");
  const hasOpportunities = (oa?.opportunities?.length ?? 0) > 0;
  const hasQuestions = (cp?.discoveryQuestions?.length ?? 0) > 1;
  const ciOk = ci?.companyOverview?.status !== "insufficient";
  const oppConfidence = oa?.overallConfidence?.value ?? "";
  const qualityPassed = report.reportMeta.status === "达标" && report.qualityAudit?.minimumStandardMet !== false;
  const overlappingSolution = oa?.relationshipType === "competitive" || oa?.relationshipType === "self_built";

  if (overlappingSolution && !hasOpportunities) {
    return { grade: "D", label: "暂不直推", reason: "客户已有重叠或自研能力，除非发现明确互补缺口，否则不建议直接销售。" };
  }

  if (qualityPassed && hasVerifiedSignals && hasOpportunities && ciOk) {
    if (oppConfidence.startsWith("高")) return { grade: "A", label: "优先联系", reason: "客户信号明确、产品匹配度高、沟通策略完整。" };
    return { grade: "B", label: "值得验证", reason: "存在匹配信号但需要进一步验证采购意图和决策链。" };
  }
  if (hasSignals || ciOk || hasQuestions) {
    return { grade: "C", label: "持续观察", reason: "公开信息或匹配信号有限，建议通过多源信息补充后重新评估。" };
  }
  return { grade: "D", label: "暂不匹配", reason: "公开信息过少，暂无法评估销售机会。" };
}

// ═══════════════════════════════════════════════════════════════
// 递归统计 insufficient / conflicting 字段
// ═══════════════════════════════════════════════════════════════

function countFieldStatuses(report: SalesReport): { insufficient: number; conflicting: number; total: number; valued: number } {
  let insufficient = 0;
  let conflicting = 0;
  let total = 0;
  let valued = 0;

  function walk(obj: unknown, _path: string) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${_path}[${i}]`));
      return;
    }
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const p = `${_path}.${key}`;
      if (val && typeof val === "object" && "status" in val && typeof (val as Record<string, unknown>).status === "string") {
        total++;
        const status = (val as Record<string, unknown>).status as string;
        if (status === "insufficient") insufficient++;
        else if (status === "conflicting") conflicting++;
        if ((val as Record<string, unknown>).value) valued++;
      } else if (val && typeof val === "object") {
        walk(val, p);
      }
    }
  }

  walk(report, "report");
  return { insufficient, conflicting, total, valued };
}

// ═══════════════════════════════════════════════════════════════
// 字段映射表 — 全部已知字段 → 展示位置
// ═══════════════════════════════════════════════════════════════

const FIELD_MAP: FieldMapping[] = [
  // report cover
  { path: "reportMeta", location: "verdict", label: "报告主体信息", isArray: false, isFolded: false },

  // verdict tab
  { path: "salesVerdict.contactSuggestion", location: "verdict", label: "联系建议", isArray: false, isFolded: false },
  { path: "salesVerdict.recommendationReason", location: "verdict", label: "推荐理由", isArray: false, isFolded: false },
  { path: "salesVerdict.keyCustomerSignals", location: "verdict", label: "关键客户信号", isArray: true, isFolded: false },
  { path: "salesVerdict.priorityContactRole", location: "verdict", label: "优先联系角色", isArray: false, isFolded: false },
  { path: "salesVerdict.priorityOpportunity", location: "verdict", label: "优先切入机会", isArray: false, isFolded: false },
  { path: "salesVerdict.recommendedNextStep", location: "verdict", label: "建议下一步", isArray: false, isFolded: false },

  // intelligence tab
  { path: "customerIntelligence.companyOverview", location: "intelligence", label: "公司概况", isArray: false, isFolded: false },
  { path: "customerIntelligence.productsAndServices", location: "intelligence", label: "产品与服务", isArray: true, isFolded: false },
  { path: "customerIntelligence.targetCustomersAndMarket", location: "intelligence", label: "目标客户与市场", isArray: false, isFolded: false },
  { path: "customerIntelligence.businessModel", location: "intelligence", label: "商业模式", isArray: false, isFolded: false },
  { path: "customerIntelligence.productPositioning", location: "intelligence", label: "产品定位", isArray: false, isFolded: false },
  { path: "customerIntelligence.scaleAndCapability", location: "intelligence", label: "规模与能力", isArray: false, isFolded: false },
  { path: "customerIntelligence.recentUpdates", location: "intelligence", label: "近期动态", isArray: true, isFolded: false },
  { path: "customerIntelligence.informationGaps", location: "evidence", label: "信息缺口", isArray: true, isFolded: false },

  // opportunity tab
  { path: "opportunityAnalysis.opportunities", location: "opportunity", label: "机会链", isArray: true, isFolded: false },
  { path: "opportunityAnalysis.currentSolutionOrCompetition", location: "opportunity", label: "当前方案/竞争", isArray: false, isFolded: false },
  { path: "opportunityAnalysis.overallConfidence", location: "opportunity", label: "整体置信度", isArray: false, isFolded: false },

  // conversation tab
  { path: "conversationPlan.recommendedContact", location: "conversation", label: "推荐联系对象", isArray: false, isFolded: false },
  { path: "conversationPlan.communicationGoal", location: "conversation", label: "沟通目标", isArray: false, isFolded: false },
  { path: "conversationPlan.opening30s", location: "conversation", label: "30秒开场", isArray: false, isFolded: false },
  { path: "conversationPlan.valueBridge", location: "conversation", label: "价值表达", isArray: false, isFolded: false },
  { path: "conversationPlan.discoveryQuestions", location: "conversation", label: "发现型问题", isArray: true, isFolded: true },
  { path: "conversationPlan.objectionResponses", location: "conversation", label: "异议回应方向", isArray: true, isFolded: true },
  { path: "conversationPlan.proofMaterials", location: "conversation", label: "证明材料", isArray: true, isFolded: true },
  { path: "conversationPlan.nextStep", location: "conversation", label: "下一步", isArray: false, isFolded: false },
  { path: "conversationPlan.avoidTopics", location: "conversation", label: "沟通禁区", isArray: true, isFolded: false },

  // evidence tab
  { path: "sources", location: "evidence", label: "来源列表", isArray: true, isFolded: false },
  { path: "mainReferenceLinks", location: "evidence", label: "主要参考链接", isArray: true, isFolded: false },
  { path: "collectionNotes", location: "evidence", label: "采集备注", isArray: true, isFolded: true },
  { path: "qualityAudit", location: "evidence", label: "质量审计", isArray: false, isFolded: true },
  { path: "coverage", location: "evidence", label: "覆盖度", isArray: false, isFolded: true },
  { path: "metrics", location: "evidence", label: "指标", isArray: false, isFolded: true },
];

// ═══════════════════════════════════════════════════════════════
// 主标准化函数
// ═══════════════════════════════════════════════════════════════

export function normalizeSalesReport(
  report: SalesReport,
  options?: { preset?: string },
): ReportViewModel {
  const grade = deriveGrade(report);
  const ci = report.customerIntelligence;
  const oa = report.opportunityAnalysis;
  const cp = report.conversationPlan;
  const sv = report.salesVerdict;
  const qa = report.qualityAudit;
  const fCounts = countFieldStatuses(report);

  // 已映射的字段路径（根据 FIELD_MAP）
  const mappedPaths = new Set(FIELD_MAP.filter((f) => f.location !== "unmapped").map((f) => f.path));

  // 检测未映射字段
  const unmappedFields: string[] = findUnmappedFields(report, mappedPaths);

  // 折叠展示的字段路径
  const foldedPaths = new Set(FIELD_MAP.filter((f) => f.isFolded).map((f) => f.path));
  const foldedCount = foldedPaths.size;

  return {
    rawReport: report,

    companyName: report.reportMeta?.companyName ?? "",
    targetUrl: report.reportMeta?.targetUrl ?? "",
    sellerProductName: report.reportMeta?.sellerProductName ?? "",
    collectedAt: report.reportMeta?.collectedAt ?? new Date().toISOString(),
    reportStatus: report.reportMeta?.status ?? "未达标",
    preset: options?.preset,

    verdict: {
      contactSuggestion: toDisplayField(sv?.contactSuggestion),
      recommendationReason: toDisplayField(sv?.recommendationReason),
      keyCustomerSignals: toDisplayList(sv?.keyCustomerSignals),
      priorityContactRole: toDisplayField(sv?.priorityContactRole),
      priorityOpportunity: toDisplayField(sv?.priorityOpportunity),
      recommendedNextStep: toDisplayField(sv?.recommendedNextStep),
      suggestedGrade: grade.grade,
      gradeLabel: grade.label,
      gradeReason: grade.reason,
    },

    contacts: {
      channels: report.contactIntelligence?.channels ?? [],
      publicContacts: report.contactIntelligence?.publicContacts ?? [],
    },

    intelligence: {
      companyOverview: toDisplayField(ci?.companyOverview),
      productsAndServices: toDisplayList(ci?.productsAndServices),
      targetCustomersAndMarket: toDisplayField(ci?.targetCustomersAndMarket),
      businessModel: toDisplayField(ci?.businessModel),
      productPositioning: toDisplayField(ci?.productPositioning),
      scaleAndCapability: toDisplayField(ci?.scaleAndCapability),
      recentUpdates: toDisplayList(ci?.recentUpdates),
      informationGaps: ci?.informationGaps ?? [],
    },

    opportunity: {
      opportunities: (oa?.opportunities ?? []).map(toDisplayOpportunity),
      currentSolutionOrCompetition: toDisplayField(oa?.currentSolutionOrCompetition),
      overallConfidence: toDisplayField(oa?.overallConfidence),
      allOpportunityCount: (oa?.opportunities ?? []).length,
    },

    conversation: {
      recommendedContact: toDisplayField(cp?.recommendedContact),
      communicationGoal: toDisplayField(cp?.communicationGoal),
      opening30s: toDisplayField(cp?.opening30s),
      valueBridge: toDisplayField(cp?.valueBridge),
      discoveryQuestions: toDisplayQuestions(cp?.discoveryQuestions),
      objectionResponses: toDisplayList(cp?.objectionResponses),
      proofMaterials: toDisplayStrings(cp?.proofMaterials),
      nextStep: toDisplayField(cp?.nextStep),
      avoidTopics: toDisplayStrings(cp?.avoidTopics),
      hasMoreContent: (cp?.discoveryQuestions?.length ?? 0) > 5 || (cp?.objectionResponses?.length ?? 0) > 3,
    },

    evidence: {
      sources: report.sources ?? [],
      mainReferenceLinks: report.mainReferenceLinks ?? [],
      evidenceClaims: buildEvidenceClaims(report),
      collectionNotes: report.collectionNotes ?? [],
      dataRisks: buildDataRisks(report),
      businessRisks: buildBusinessRisks(report),
      opinionRisks: [],
      supplementalNotes: buildSupplementalNotes(report),
    },

    quality: {
      directSourceCount: qa?.directSourceCount ?? 0,
      firecrawlBaseSourceCount: qa?.firecrawlBaseSourceCount ?? 0,
      firecrawlGapSourceCount: qa?.firecrawlGapSourceCount ?? 0,
      totalSources: (report.sources ?? []).length,
      validSources: (report.sources ?? []).filter((s) => s.content.length > 200 || s.sourceType === "official").length,
      excludedSources: (qa?.filteredSources ?? []).length,
      warnings: report.collectionNotes?.filter((n) => n.includes("失败") || n.includes("warning") || n.includes("缺失")) ?? [],
      failedSources: (qa?.filteredSources ?? []).map((f) => ({ url: f.url, reason: f.reason })),
      insufficientFieldCount: fCounts.insufficient,
      conflictingFieldCount: fCounts.conflicting,
      mappedFieldCount: mappedPaths.size,
      foldedFieldCount: foldedCount,
      unmappedFields,
      totalReportFields: fCounts.total,
      valuedFieldCount: fCounts.valued,
    },

    metrics: report.metrics ?? { durationMs: 0, sourceCount: 0, officialSourceCount: 0, crawlerCalls: 0, llmCalls: 0 },
    coverage: report.coverage ?? { directChannels: 0, firecrawlChannels: 0, gapFilledCategories: [] },
  };
}

// ═══════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════

function findUnmappedFields(report: SalesReport, mapped: Set<string>): string[] {
  const unmapped: string[] = [];
  const topLevelKeys = [
    "reportMeta", "salesVerdict", "customerIntelligence", "opportunityAnalysis",
    "contactIntelligence", "conversationPlan", "qualityAudit", "coverage", "metrics", "sources",
    "collectionNotes", "mainReferenceLinks",
  ];

  function walk(obj: unknown, path: string) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
        obj.forEach((item, i) => walk(item, `${path}[${i}]`));
      }
      return;
    }
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const p = (path ? `${path}.${key}` : key);
      if (val && typeof val === "object" && "status" in val && typeof (val as Record<string, unknown>).status === "string") {
        // 这是一个 ResearchField / ResearchListItem
        if (!mapped.has(p) && !topLevelKeys.some((tk) => p.startsWith(tk + ".") && mapped.has(p.split(".").slice(0, p.split(".").length - 1).join(".")))) {
          // 简化：只检查顶层路径前缀
          const prefix = p.split(".").slice(0, 2).join(".");
          if (![...mapped].some((mp) => mp.startsWith(prefix))) {
            unmapped.push(p);
          }
        }
        continue;
      }
      if (val && typeof val === "object" && !Array.isArray(val)) {
        walk(val, p);
      }
    }
  }

  walk(report, "");
  return unmapped;
}

function buildEvidenceClaims(report: SalesReport): ReportViewModel["evidence"]["evidenceClaims"] {
  const claims: ReportViewModel["evidence"]["evidenceClaims"] = [];
  const sv = report.salesVerdict;
  const ci = report.customerIntelligence;
  const oa = report.opportunityAnalysis;
  const cp = report.conversationPlan;

  if (!sv || !ci || !oa || !cp) return claims;

  // 信号
  for (const signal of (sv.keyCustomerSignals ?? [])) {
    if (signal?.value) {
      claims.push({
        claim: signal.value,
        type: signal.status === "verified" ? "原始信息" : "AI判断",
        basis: (signal.sourceIds ?? []).join(", "),
        source: signal.status === "verified" ? "公开信息" : "AI推断",
        confidence: signal.status === "verified" ? "高" : "中",
      });
    }
  }

  // 机会
  for (const opp of (oa.opportunities ?? [])) {
    if (opp?.painPoint?.value) {
      claims.push({
        claim: opp.painPoint.value,
        type: "AI判断",
        basis: opp.signal?.value ?? "",
        source: "AI综合",
        confidence: opp.confidence?.value?.charAt(0) ?? "中",
      });
    }
    if (opp?.productMatch?.value) {
      claims.push({
        claim: opp.productMatch.value,
        type: "AI判断",
        basis: opp.signal?.value ?? "",
        source: "AI综合",
        confidence: opp.confidence?.value?.charAt(0) ?? "中",
      });
    }
  }

  // 公司事实
  if (ci.companyOverview?.value && ci.companyOverview?.status === "verified") {
    claims.push({
      claim: ci.companyOverview.value,
      type: "原始信息",
      basis: (ci.companyOverview.sourceIds ?? []).join(", "),
      source: "官网/公开资料",
      confidence: "高",
    });
  }

  // 关键词：AI content recommendations
  if (cp.valueBridge?.value) {
    claims.push({
      claim: cp.valueBridge.value,
      type: "AI判断",
      basis: "",
      source: "AI综合",
      confidence: "中",
    });
  }

  return claims;
}


function buildDataRisks(report: SalesReport): string[] {
  const risks: string[] = [];
  const ci = report.customerIntelligence;
  const qa = report.qualityAudit;

  if (!ci) return risks;

  const companyOverview = safeField(ci.companyOverview);
  const scaleAndCapability = safeField(ci.scaleAndCapability);
  const businessModel = safeField(ci.businessModel);
  const productsAndServices = safeList(ci.productsAndServices);
  const recentUpdates = safeList(ci.recentUpdates);

  if (companyOverview.status === "insufficient") risks.push("缺少公司介绍");
  if (productsAndServices.length === 0) risks.push("缺少产品与服务信息");
  if (scaleAndCapability.status === "insufficient") risks.push("缺少规模与能力信息");
  if (businessModel.status === "insufficient") risks.push("缺少商业模式信息");
  if (recentUpdates.length === 0) risks.push("缺少近期动态");
  if ((qa?.missingFields?.length ?? 0) > 0) risks.push(...qa!.missingFields!);

  const warnings = report.collectionNotes?.filter((n) => n.includes("失败") || n.includes("乱码") || n.includes("不足")) ?? [];
  risks.push(...warnings);

  return risks.slice(0, 20);
}

function buildBusinessRisks(report: SalesReport): string[] {
  const risks: string[] = [];
  const oa = report.opportunityAnalysis;
  if (!oa) return risks;

  const opportunities = oa.opportunities ?? [];
  const overallConfidence = safeField(oa.overallConfidence);

  if (opportunities.length === 0) {
    risks.push("暂无明确的业务机会判断。");
  }
  if (overallConfidence.status === "insufficient") {
    risks.push("整体置信度未评估，需更多信息。");
  }
  // 检查是否所有机会都是低置信度
  const allLow = opportunities.length > 0 && opportunities.every((o) => (o.confidence?.value ?? "").startsWith("低"));
  if (allLow) risks.push("所有机会均为低置信度，需首次沟通后重新评估。");

  return risks;
}

function buildSupplementalNotes(report: SalesReport): string[] {
  const technicalNoise = /(firecrawl|jina|模型|采集|来源数量|阶段|爬取|crawler|api|http|失败|warning|超时)/i;
  const candidates = [
    ...(report.collectionNotes ?? []),
    ...(report.customerIntelligence?.informationGaps ?? []),
  ].map((value) => value.replace(/[`*_#]/g, "").replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 8 && !technicalNoise.test(value));
  return [...new Set(candidates)].slice(0, 8).map((value) => value.slice(0, 180));
}

// ═══════════════════════════════════════════════════════════════
// 字段状态标签
// ═══════════════════════════════════════════════════════════════

export function fieldStatusLabel(status: FieldStatus): string {
  switch (status) {
    case "verified": return "已核验";
    case "inferred": return "";
    case "insufficient": return "";
    case "conflicting": return "风险提醒";
  }
}

export function fieldStatusColor(status: FieldStatus): string {
  switch (status) {
    case "verified": return "gray";
    case "inferred": return "purple";
    case "insufficient": return "orange";
    case "conflicting": return "red";
  }
}

export function fieldStatusBg(status: FieldStatus): string {
  switch (status) {
    case "verified": return "#f1f3f2";
    case "inferred": return "#f3eeff";
    case "insufficient": return "#fff4e5";
    case "conflicting": return "#fce4e4";
  }
}

export function fieldStatusTextColor(status: FieldStatus): string {
  switch (status) {
    case "verified": return "#626966";
    case "inferred": return "#6b4ea9";
    case "insufficient": return "#b85c00";
    case "conflicting": return "#a13c35";
  }
}
