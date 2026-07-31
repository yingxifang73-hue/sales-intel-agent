/**
 * Workflow errors cross a durable-step boundary as serialized values.  They are
 * not guaranteed to retain Error.prototype, so `instanceof Error` is not a
 * safe way to decide whether a useful message exists.
 */
export type WorkflowErrorInfo = {
  message: string;
  code: "report_missing" | "report_quality" | "provider_timeout" | "provider_rate_limited" | "structured_output" | "configuration" | "website_unreachable" | "source_collection" | "runtime";
};

const FALLBACK_MESSAGE = "调研服务未能完成。";

function findMessage(value: unknown, seen = new Set<unknown>()): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (value instanceof Error) return value.message.trim() || undefined;
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);

  const record = value as Record<string, unknown>;
  for (const key of ["message", "error", "cause", "details", "reason", "errorStack", "stack"]) {
    const message = findMessage(record[key], seen);
    if (message) return message;
  }
  return undefined;
}

function classify(message: string): WorkflowErrorInfo["code"] {
  const text = message.toLowerCase();
  if (/目标官网.*(?:无法访问|未返回可读取正文)|无法访问或读取目标官网|website.*(?:unreachable|unavailable)/.test(text)) {
    return "website_unreachable";
  }
  if (/最终报告缺失|报告.*缺失|report.*missing/.test(text)) return "report_missing";
  if (/最低交付|质量|完整性|完整报告标准|尚未达到|未交付该报告|minimum|undeliverable/.test(text)) return "report_quality";
  if (/timeout|timed out|abort|超时|deadline/.test(text)) return "provider_timeout";
  if (/\b429\b|rate limit|限流|频率/.test(text)) return "provider_rate_limited";
  if (/json|parse|zod|schema|validation|too small|结构化|格式|校验/.test(text)) return "structured_output";
  if (/api.?key|环境变量|配置|configuration/.test(text)) return "configuration";
  if (/来源|采集|抓取|crawl|firecrawl|\bsearch(?:ing|ed)?\b/.test(text)) return "source_collection";
  return "runtime";
}

export function normalizeWorkflowError(error: unknown): WorkflowErrorInfo {
  const message = findMessage(error) ?? FALLBACK_MESSAGE;
  return { message: message.slice(0, 500), code: classify(message) };
}

const STAGE_LABELS: Record<string, string> = {
  validate: "输入校验",
  collect: "公开资料采集",
  evidence: "证据筛选",
  facts: "公司事实提取",
  analysis: "客户分析",
  repair: "报告补全",
  verify: "报告校验",
  customer_profile: "客户画像",
  product_fit: "产品匹配",
  opportunities: "机会与痛点",
  talk_track: "沟通方案",
  next_step: "下一步",
  sales_verdict: "销售结论",
};

/** A concise Chinese message suitable for the report page; no raw provider payload is exposed. */
export function presentResearchFailure(error: unknown, stage?: string): string {
  const { message, code } = normalizeWorkflowError(error);
  const label = STAGE_LABELS[stage ?? ""] ?? "调研流程";
  if (code === "report_missing" || code === "report_quality" || code === "structured_output") {
    return `调研在“${label}”阶段未能形成完整报告，系统已自动释放本次调研次数。请稍后重新发起。`;
  }
  if (code === "provider_timeout" || code === "provider_rate_limited") {
    return `调研在“${label}”阶段的服务响应未完成，系统已自动释放本次调研次数。请稍后重新发起。`;
  }
  if (code === "configuration") {
    return "调研服务配置尚未完成，系统未扣除本次调研次数。请联系管理员处理。";
  }
  if (code === "website_unreachable") {
    return "系统当前无法访问或读取目标官网，也未找到可用的公开页面。常见原因是网址填写错误、网站限制访问或网站临时不可用。本次尚未进入 AI 报告分析，调研次数已自动退回。请检查官网地址后重试。";
  }
  if (code === "source_collection") {
    return `调研在“${label}”阶段未获取到可用公开资料，系统已自动释放本次调研次数。请检查官网地址后重试。`;
  }
  // Runtime fallback: surface the normalized cause so the user is not left with
  // a generic "未能完成" while the real reason (e.g. "模型阶段未完成：facts")
  // is silently discarded. FALLBACK_MESSAGE means no cause could be recovered.
  const cause = message && message !== FALLBACK_MESSAGE ? `（原因：${message.slice(0, 60)}）` : "";
  return `调研在“${label}”阶段未能完成${cause}，系统已自动释放本次调研次数。请稍后重新发起。`;
}
