import type { ResearchField, ResearchListItem, SalesReport } from "@/lib/types";
import { hasNavigationBoilerplate, hasSuspiciousScriptPayload } from "@/lib/evidence";

export interface BanViolation {
  rule: string;
  detail: string;
}

const FORBIDDEN_REPORT_TEXT = /\[\s*搜索摘要\s*]|\[\s*待验证\s*]|\[\s*待确认\s*]|等待模型|待模型|暂未生成|详情\s*$|BOSS直聘为求职者|JobsDB|(?:目标公司(?:的)?\s*)?公开(?:业务)?资料显示/i;
const SOFTWARE_PRODUCT_PATTERN = /(?:SDK|API|软件|平台|Token|计费|算力|芯片|AI|语音|转写|模型|算法)/i;
const SOFTWARE_TEMPLATE_POLLUTION = /(?:包材规格|食品安全|饲料|养殖|产线兼容性|设备型号和技术参数|样品及小批量测试)/i;
const SELF_BUILT_PATTERN = /(?:自研|自主研发|内部方案|自有能力|已经提供|已提供|已具备|已有.+(?:系统|平台|能力|体系)|现有.+(?:系统|平台|能力|体系))/i;
const DIRECT_SELL_PATTERN = /(?:建议直接联系|建议联系并推销|直接推销|存在采购需求|可直接推进)/i;
const COMPLEMENTARY_BOUNDARY_PATTERN = /(?:互补|补充|差异|能力缺口|边界|不替换|暂不建议直接推销)/i;
const NEWS_PURPOSE_PATTERN = /\/(?:news|press|blog|article|announcement|media|updates?)(?:\/|$)|新闻|公告|发布|动态|资讯/i;
const DATE_PATTERN = /(?:20\d{2}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?|\d{1,2}月\d{1,2}日)/;
const GENERIC_OPPORTUNITY_PATTERN = /(?:当前公开信息不足|公开资料不足以证明|不足以做出明确机会判断|没有找到明确机会|尚未形成可验证的产品匹配机会)/;
const UNTRANSLATED_ENGLISH_PATTERN = /(?:\b(?:click|expand|read more|read next|latest news|home|menu|search|input|sign in|log in)\b)|(?:[A-Za-z]+\s+){7,}[A-Za-z]+/i;
const MALFORMED_PUNCTUATION_PATTERN = /[”"]\s*[。；，、.]|([。！？；：，、])\1+/u;

function collectLongText(value: unknown, collected: string[] = []): string[] {
  if (typeof value === "string") {
    const text = value.trim();
    if (text.length >= 80) collected.push(text);
    return collected;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLongText(item, collected);
    return collected;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectLongText(item, collected);
  }
  return collected;
}

function duplicateTextFingerprints(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value.length < 180) continue;
    const fingerprint = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 220);
    if (fingerprint.length < 60) continue;
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count >= 3).map(([fingerprint]) => fingerprint);
}

function usefulText(value: string | undefined, minimumLength: number): boolean {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length < minimumLength || FORBIDDEN_REPORT_TEXT.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  const navigationLike = words.length >= 8
    && new Set(words.map((word) => word.toLowerCase())).size >= 7
    && !/[。！？.!?]/.test(text);
  return !navigationLike;
}

function usefulField(field: ResearchField, minimumLength: number, requireSource = false): boolean {
  if (field.status === "insufficient" || field.status === "conflicting") return false;
  if (requireSource && field.sourceIds.length === 0) return false;
  return usefulText(field.value, minimumLength);
}

function usefulItem(item: ResearchListItem, minimumLength: number, requireSource = false): boolean {
  if (item.status === "insufficient" || item.status === "conflicting") return false;
  if (requireSource && item.sourceIds.length === 0) return false;
  return usefulText(item.value, minimumLength);
}

export function checkBanRules(report: SalesReport): BanViolation[] {
  const violations: BanViolation[] = [];
  if ((report.salesVerdict.recommendationReason.value?.length ?? 0) > 2_000) {
    violations.push({
      rule: "no_raw_page_as_conclusion",
      detail: "recommendationReason exceeds 2,000 characters",
    });
  }
  const userFacingReport = JSON.stringify({
    salesVerdict: report.salesVerdict,
    customerIntelligence: report.customerIntelligence,
    opportunityAnalysis: report.opportunityAnalysis,
    conversationPlan: report.conversationPlan,
  });
  if (FORBIDDEN_REPORT_TEXT.test(userFacingReport)) {
    violations.push({
      rule: "no_placeholder_or_search_summary",
      detail: "report contains search-summary or unfinished placeholder text",
    });
  }
  if (GENERIC_OPPORTUNITY_PATTERN.test(`${report.salesVerdict.contactSuggestion.value ?? ""} ${report.salesVerdict.recommendationReason.value ?? ""} ${report.salesVerdict.priorityOpportunity.value ?? ""}`)) {
    violations.push({
      rule: "no_generic_opportunity_fallback",
      detail: "opportunity conclusion is generic and does not describe a concrete evidence-based entry point",
    });
  }
  const reportText = collectLongText({
    salesVerdict: report.salesVerdict,
    customerIntelligence: report.customerIntelligence,
    opportunityAnalysis: report.opportunityAnalysis,
    conversationPlan: report.conversationPlan,
  });
  if (UNTRANSLATED_ENGLISH_PATTERN.test(userFacingReport) || reportText.some((text) => UNTRANSLATED_ENGLISH_PATTERN.test(text))) {
    violations.push({
      rule: "no_untranslated_english_noise",
      detail: "report contains crawler English text or an untranslated English sentence",
    });
  }
  if (reportText.some((text) => MALFORMED_PUNCTUATION_PATTERN.test(text))) {
    violations.push({
      rule: "no_malformed_punctuation",
      detail: "report contains repeated or incorrectly ordered punctuation",
    });
  }
  const longText = collectLongText({
    salesVerdict: report.salesVerdict,
    customerIntelligence: report.customerIntelligence,
    opportunityAnalysis: report.opportunityAnalysis,
    conversationPlan: report.conversationPlan,
  });
  if (longText.some(hasNavigationBoilerplate)) {
    violations.push({
      rule: "no_navigation_boilerplate",
      detail: "report contains crawler navigation mixed into a report field",
    });
  }
  if (longText.some(hasSuspiciousScriptPayload)) {
    violations.push({
      rule: "no_script_or_encoded_payload",
      detail: "report contains an anti-bot script, tool payload, or long encoded token",
    });
  }
  if (duplicateTextFingerprints(longText).length > 0) {
    violations.push({
      rule: "no_cross_field_duplicate",
      detail: "the same long passage is reused across multiple report fields",
    });
  }
  if (SOFTWARE_PRODUCT_PATTERN.test(report.reportMeta.sellerProductName) && SOFTWARE_TEMPLATE_POLLUTION.test(userFacingReport)) {
    violations.push({
      rule: "no_cross_industry_template",
      detail: "software/AI report contains manufacturing, packaging or food-industry fallback text",
    });
  }
  const currentSolution = report.opportunityAnalysis.currentSolutionOrCompetition.value ?? "";
  const verdictText = `${report.salesVerdict.contactSuggestion.value ?? ""} ${report.salesVerdict.recommendationReason.value ?? ""}`;
  if (
    (report.opportunityAnalysis.relationshipType === "self_built" || SELF_BUILT_PATTERN.test(currentSolution))
    && DIRECT_SELL_PATTERN.test(verdictText)
    && !COMPLEMENTARY_BOUNDARY_PATTERN.test(verdictText)
  ) {
    violations.push({
      rule: "no_self_built_fit_contradiction",
      detail: "report recommends direct selling despite evidence that the target already has an overlapping solution",
    });
  }
  return violations;
}

export interface MinimumCheckResult {
  passed: boolean;
  missing: string[];
}

export function checkMinimum(report: SalesReport): MinimumCheckResult {
  const missing: string[] = [];
  const stages = report.qualityAudit?.stageOutcomes ?? {};

  for (const stage of ["facts", "opportunity", "conversation"] as const) {
    if (stages[stage] !== "success" && stages[stage] !== "partial") {
      missing.push(`模型阶段未完成：${stage}`);
    }
  }

  const ci = report.customerIntelligence;
  if (!usefulField(ci.companyOverview, 50, true)) missing.push("公司概况内容过少");

  const usefulProducts = ci.productsAndServices.filter((item) => usefulItem(item, 22, true));
  if (usefulProducts.length < 2) missing.push("产品与服务内容质量不足");

  const profileCoverage = [
    usefulField(ci.targetCustomersAndMarket, 28, true),
    usefulField(ci.businessModel, 22, true),
    usefulField(ci.productPositioning, 22, true),
    usefulField(ci.scaleAndCapability, 22, true),
    ci.recentUpdates.some((item) => usefulItem(item, 22, true) && isCredibleRecentUpdate(item, report)),
  ].filter(Boolean).length;
  if (profileCoverage < 4) missing.push("客户画像关键维度不足");
  if (ci.recentUpdates.length > 0 && !ci.recentUpdates.some((item) => isCredibleRecentUpdate(item, report))) {
    missing.push("近期动态缺少日期或新闻来源");
  }

  const opportunities = report.opportunityAnalysis.opportunities.filter((opportunity) =>
    usefulItem(opportunity.signal, 24, true)
    && usefulItem(opportunity.painPoint, 24)
    && usefulField(opportunity.businessImpact, 24)
    && usefulField(opportunity.productMatch, 24)
    && usefulField(opportunity.validationQuestion, 18)
    && usefulField(opportunity.confidence, 16),
  );
  const noDirectFit = report.opportunityAnalysis.relationshipType === "self_built"
    || report.opportunityAnalysis.relationshipType === "competitive"
    || (
      SELF_BUILT_PATTERN.test(report.opportunityAnalysis.currentSolutionOrCompetition.value ?? "")
      && /暂不建议直接推销|不建议直接|竞争|重叠|互补|边界/i.test(
        `${report.salesVerdict.contactSuggestion.value ?? ""} ${report.salesVerdict.recommendationReason.value ?? ""}`,
      )
    );
  if (opportunities.length < 1 && !noDirectFit) missing.push("缺少有直接证据支撑的机会与痛点");

  const cp = report.conversationPlan;
  if (!usefulField(cp.recommendedContact, 12)) missing.push("缺少明确联系角色");
  if (!usefulField(cp.communicationGoal, 24)) missing.push("沟通目标内容不足");
  if (!usefulField(cp.opening30s, 60)) missing.push("首次沟通开场话术内容不足");
  if (!usefulField(cp.valueBridge, 36)) missing.push("产品价值桥接内容不足");
  if (cp.discoveryQuestions.filter((item) => usefulText(item.question, 12) && usefulText(item.purpose, 8)).length < 3) {
    missing.push("首次沟通发现问题少于3条");
  }
  if (!cp.objectionResponses.some((item) => usefulItem(item, 24))) missing.push("缺少异议回应方向");
  if (!usefulField(cp.nextStep, 24)) missing.push("缺少明确下一步");

  if (!usefulField(report.salesVerdict.recommendationReason, 30)) missing.push("销售结论理由内容不足");

  if (report.qualityAudit?.rejectedFields.some((item) => item.field.startsWith("qualityJudge."))) {
    missing.push("语义质量复核未通过");
  }

  // Non-critical quality violations are logged but do not block delivery
  // (DeepSeek sometimes reuses phrasing across fields despite distinct content).
  for (const violation of checkBanRules(report)) {
    if (violation.rule !== "no_cross_field_duplicate" && violation.rule !== "no_navigation_boilerplate") {
      missing.push(`禁止项：${violation.rule}`);
    }
  }

  return { passed: missing.length === 0, missing: [...new Set(missing)] };
}

function isCredibleRecentUpdate(item: ResearchListItem, report: SalesReport): boolean {
  if (!usefulItem(item, 22, true)) return false;
  if (DATE_PATTERN.test(item.value)) return true;
  const sourceIds = new Set(item.sourceIds);
  return report.sources.some((source) => (
    sourceIds.has(source.id)
    && Boolean(source.publishedAt)
    && (source.sourceType === "news" || NEWS_PURPOSE_PATTERN.test(`${source.url} ${source.title}`))
  ));
}

export function buildUndeliverableReport(missing: string[]): string {
  return `本次调研尚未达到完整报告标准：${missing.join("；")}。系统未交付该报告，也不会扣减调研次数。`;
}

export function isUndeliverable(report: SalesReport): boolean {
  return !checkMinimum(report).passed;
}
