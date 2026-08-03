import type { AppConfig } from "@/lib/config";
import { isReadableChinese, sanitizeChineseOutput, selectEvidenceExcerpts } from "@/lib/evidence";
import type { ResearchInput, Source, SalesReport, SalesVerdict, CustomerIntelligence, ContactIntelligence, OpportunityAnalysis, OpportunityChain, ConversationPlan, ResearchField, ResearchListItem, StageOutcome, RejectedField, QualityAudit, FieldStatus } from "@/lib/types";
import { inferredField, insufficientField } from "@/lib/types";
import { extractVerifiedContactsFromSources, normalizeContactIntelligence } from "@/lib/contact-intelligence";
import { checkMinimum } from "@/lib/quality-gate";
import { assessSource, type EvidenceCategory } from "@/lib/source-quality";
import { getPreset } from "@/lib/presets";
import type { ReportGenerationStage } from "@/lib/report-repair";
import {
  extractDeterministicSourceFacts,
  mergeSourceFactBundles,
  type SourceFactBundle,
} from "@/lib/source-facts";
import { dedupeSources } from "@/lib/dedupe";
import { normalizeSalesReportAudit } from "@/lib/quality-audit";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractJson(raw: string): JsonRecord | undefined {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try { const parsed: unknown = JSON.parse(fenced.slice(start, end + 1)); return isRecord(parsed) ? parsed : undefined; }
  catch { return undefined; }
}

function validSourceIds(value: unknown, sources: Source[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const known = new Set(sources.map((s) => s.id));
  const ids = value.filter((id): id is string => typeof id === "string").map((id) => {
    if (known.has(id)) return id;
    // 模型输出 S1/S2 等短编号，转换为 sourceId
    const shortMatch = id.match(/^S(\d+)$/);
    if (shortMatch) {
      const idx = parseInt(shortMatch[1], 10) - 1;
      return idx >= 0 && idx < sources.length ? sources[idx]!.id : undefined;
    }
    return undefined;
  }).filter((id): id is string => typeof id === "string" && id.length > 0);
  return ids.length ? [...new Set(ids)].slice(0, 10) : undefined;
}

/** Resolve the provider's compact S1/S2 identifier back to a batch source id. */
export function resolveModelBundleSourceId(value: unknown, sourceIds: readonly string[]): string | undefined {
  if (typeof value !== "string") return undefined;
  if (sourceIds.includes(value)) return value;
  const shortMatch = value.match(/^S(\d+)$/i);
  if (!shortMatch) return undefined;
  const index = Number.parseInt(shortMatch[1]!, 10) - 1;
  return index >= 0 && index < sourceIds.length ? sourceIds[index] : undefined;
}

function readableText(value: unknown): string | undefined {
  if (typeof value !== "string" || /&(?:#x?[0-9a-f]+|[a-z][a-z0-9]+);/i.test(value)) return undefined;
  const text = sanitizeChineseOutput(value);
  return isReadableChinese(text) ? text : undefined;
}

export function isCompleteResearchStatement(value: string): boolean {
  const text = value.trim();
  return text.length >= 12 && !/[以与和及为称、，：:（(]$/.test(text);
}

// ─── 模型证据包（给 LLM 的封装证据）───

export interface ModelEvidence {
  id: string;       // S1, S2... 短编号
  title: string;
  url: string;
  sourceType: string;
  publishedAt?: string;
  categories: string[];
  excerpt: string;
}

export function buildModelEvidence(sources: Source[], input: ResearchInput): ModelEvidence[] {
  const focus = [
    "company", "product", "service", "customer", "market", "news",
    "公司", "产品", "服务", "客户", "市场", "发布", "融资", "上市", "合作",
    "团队", "技术", "专利", "营收", "增长", "扩张", "招聘",
    input.sellerProfile.productName,
    input.customIndustry ?? "",
    ...input.sellerProfile.customerProblems,
    ...getPreset(input.preset).researchFocus,
  ];
  const assessments = sources.map((source, originalIndex) => ({
    ...assessSource(source, input.targetUrl, input),
    originalIndex,
  })).sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex);
  const selected: typeof assessments = [];
  const selectedIds = new Set<string>();
  const categoryOrder: EvidenceCategory[] = ["company", "product", "business_signal", "news"];

  for (const category of categoryOrder) {
    let count = 0;
    for (const assessment of assessments) {
      if (!assessment.eligible || selectedIds.has(assessment.source.id) || !assessment.categories.includes(category)) continue;
      selected.push(assessment);
      selectedIds.add(assessment.source.id);
      count++;
      if (count >= 4) break;
    }
  }
  for (const assessment of assessments) {
    if (selected.length >= 20) break;
    if (!assessment.eligible || selectedIds.has(assessment.source.id)) continue;
    selected.push(assessment);
    selectedIds.add(assessment.source.id);
  }

  return selected.slice(0, 20).map((assessment) => {
    const source = assessment.source;
    const excerpt = selectEvidenceExcerpts(source, focus).slice(0, 1_600);
    return {
      id: source.id,
      title: source.title,
      url: source.url,
      sourceType: source.sourceType,
      publishedAt: source.publishedAt,
      categories: assessment.categories,
      excerpt,
    };
  });
}

/**
 * All selected sources have already gone through per-source fact extraction.
 * Later synthesis stages therefore need a complete source index and concise
 * supporting excerpts, not the same full page bodies on every model call.
 * Referenced sources keep a wider excerpt; every other source remains present
 * with enough context for citation and contradiction checks.
 */
export function buildSynthesisEvidence(
  sources: Source[],
  input: ResearchInput,
  referencedSourceIds: ReadonlySet<string> = new Set(),
): ModelEvidence[] {
  return buildModelEvidence(sources, input).map((item) => ({
    ...item,
    excerpt: item.excerpt.slice(0, referencedSourceIds.has(item.id) ? 520 : 320),
  }));
}

function referencedIdsFromFields(values: Array<ResearchField | ResearchListItem | undefined>): Set<string> {
  return new Set(values.flatMap((value) => value?.sourceIds ?? []));
}

const INFERENCE_SIGNAL_MARKERS = /(需求|痛点|可能|预计|推测|或将|有望|意味着|需要|压力|瓶颈|意向|计划)/;

function compactEvidenceText(value: string): string {
  return value.toLowerCase().replace(/[\s，。；、：:“”"'‘’（）()【】[\]-]/g, "");
}

/**
 * Keeps direct event/fact clauses in a verified signal and removes demand or
 * pain conclusions that were not stated by the cited pages.
 */
export function sanitizeVerifiedSignal(item: ResearchListItem, sources: Source[]): ResearchListItem | undefined {
  if (item.status !== "verified") return item;
  const sourceIds = new Set(item.sourceIds);
  const evidenceText = compactEvidenceText(
    sources.filter((source) => sourceIds.has(source.id)).map((source) => source.content).join("\n"),
  );
  const clauses = item.value
    .split(/[，；。]/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const kept = clauses.filter((clause) => {
    if (!INFERENCE_SIGNAL_MARKERS.test(clause)) return true;
    const compactClause = compactEvidenceText(clause);
    return compactClause.length >= 4 && evidenceText.includes(compactClause);
  });
  if (!kept.length) return undefined;
  return { ...item, value: `${kept.join("，")}。` };
}

export function buildSafeProductMatch(
  input: ResearchInput,
  companyContext = "",
  sourceIds: string[] = [],
): ResearchField {
  const sellerClaim = input.sellerProfile.valueProposition.trim() || `提供${input.sellerProfile.productName}`;
  const productName = input.sellerProfile.productName;
  const automotiveContext = /汽车|新能源车|新能源汽车|车企|乘用车|automotive|vehicle|electric car|sedan|suv/i.test(
    `${input.customIndustry ?? ""} ${companyContext}`,
  );
  const voiceChip = /车规|芯片/i.test(productName) && /语音|ai|算力/i.test(productName);
  if (automotiveContext && voiceChip) {
    return inferredField(
      `目标公司公开业务涉及汽车与新能源汽车；${productName}可优先围绕智能座舱离线语音交互、端侧算力、车规认证和量产交付要求进行匹配评估。`,
      sourceIds,
    );
  }
  return inferredField(
    `卖方产品“${productName}”的价值主张为“${sellerClaim}”；是否满足目标公司的具体技术、规格、认证与交付要求，需在沟通及测试中确认。`,
    sourceIds,
  );
}

function inferredListItem(value: string): ResearchListItem {
  return { value, status: "inferred", sourceIds: [] };
}

function sanitizeAnalyticalField(field: ResearchField): ResearchField {
  if (field.status !== "verified" || !/(大概率|通常|一般|可能|推测|预计|壁垒|绑定|需求)/.test(field.value ?? "")) return field;
  return inferredField(field.value ?? "该判断需要进一步验证。", field.sourceIds);
}

function conciseEvidenceContext(value: string | undefined): string {
  const cleaned = sanitizeChineseOutput(value ?? "");
  if (!cleaned) return "";
  const sentences = cleaned
    .split(/(?<=[。！？.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return (sentences.length ? sentences.slice(0, 2).join(" ") : cleaned).trim();
}

function withoutTerminalPunctuation(value: string): string {
  return value.trim().replace(/[。！？；：，、.!?;:,\s]+$/u, "");
}

// ─── LLM 调用（原生 fetch，避开 SDK 兼容问题）───

type OpenAiCompletionPayload = {
  choices?: Array<{
    delta?: { content?: unknown };
    message?: { content?: unknown };
    text?: unknown;
  }>;
};

/**
 * OpenAI-compatible gateways are allowed to ignore stream=true and return a
 * regular JSON completion. Treating that response as SSE loses valid model
 * output and causes needless timeout/retry cycles.
 */
export async function readOpenAiSseContent(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const payload = await response.json() as OpenAiCompletionPayload;
    const choice = payload.choices?.[0];
    const content = choice?.message?.content ?? choice?.delta?.content ?? choice?.text;
    if (typeof content === "string" && content.trim()) return content;
    throw new Error("empty model JSON response");
  }

  if (!response.body) throw new Error("model stream body is unavailable");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  const consumeLine = (line: string) => {
    const value = line.trim();
    if (!value.startsWith("data:")) return;
    const data = value.slice("data:".length).trim();
    if (!data || data === "[DONE]") return;
    try {
      const chunk = JSON.parse(data) as OpenAiCompletionPayload;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === "string") content += delta;
    } catch {
      // Ignore provider keep-alives or malformed individual SSE frames; a missing
      // final content value is still surfaced to the caller below.
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeLine(buffer);
  if (!content.trim()) throw new Error("empty model response stream");
  return content;
}

/**
 * Supports OpenAI-compatible providers configured with either a host URL
 * (https://provider.example) or a versioned URL (https://provider.example/v1).
 * Appending /v1 twice makes the provider return 404 before any research starts.
 */
export function chatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return /\/v1$/i.test(normalized)
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

async function completeJson(config: AppConfig, system: string, payload: unknown, maxTokens: number, repair = false): Promise<string> {
  const url = chatCompletionsUrl(config.OPENAI_BASE_URL);

  // A slow provider (e.g. proxied reasoning models) can need more than one
  // round trip for a structured JSON response. Retry on transient failures
  // (timeout / 5xx / network), with a progressively longer timeout so a slow
  // but eventually-correct response is not discarded. 4xx (auth / bad request)
  // is not retried.
  const attemptMultipliers = [1.0, 1.3, 1.6];
  const backoffMs = 500;
  let lastError: unknown;

  for (let attempt = 0; attempt < attemptMultipliers.length; attempt += 1) {
    const repairAttempt = attempt > 0;
    const body = JSON.stringify({
      model: config.OPENAI_MODEL,
      temperature: 0.1,
      max_tokens: maxTokens,
      // DeepSeek official API does not support stream + json_object together.
      // We drop json_object (the system prompt already specifies JSON output)
      // and keep stream for timeout-resistant delivery.
      stream: true,
      messages: [
        { role: "system", content: repair || repairAttempt ? `${system}\n\n这是一次格式纠错重试。必须返回完整 JSON。` : system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });

    const timeoutMs = Math.round(config.MODEL_REQUEST_TIMEOUT_MS * attemptMultipliers[attempt]!);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${config.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt < attemptMultipliers.length - 1 && isRetryableNetworkError(error)) {
        await sleep(backoffMs);
        continue;
      }
      throw error;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const error = new Error(`${res.status} ${res.statusText} — ${errText.slice(0, 200)}`);
      lastError = error;
      if (attempt < attemptMultipliers.length - 1 && isRetryableStatus(res.status)) {
        await sleep(backoffMs);
        continue;
      }
      throw error;
    }

    try {
      return await readOpenAiSseContent(res);
    } catch (error) {
      lastError = error;
      if (attempt < attemptMultipliers.length - 1) {
        await sleep(backoffMs);
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("model request failed after retries");
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return /timeout|timed out|aborted|fetch failed|econnreset|enotfound|socket|network|epipe/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 阶段 1：事实抽取（spec §5.1）───

function factsPrompt(seller?: { productName: string; targetCustomer: string }): string {
  return `你是严谨的 B2B 公司研究员。仅基于 evidence 输出完整、有效的中文 JSON，不输出解释。
要求：
1. 覆盖公司定位、产品与服务、目标市场、商业模式、产品定位、规模能力和近期动态；公司介绍、规模能力、客户/合作事实必须优先提取，有证据才写。
2. 区分来源直接事实与分析，不得把推测写成 verified。
3. 每个事实对象为 {"value":"具体中文总结","status":"verified","sourceIds":["证据中的真实ID"]}。
4. sourceIds 必须逐字引用 evidence 的 id；禁止使用不存在的编号。
5. signals 只放近期变化、扩产、合作、招聘、技术升级、渠道变化等来源直接写明的事件；只写事件本身，禁止追加“存在采购需求”“带来某产品需求”等销售推论。
6. contactIntelligence 只允许逐字提取 evidence 中出现的官网联系页、电话、邮箱、线上渠道、地址和公开联系人。禁止猜测或补全；未找到就返回空数组。
返回 {"customerIntelligence":{"companyOverview":事实,"productsAndServices":[事实],"targetCustomersAndMarket":事实,"businessModel":事实,"productPositioning":事实,"scaleAndCapability":事实,"recentUpdates":[事实]},"contactIntelligence":{"channels":[{"kind":"website/contact_page/phone/email/online_channel/address","label":"信息类型","value":"证据原文值","url":"证据中的完整URL（适用时）","status":"verified","sourceIds":["真实ID"]}],"publicContacts":[{"name":"证据中的姓名","role":"证据中的职位","contact":"证据中的公开联系方式（可选）","status":"verified","sourceIds":["真实ID"]}]},"signals":[事实]}。
卖方产品：${seller?.productName ?? "未提供"}；理想客户：${seller?.targetCustomer ?? "未提供"}。`;
  return `你是严谨的 B2B 公司研究员。基于给出的公开证据，用简洁中文输出 JSON。

**规则：**
- 只基于公开证据写作；没有证据的字段不输出
- 不要编造公司信息、产品功能、竞争对手、财务数据
- 品牌名和产品专有名词可保留英文，其余必须翻译总结为中文
- 区分目标公司整体、子品牌和业务部门；子业务资料不得表述为集团整体事实
- 只有具有新闻或公告语义的证据才进入 recentUpdates
- 所有事实对象必须为 {value,status,sourceIds}；sourceIds 只能用 S1/S2 等短编号
- status 只能是 "verified" 或 "insufficient"；有证据=verified，无=不输出${seller?.targetCustomer ? `\n- 销售方的理想客户画像是"${seller?.targetCustomer}"，如证据明确则评估匹配度` : ""}

输出 JSON 格式：
{
  "customerIntelligence": {
    "companyOverview": {"value":"中文事实总结","status":"verified","sourceIds":["S1"]},
    "productsAndServices": [{"value":"产品/服务总结","status":"verified","sourceIds":["S2"]}],
    "targetCustomersAndMarket": {"value":"客户与市场总结","status":"verified","sourceIds":["S1"]},
    "businessModel": {"value":"商业模式总结","status":"verified","sourceIds":["S2"]},
    "productPositioning": {"value":"产品定位总结","status":"verified","sourceIds":["S2"]},
    "scaleAndCapability": {"value":"规模与能力总结","status":"verified","sourceIds":["S1"]},
    "recentUpdates": [{"value":"含日期的公开动态","status":"verified","sourceIds":["S3"]}]
  },
  "contactIntelligence": {
    "channels": [{"kind":"email","label":"商务邮箱","value":"证据原文中的邮箱","status":"verified","sourceIds":["S1"]}],
    "publicContacts": []
  },
  "signals": [
    {"value":"公开业务触发信号","status":"verified","sourceIds":["S1"]}
  ]
}

不要为凑字段而编造；尤其不得猜测姓名、职位、电话、邮箱、地址、店铺或社交账号。evidence 已对应类别时必须完成总结。`;
}

function sourceFactsPrompt(): string {
  return `你是严谨的 B2B 公司研究员。你会收到一组公开网页证据。必须逐页独立抽取，并输出有效 JSON，不输出解释。
规则：
1. 每个 bundle 只写对应网页直接说明的公司事实；不得把另一网页的事实放入本 bundle，不得补全、猜测或把营销推断写成事实。
2. bundles 必须覆盖输入中的每个 sourceId；没有有效事实时也返回该 sourceId 和空数组。
3. 优先抽取公司介绍、产品与服务、目标客户或市场、商业模式、产品定位、规模与能力、近期动态。
4. 将英文网页内容概括为简洁中文；品牌和产品专有名词可保留英文。
5. companyOverview 只能来自官网首页、关于我们、公司介绍或权威工商/公司档案页；具体产品、OCR、帮助、招聘、联系方式页面不得作为公司概况。
6. recentUpdates 和 signals 只填写页面明确描述且带日期的新闻、公告或业务动态，不可把成立时间、产品数量、平台介绍当近期动态，也不可推导采购需求。
7. 具体产品页可以进入 productsAndServices，但不得写进 companyOverview。
8. 严禁复制网页菜单、栏目名称、页头页脚或关键词堆积；每个 value 只写完整、可读的事实句。
返回：
{
  "bundles":[{
    "sourceId":"source-id",
    "companyOverview":{"value":"...","status":"verified","sourceIds":["source-id"]},
    "productsAndServices":[{"value":"...","status":"verified","sourceIds":["source-id"]}],
    "targetCustomersAndMarket":{"value":"...","status":"verified","sourceIds":["source-id"]},
    "businessModel":{"value":"...","status":"verified","sourceIds":["source-id"]},
    "productPositioning":{"value":"...","status":"verified","sourceIds":["source-id"]},
    "scaleAndCapability":{"value":"...","status":"verified","sourceIds":["source-id"]},
    "recentUpdates":[{"value":"含明确日期的动态","status":"verified","sourceIds":["source-id"]}],
    "signals":[{"value":"含明确日期的业务信号","status":"verified","sourceIds":["source-id"]}]
  }]
}`;
}

function bundleFromModelResponse(raw: JsonRecord, source: Source): SourceFactBundle | undefined {
  const modelBundle: SourceFactBundle = {
    sourceId: source.id,
    companyOverview: normalizeFactField(raw.companyOverview, [source]),
    productsAndServices: normalizeFactList(raw.productsAndServices, [source], 3),
    targetCustomersAndMarket: normalizeFactField(raw.targetCustomersAndMarket, [source]),
    businessModel: normalizeFactField(raw.businessModel, [source]),
    productPositioning: normalizeFactField(raw.productPositioning, [source]),
    scaleAndCapability: normalizeFactField(raw.scaleAndCapability, [source]),
    recentUpdates: normalizeFactList(raw.recentUpdates, [source], 3),
    signals: normalizeFactList(raw.signals, [source], 3)
      .map((item) => sanitizeVerifiedSignal(item, [source]))
      .filter((item): item is ResearchListItem => Boolean(item)),
  };
  const hasContent = Boolean(modelBundle.companyOverview?.value)
    || modelBundle.productsAndServices.length > 0
    || modelBundle.signals.length > 0;
  return hasContent ? modelBundle : undefined;
}

function combineSourceBundles(model: SourceFactBundle | undefined, fallback: SourceFactBundle): SourceFactBundle {
  if (!model) return fallback;
  return {
    sourceId: fallback.sourceId,
    companyOverview: model.companyOverview ?? fallback.companyOverview,
    productsAndServices: model.productsAndServices.length ? model.productsAndServices : fallback.productsAndServices,
    targetCustomersAndMarket: model.targetCustomersAndMarket ?? fallback.targetCustomersAndMarket,
    businessModel: model.businessModel ?? fallback.businessModel,
    productPositioning: model.productPositioning ?? fallback.productPositioning,
    scaleAndCapability: model.scaleAndCapability ?? fallback.scaleAndCapability,
    recentUpdates: model.recentUpdates.length ? model.recentUpdates : fallback.recentUpdates,
    signals: model.signals.length ? model.signals : fallback.signals,
  };
}

export interface SourceFactExtractionResult {
  bundles: SourceFactBundle[];
  outcomes: Record<string, StageOutcome>;
  rejected: RejectedField[];
}

/**
 * Map step in the research flow. Every source remains independently keyed, but
 * up to three pages share one structured model request. This keeps all selected
 * sources while avoiding one slow provider round trip per page.
 */
export async function extractSourceFactBundles(
  config: AppConfig,
  input: ResearchInput,
  sources: Source[],
): Promise<SourceFactExtractionResult> {
  // The fact stage must cover every eligible selected source. Evidence ranking
  // is still used by later synthesis stages, but never to silently truncate
  // per-source extraction.
  const selected = sources.filter((source) => assessSource(source, input.targetUrl, input).eligible);
  if (!config.OPENAI_API_KEY) {
    return {
      bundles: selected.map(extractDeterministicSourceFacts),
      outcomes: { facts: "partial" },
      rejected: [],
    };
  }
  const rejected: RejectedField[] = [];
  let degraded = false;
  const fallbackById = new Map(selected.map((source) => [source.id, extractDeterministicSourceFacts(source)]));
  const modelById = new Map<string, SourceFactBundle>();

  for (let offset = 0; offset < selected.length; offset += 3) {
    const batch = selected.slice(offset, offset + 3);
    let completed = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const pendingBatch = batch.filter((source) => !modelById.has(source.id));
      if (!pendingBatch.length) {
        completed = true;
        break;
      }
      try {
        const evidence = pendingBatch
          .map((source) => buildModelEvidence([source], input)[0])
          .filter((item): item is ModelEvidence => Boolean(item));
        if (!evidence.length) break;
        const raw = await completeJson(config, sourceFactsPrompt(), {
          companyUrl: input.targetUrl,
          industry: input.customIndustry ?? input.preset,
          sellerProduct: input.sellerProfile.productName,
          sources: evidence,
        }, Math.min(5_200, 1_000 + evidence.length * 650), attempt > 0);
        const parsed = extractJson(raw);
        const rawBundles = Array.isArray(parsed?.bundles)
          ? parsed.bundles
            : pendingBatch.length === 1 && parsed
              ? [parsed]
              : [];
        for (const rawBundle of rawBundles) {
          if (!isRecord(rawBundle)) continue;
          const sourceId = resolveModelBundleSourceId(
            rawBundle.sourceId,
            pendingBatch.map((item) => item.id),
          ) ?? (pendingBatch.length === 1 ? pendingBatch[0]!.id : undefined);
          const source = sourceId ? pendingBatch.find((item) => item.id === sourceId) : undefined;
          if (!source) continue;
          const modelBundle = bundleFromModelResponse(rawBundle, source);
          if (modelBundle) modelById.set(source.id, modelBundle);
        }
        completed = batch.every((source) => modelById.has(source.id));
        if (completed) break;
      } catch (error) {
        if (attempt === 1) {
          degraded = true;
          for (const source of pendingBatch) {
            rejected.push({
              field: `sourceFacts.${source.id}`,
              reason: error instanceof Error ? error.message.slice(0, 200) : "source fact extraction failed",
            });
          }
        }
      }
    }
    if (!completed) {
      degraded = true;
      for (const source of batch) {
        if (modelById.has(source.id)) continue;
        rejected.push({ field: `sourceFacts.${source.id}`, reason: "模型未返回该来源，已使用正文规则抽取" });
      }
    }
  }

  const bundles = selected.map((source) => combineSourceBundles(
    modelById.get(source.id),
    fallbackById.get(source.id)!,
  ));

  return {
    bundles,
    outcomes: { facts: degraded ? "partial" : "success" },
    rejected,
  };
}

async function generateFacts(
  config: AppConfig, report: SalesReport, input: ResearchInput, sources: Source[],
  preExtracted?: SourceFactExtractionResult,
): Promise<{ ci: CustomerIntelligence; contacts: ContactIntelligence; signals: ResearchListItem[]; outcomes: Record<string, StageOutcome>; rejected: RejectedField[] } | null> {
  // The old whole-corpus request made every customer field depend on one JSON
  // response. The map-reduce path below deliberately returns before that
  // legacy code: successful source bundles are merged even if another source
  // or the provider itself fails.
  const extraction = preExtracted ?? await extractSourceFactBundles(config, input, sources);
  const merged = mergeSourceFactBundles(extraction.bundles, sources);
  const hasContent = merged.customerIntelligence.companyOverview.status !== "insufficient"
    || merged.customerIntelligence.productsAndServices.length > 0
    || merged.signals.length > 0;
  if (hasContent) {
    return {
      ci: merged.customerIntelligence,
      contacts: { channels: [], publicContacts: [] },
      signals: merged.signals,
      outcomes: extraction.outcomes,
      rejected: extraction.rejected,
    };
  }

  const evidence = buildModelEvidence(sources, input);
  const payload = {
    companyUrl: input.targetUrl,
    industryPreset: input.customIndustry ?? input.preset,
    industryResearchFocus: getPreset(input.preset).researchFocus,
    sellerContext: {
      productName: input.sellerProfile.productName,
      valueProposition: input.sellerProfile.valueProposition,
      targetCustomer: input.sellerProfile.targetCustomer,
    },
    evidence,
  };
  const outcomes: Record<string, StageOutcome> = { facts: "failed" };
  const rejected: RejectedField[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await completeJson(config, factsPrompt(payload.sellerContext), payload, 2_800, attempt > 0);
      const parsed = extractJson(raw);
      const ciRaw = isRecord(parsed?.customerIntelligence) ? parsed.customerIntelligence : undefined;
      if (!ciRaw) continue;

      const ci: CustomerIntelligence = {
        companyOverview: normalizeFactField(ciRaw.companyOverview, sources) ?? insufficientField("未找到可核验的公司介绍信息。"),
        productsAndServices: normalizeFactList(ciRaw.productsAndServices, sources, 3),
        targetCustomersAndMarket: normalizeFactField(ciRaw.targetCustomersAndMarket, sources) ?? insufficientField("目标客户与市场信息待整理。"),
        businessModel: normalizeFactField(ciRaw.businessModel, sources) ?? insufficientField("公开资料未明确商业模式。"),
        productPositioning: normalizeFactField(ciRaw.productPositioning, sources) ?? insufficientField("公开资料未明确产品定位。"),
        scaleAndCapability: normalizeFactField(ciRaw.scaleAndCapability, sources) ?? insufficientField("规模与能力信息待补充。"),
        recentUpdates: normalizeFactList(ciRaw.recentUpdates, sources, 5),
        informationGaps: collectGaps(ciRaw),
      };

      const signalsRaw = Array.isArray(parsed?.signals) ? parsed.signals : [];
      const signals = normalizeFactList(signalsRaw, sources, 5)
        .map((signal) => sanitizeVerifiedSignal(signal, sources))
        .filter((signal): signal is ResearchListItem => Boolean(signal));
      const contacts = normalizeContactIntelligence(parsed?.contactIntelligence, sources, input.targetUrl);

      const hasContent = ci.companyOverview.status !== "insufficient" || ci.productsAndServices.length > 0 || signals.length > 0;
      if (!hasContent) continue;

      outcomes.facts = "success";
      return { ci, contacts, signals, outcomes, rejected };
    } catch (error) {
      if (attempt === 1) console.error("Facts generation failed:", error instanceof Error ? error.message : "unknown");
    }
  }
  outcomes.facts = "failed";
  return null;
}

// ─── 阶段 2：机会分析（spec §5.2）───

function opportunityPrompt(seller: { productName: string; valueProposition: string; targetCustomer: string; customerProblems: string[] }): string {
  return `你是 B2B 售前分析师。仅基于 companyFacts、signals 和 evidence 输出有效中文 JSON，不输出解释。
先判断客户现有方案与卖方产品的关系：complementary（互补）、replacement（可替代）、competitive（竞争）、self_built（客户已自研同类能力）、unclear（无法判断）。禁止把“公司增长、融资、获奖”等通用动态自动推断为对卖方产品的需求。
每条机会必须具备：可引用的直接业务信号、潜在痛点、业务影响、明确的产品能力匹配、首次沟通问题和置信度。
signal 只能复述来源直接事实，不得把“存在采购需求、持续需求、升级需求”等销售判断放入 verified signal；这些只能写入 inferred 痛点。
不得把 companyFacts 或 evidence 的长段落原样复制进机会字段；应提取与该机会直接相关的完整事实句。
事实字段用 verified 并引用 evidence 的真实 id；判断字段用 inferred。若 relationshipType 为 competitive 或 self_built，除非证据明确支持一项互补缺口，否则 opportunities 必须为 []，并明确“不建议直接推销”。没有直接匹配信号时 opportunities 也必须为 []。
返回 {"relationshipType":"complementary/replacement/competitive/self_built/unclear","opportunities":[{"signal":{"value":"直接公开信号","status":"verified","sourceIds":["真实ID"]},"painPoint":{"value":"潜在痛点","status":"inferred","sourceIds":["真实ID"]},"businessImpact":{"value":"可能业务影响","status":"inferred","sourceIds":[]},"productMatch":{"value":"卖方能力如何匹配","status":"inferred","sourceIds":[]},"validationQuestion":{"value":"一个首次沟通问题","status":"inferred","sourceIds":[]},"confidence":{"value":"低/中/高—原因","status":"inferred","sourceIds":[]}}],"currentSolutionOrCompetition":{"value":"已知方案、竞争线索或信息缺口","status":"verified/inferred/insufficient","sourceIds":[]},"overallConfidence":{"value":"低/中/高—原因","status":"inferred","sourceIds":[]}}。
卖方产品：${seller.productName}；价值：${seller.valueProposition}；目标客户：${seller.targetCustomer}。`;
  return `你是 B2B 售前顾问。基于已核验的公司事实和业务信号，分析销售机会。只输出 JSON。

**规则：**
- 每条机会必须基于至少一个业务信号（不可从行业通用推断）
- 痛点必须标注为 "inferred"，且不得写成已确认的客户内部事实
- 产品匹配必须说明基于卖方的什么能力
- 每个痛点必须配一个验证问题
- 置信度只能是 低/中/高，并附原因
- sourceIds 只能用 S1/S2 等短编号

卖方信息：产品"${seller.productName}"，价值主张"${seller.valueProposition}"，目标客户"${seller.targetCustomer}"${seller.customerProblems.length ? `，已知客户常见问题：${seller.customerProblems.join("、")}` : ""}

输出 JSON 格式：
{
  "opportunities": [{
    "signal": {"value":"公开信号","status":"verified","sourceIds":["S1"]},
    "painPoint": {"value":"具体潜在痛点","status":"inferred","sourceIds":["S1","S2"]},
    "businessImpact": {"value":"业务影响","status":"inferred","sourceIds":[]},
    "productMatch": {"value":"我方能力匹配说明","status":"inferred","sourceIds":[]},
    "validationQuestion": {"value":"销售首次沟通要验证的问题","status":"inferred","sourceIds":[]},
    "confidence": {"value":"中 — 原因说明","status":"inferred","sourceIds":[]}
  }],
  "currentSolutionOrCompetition": {"value":"当前方案/竞争情况，或信息缺口说明","status":"insufficient","sourceIds":[]},
  "overallConfidence": {"value":"低 — 仅有N条业务信号，需沟通验证","status":"inferred","sourceIds":[]}
}`;
}

async function generateOpportunity(
  config: AppConfig, report: SalesReport, input: ResearchInput, sources: Source[],
  ci: CustomerIntelligence, signals: ResearchListItem[],
): Promise<{ oa: OpportunityAnalysis; outcomes: Record<string, StageOutcome>; rejected: RejectedField[] } | null> {
  const referencedSourceIds = referencedIdsFromFields([
    ci.companyOverview,
    ...ci.productsAndServices,
    ci.targetCustomersAndMarket,
    ci.businessModel,
    ci.productPositioning,
    ci.scaleAndCapability,
    ...ci.recentUpdates,
    ...signals,
  ]);
  const evidence = buildSynthesisEvidence(sources, input, referencedSourceIds);
  const payload = {
    industryPreset: input.customIndustry ?? input.preset,
    industryResearchFocus: getPreset(input.preset).researchFocus,
    sellerProfile: {
      productName: input.sellerProfile.productName,
      valueProposition: input.sellerProfile.valueProposition,
      targetCustomer: input.sellerProfile.targetCustomer,
      customerProblems: input.sellerProfile.customerProblems,
    },
    companyFacts: {
      companyOverview: ci.companyOverview.value,
      productsAndServices: ci.productsAndServices.map((p) => p.value),
      targetCustomersAndMarket: ci.targetCustomersAndMarket.value,
      businessModel: ci.businessModel.value,
      productPositioning: ci.productPositioning.value,
      scaleAndCapability: ci.scaleAndCapability.value,
      recentUpdates: ci.recentUpdates.map((u) => u.value),
    },
    signals: signals.map((s) => ({ value: s.value, sourceIds: s.sourceIds })),
    evidence,
  };
  const outcomes: Record<string, StageOutcome> = { opportunity: "failed" };
  const rejected: RejectedField[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await completeJson(config, opportunityPrompt(payload.sellerProfile), payload, 2_200, attempt > 0);
      const parsed = extractJson(raw);
      if (!isRecord(parsed)) continue;

      const oppsRaw = Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 3) : [];
      const opportunities: OpportunityChain[] = oppsRaw.map((o: unknown): OpportunityChain | undefined => {
        if (!isRecord(o)) return undefined;
        const rawSignal = normalizeListItem(o.signal, sources);
        const signal = rawSignal ? sanitizeVerifiedSignal(rawSignal, sources) : undefined;
        if (!signal) return undefined;
        return {
          signal,
          painPoint: normalizeListItem(o.painPoint, sources) ?? { value: "尚未形成足够依据的具体痛点。", status: "insufficient", sourceIds: [] },
          businessImpact: normalizeField(o.businessImpact, sources) ?? insufficientField("未形成明确业务影响判断。"),
          productMatch: buildSafeProductMatch(
            input,
            [ci.companyOverview.value, ...ci.productsAndServices.map((item) => item.value)].filter(Boolean).join(" "),
            signal.sourceIds,
          ),
          validationQuestion: normalizeField(o.validationQuestion, sources) ?? insufficientField("验证问题未生成。"),
          confidence: normalizeField(o.confidence, sources) ?? insufficientField("置信度未评估。"),
        };
      }).filter((o): o is OpportunityChain => Boolean(o));

      const relationshipType = typeof parsed.relationshipType === "string"
        && ["complementary", "replacement", "competitive", "self_built", "unclear"].includes(parsed.relationshipType)
        ? parsed.relationshipType as OpportunityAnalysis["relationshipType"]
        : "unclear";
      const retainedOpportunities = relationshipType === "competitive" || relationshipType === "self_built"
        ? opportunities.filter((item) => /互补|补充|差异化|能力缺口|边界/i.test(item.productMatch.value ?? ""))
        : opportunities;
      const hasOpp = retainedOpportunities.some((o) => o.painPoint.status !== "insufficient");
      const oa: OpportunityAnalysis = {
        relationshipType,
        opportunities: retainedOpportunities,
        currentSolutionOrCompetition: sanitizeAnalyticalField(
          normalizeField(parsed.currentSolutionOrCompetition, sources) ?? insufficientField("当前方案与竞争信息待补充。"),
        ),
        overallConfidence: normalizeField(parsed.overallConfidence, sources) ?? insufficientField("置信度未评估。"),
      };

      // 如果有信号但没产出机会，标记为 partial
      if (signals.length > 0 && retainedOpportunities.length === 0) {
        outcomes.opportunity = "partial";
        return { oa, outcomes, rejected };
      }

      if (!hasOpp && signals.length === 0) {
        // 无信号 = 合理产出 0 机会，成功
        outcomes.opportunity = "success";
        return { oa, outcomes, rejected };
      }

      outcomes.opportunity = "success";
      return { oa, outcomes, rejected };
    } catch (error) {
      if (attempt === 0) console.error("Opportunity generation failed:", error instanceof Error ? error.message : "unknown");
    }
  }
  outcomes.opportunity = "failed";
  return null;
}

// ─── 阶段 3：沟通作战（spec §5.3）───

/**
 * Keeps the opportunity chapter useful even when public sources do not prove a
 * need. The fallback is explicitly low-confidence and framed for discovery;
 * it never claims a current pain point or procurement plan as a fact.
 */
export function ensureDiscoveryOpportunity(
  _input: ResearchInput,
  _ci: CustomerIntelligence,
  oa: OpportunityAnalysis,
): OpportunityAnalysis {
  return oa;
}

export function ensureOpportunityDepth(
  _input: ResearchInput,
  _ci: CustomerIntelligence,
  oa: OpportunityAnalysis,
): OpportunityAnalysis {
  return oa;
}

function needsField(field: ResearchField, minimumLength: number): boolean {
  return field.status === "insufficient" || !field.value || field.value.trim().length < minimumLength;
}

export function ensureConversationDepth(
  input: ResearchInput,
  ci: CustomerIntelligence,
  oa: OpportunityAnalysis,
  cp: ConversationPlan,
): ConversationPlan {
  const productName = input.sellerProfile.productName;
  const value = withoutTerminalPunctuation(
    input.sellerProfile.valueProposition || `围绕${productName}提供可验证的效率、质量或业务改进能力`,
  );
  const context = ci.recentUpdates[0] ?? ci.productsAndServices[0];
  const sourceIds = context?.sourceIds ?? ci.companyOverview.sourceIds;
  const contextText = conciseEvidenceContext(context?.value ?? ci.companyOverview.value) || "贵司公开业务信息";
  const quotedContext = /[。！？!?]$/u.test(contextText)
    ? `“${contextText}”`
    : `“${contextText}”。`;
  const topOpportunity = oa.opportunities[0];

  return {
    recommendedContact: needsField(cp.recommendedContact, 12)
      ? inferredField(`建议优先联系与${productName}应用场景直接相关的业务负责人、技术负责人或产品负责人；如涉及采购决策，再同步采购负责人。`, sourceIds)
      : cp.recommendedContact,
    communicationGoal: needsField(cp.communicationGoal, 24)
      ? inferredField(`确认贵司在${productName}相关场景中的现有流程、关键指标、技术边界、决策角色和试点条件。`, sourceIds)
      : cp.communicationGoal,
    opening30s: needsField(cp.opening30s, 60)
      ? inferredField(
          `我们关注到贵司公开资料提到${quotedContext}我们提供${productName}，希望先了解这一业务场景目前的流程、规模和评价指标，判断是否存在一个范围可控、结果可衡量的试点切入点。`,
          sourceIds,
        )
      : cp.opening30s,
    valueBridge: needsField(cp.valueBridge, 36)
      ? inferredField(
          `${value}。如果贵司当前确实存在${topOpportunity?.painPoint.value ?? "效率、质量、交付或成本方面的改进目标"}，可先围绕一个具体场景核对技术与业务条件，再决定是否进入验证。`,
          sourceIds,
        )
      : cp.valueBridge,
    discoveryQuestions: cp.discoveryQuestions.length >= 3
      ? cp.discoveryQuestions
      : [
          { question: `目前与${productName}相关的业务流程由哪些团队、系统或供应商共同完成？`, purpose: "了解现状、责任链和现有方案边界。" },
          { question: "当前最希望改善的指标是什么，基线数据和目标值分别是多少？", purpose: "确认痛点优先级和可量化的业务价值。" },
          { question: "评估新方案时必须满足哪些技术、质量、合规和供应商准入条件？", purpose: "确认不可妥协的验证门槛与决策标准。" },
          { question: "如果开展小范围试点，最适合从哪个场景开始，谁负责验收结果？", purpose: "明确试点范围、责任人和推进路径。" },
        ],
    objectionResponses: cp.objectionResponses.length
      ? cp.objectionResponses
      : [
          inferredListItem("如客户担心效果不确定，可先限定单一业务场景和评价指标，用可量化的验证结果决定是否继续。"),
          inferredListItem("如客户已有内部方案或外部服务，可将沟通定位为补充能力评估，先比较能力边界、接口、成本和运维方式，不预设替换。"),
        ],
    proofMaterials: cp.proofMaterials,
    nextStep: needsField(cp.nextStep, 24)
      ? inferredField(`由双方业务与技术负责人安排一次需求访谈，确认${productName}的应用场景、关键指标、验证资料和试点范围。`, sourceIds)
      : cp.nextStep,
    avoidTopics: cp.avoidTopics.length
      ? cp.avoidTopics
      : ["不把公开业务信息表述为已经确认的内部痛点、预算或采购计划。"],
  };
}

function conversationPrompt(seller: { productName: string; valueProposition: string; targetCustomer: string; proofPoints: string[]; callToAction: string }): string {
  return `你是 B2B 销售顾问。仅基于 companyFacts、opportunities 和 evidence 输出完整中文 JSON，不输出解释。
若存在高/中置信机会，开场必须引用客户公开信号并自然连接卖方产品；若没有直接机会，必须明确这是探索性沟通，不得暗示客户已有采购需求。
生成 3-5 个具体发现问题、异议回应方向、需要准备的证明材料、下一步和禁忌假设。
只能使用 sellerProfile 明确提供的卖方能力和 proofPoints。proofPoints 为空时，禁止声称已适配某设备、已通过兼容性测试、拥有认证/检测报告或成功客户案例。
不得复制 companyFacts 的整段原文；开场只引用与本次沟通最相关的一至两条完整事实句。
返回 {"conversationPlan":{"recommendedContact":{"value":"建议角色","status":"inferred","sourceIds":[]},"communicationGoal":{"value":"沟通目标","status":"inferred","sourceIds":[]},"opening30s":{"value":"30秒开场","status":"inferred","sourceIds":[]},"valueBridge":{"value":"价值连接或不匹配边界","status":"inferred","sourceIds":[]},"discoveryQuestions":[{"question":"具体问题","purpose":"验证什么"}],"objectionResponses":[{"value":"回应方向","status":"inferred","sourceIds":[]}],"proofMaterials":[],"nextStep":{"value":"下一步","status":"inferred","sourceIds":[]},"avoidTopics":["未经验证的假设"]}}。
卖方产品：${seller.productName}；价值：${seller.valueProposition}；目标客户：${seller.targetCustomer}；行动：${seller.callToAction}。`;
  return `你是 B2B 售前话术顾问。基于已核验的公司事实和机会分析，生成中文销售沟通计划。只输出 JSON。

**规则：**
- 开场话术必须结合客户公开信号和卖方产品"${seller.productName}"，自然引出价值主张
- 推荐联系对象基于业务性质和决策链推断
- 发现型问题 3-5 个，每个带提问目的
- 异议回应只写方向，不编造客户异议
- 沟通禁区至少列最关键风险
- 下一步明确责任人与动作
- sourceIds 只能用 S1/S2 等短编号

卖方产品：${seller.productName}（价值主张：${seller.valueProposition}）
沟通目标：${seller.callToAction}${seller.proofPoints.length ? `\n可引用证明材料：${seller.proofPoints.join("、")}` : ""}

输出 JSON 格式：
{
  "conversationPlan": {
    "recommendedContact": {"value":"推荐联系的角色及理由","status":"inferred","sourceIds":["S1"]},
    "communicationGoal": {"value":"第一次沟通要验证的目标","status":"inferred","sourceIds":[]},
    "opening30s": {"value":"30秒可直接使用的电话开场话术","status":"verified","sourceIds":["S1"]},
    "valueBridge": {"value":"价值表达：客户信号→我方能力","status":"inferred","sourceIds":["S1"]},
    "discoveryQuestions": [{"question":"具体问题","purpose":"要确认的业务事实"}],
    "objectionResponses": [{"value":"异议回应方向","status":"inferred","sourceIds":[]}],
    "nextStep": {"value":"明确下一步","status":"inferred","sourceIds":[]},
    "avoidTopics": ["最重要风险或不能假定的内容"]
  }
}`;
}

async function generateConversation(
  config: AppConfig, report: SalesReport, input: ResearchInput, sources: Source[],
  ci: CustomerIntelligence, oa: OpportunityAnalysis,
): Promise<{ cp: ConversationPlan; outcomes: Record<string, StageOutcome>; rejected: RejectedField[] } | null> {
  const referencedSourceIds = referencedIdsFromFields([
    ci.companyOverview,
    ...ci.productsAndServices,
    ci.targetCustomersAndMarket,
    ci.businessModel,
    ci.productPositioning,
    ci.scaleAndCapability,
    ...ci.recentUpdates,
    ...oa.opportunities.flatMap((item) => [
      item.signal,
      item.painPoint,
      item.businessImpact,
      item.productMatch,
      item.validationQuestion,
      item.confidence,
    ]),
    oa.currentSolutionOrCompetition,
    oa.overallConfidence,
  ]);
  const evidence = buildSynthesisEvidence(sources, input, referencedSourceIds);
  const payload = {
    sellerProfile: {
      productName: input.sellerProfile.productName,
      valueProposition: input.sellerProfile.valueProposition,
      targetCustomer: input.sellerProfile.targetCustomer,
      proofPoints: input.sellerProfile.proofPoints,
      callToAction: input.sellerProfile.callToAction,
    },
    companyFacts: {
      companyOverview: ci.companyOverview.value,
      productsAndServices: ci.productsAndServices.map((item) => item.value),
      targetCustomersAndMarket: ci.targetCustomersAndMarket.value,
      businessModel: ci.businessModel.value,
      productPositioning: ci.productPositioning.value,
      scaleAndCapability: ci.scaleAndCapability.value,
      recentUpdates: ci.recentUpdates.map((item) => item.value),
    },
    opportunities: oa.opportunities.map((o) => ({
      signal: o.signal.value,
      painPoint: o.painPoint.value,
      productMatch: o.productMatch.value,
      validationQuestion: o.validationQuestion.value,
      confidence: o.confidence.value,
    })),
    overallFit: oa.overallConfidence.value,
    evidence,
  };
  const outcomes: Record<string, StageOutcome> = { conversation: "failed" };
  const rejected: RejectedField[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await completeJson(config, conversationPrompt(payload.sellerProfile), payload, 1_800, attempt > 0);
      const parsed = extractJson(raw);
      const cpRaw = isRecord(parsed?.conversationPlan) ? parsed.conversationPlan : undefined;
      if (!cpRaw) continue;

      const questions = Array.isArray(cpRaw.discoveryQuestions)
        ? cpRaw.discoveryQuestions.map((q: unknown) => {
            if (!isRecord(q)) return undefined;
            const question = readableText(q.question); const purpose = readableText(q.purpose);
            return question && purpose ? { question, purpose } : undefined;
          }).filter((q): q is { question: string; purpose: string } => Boolean(q)).slice(0, 5)
        : [];

      const cp: ConversationPlan = {
        recommendedContact: normalizeField(cpRaw.recommendedContact, sources) ?? insufficientField("未形成明确的推荐联系对象。"),
        communicationGoal: normalizeField(cpRaw.communicationGoal, sources) ?? inferredField("验证公开信号与销售方产品之间是否存在真实业务机会。", []),
        opening30s: normalizeField(cpRaw.opening30s, sources) ?? insufficientField("开场话术未生成。"),
        valueBridge: normalizeField(cpRaw.valueBridge, sources)
          ?? inferredField(
            `我方提供${input.sellerProfile.productName}${input.sellerProfile.valueProposition ? `，核心价值是${input.sellerProfile.valueProposition}` : ""}。首次沟通应先核对客户当前方案、能力缺口和评价指标，再判断双方能力是互补、替代还是存在竞争。`,
            [],
          ),
        discoveryQuestions: questions,
        objectionResponses: normalizeList(cpRaw.objectionResponses, sources, 3).length
          ? normalizeList(cpRaw.objectionResponses, sources, 3)
          : [
              inferredListItem("如客户担心效果不确定，可先约定一个边界清晰的业务场景和量化评价指标，再根据验证结果决定是否继续。"),
              inferredListItem("如客户已有内部方案或外部服务，可先比较能力边界、接口、成本和运维方式，不预设替换现有方案。"),
            ],
        proofMaterials: [],
        nextStep: normalizeField(cpRaw.nextStep, sources) ?? inferredField(input.sellerProfile.callToAction, []),
        avoidTopics: Array.isArray(cpRaw.avoidTopics) ? cpRaw.avoidTopics.filter((a: unknown): a is string => typeof a === "string").slice(0, 3) : [],
      };

      // 开场话术与产品关联校验
      const hasOpening = cp.opening30s.status !== "insufficient";
      const openingLinked = hasOpening && cp.opening30s.value!.includes(input.sellerProfile.productName);
      if (!openingLinked && hasOpening) {
        rejected.push({ field: "opening30s", reason: "未关联销售方产品" });
      }

      const hasAnyContent = hasOpening || questions.length > 0 || cp.valueBridge.status !== "insufficient";
      if (!hasAnyContent) continue;

      outcomes.conversation = "success";
      return { cp, outcomes, rejected };
    } catch (error) {
      if (attempt === 0) console.error("Conversation generation failed:", error instanceof Error ? error.message : "unknown");
    }
  }
  outcomes.conversation = "failed";
  return null;
}

// ─── 规范化工具 ───

function normalizeField(raw: unknown, sources: Source[]): ResearchField | undefined {
  if (!isRecord(raw)) return undefined;
  const value = readableText(raw.value);
  if (!value) return undefined;
  const status: ResearchField["status"] = (raw.status === "verified" || raw.status === "inferred" || raw.status === "insufficient" || raw.status === "conflicting")
    ? raw.status : "verified";
  const sourceIds = validSourceIds(raw.sourceIds, sources) ?? [];
  return { value, status, sourceIds };
}

function normalizeListItem(raw: unknown, sources: Source[]): ResearchListItem | undefined {
  if (!isRecord(raw)) return undefined;
  const value = readableText(raw.value);
  if (!value) return undefined;
  const status: ResearchListItem["status"] = (raw.status === "verified" || raw.status === "inferred" || raw.status === "insufficient" || raw.status === "conflicting")
    ? raw.status : "verified";
  const sourceIds = validSourceIds(raw.sourceIds, sources) ?? [];
  return { value, status, sourceIds };
}

function normalizeList(raw: unknown, sources: Source[], limit: number): ResearchListItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeListItem(item, sources)).filter((i): i is ResearchListItem => Boolean(i)).slice(0, limit);
}

function normalizeFactField(raw: unknown, sources: Source[]): ResearchField | undefined {
  const field = normalizeField(raw, sources);
  return field?.value && isCompleteResearchStatement(field.value) ? field : undefined;
}

function normalizeFactList(raw: unknown, sources: Source[], limit: number): ResearchListItem[] {
  return normalizeList(raw, sources, limit).filter((item) => isCompleteResearchStatement(item.value));
}

function collectGaps(ciRaw: JsonRecord): string[] {
  const gaps: string[] = [];
  if (!ciRaw.companyOverview || (ciRaw.companyOverview as ResearchField).status === "insufficient") gaps.push("公司介绍");
  if (!ciRaw.productsAndServices || !Array.isArray(ciRaw.productsAndServices) || (ciRaw.productsAndServices as unknown[]).length === 0) gaps.push("产品与服务");
  if (!ciRaw.targetCustomersAndMarket || (ciRaw.targetCustomersAndMarket as ResearchField).status === "insufficient") gaps.push("目标客户与市场");
  if (!ciRaw.businessModel || (ciRaw.businessModel as ResearchField).status === "insufficient") gaps.push("商业模式");
  if (!ciRaw.productPositioning || (ciRaw.productPositioning as ResearchField).status === "insufficient") gaps.push("产品定位");
  if (!ciRaw.scaleAndCapability || (ciRaw.scaleAndCapability as ResearchField).status === "insufficient") gaps.push("规模与能力");
  if (!ciRaw.recentUpdates || !Array.isArray(ciRaw.recentUpdates) || (ciRaw.recentUpdates as unknown[]).length === 0) gaps.push("近期动态");
  return gaps;
}

// ─── 汇总 SalesVerdict ───

function synthesizeVerdict(
  input: ResearchInput,
  ci: CustomerIntelligence,
  oa: OpportunityAnalysis,
  cp: ConversationPlan,
  signals: ResearchListItem[],
): SalesVerdict {
  const hasSignals = signals.length > 0;
  const hasOpportunities = oa.opportunities.length > 0;
  const overlappingSolution = oa.relationshipType === "competitive" || oa.relationshipType === "self_built";

  const topSignal = signals[0];
  const topOpp = oa.opportunities[0];
  const evidenceAnchor = withoutTerminalPunctuation(conciseEvidenceContext(
    topSignal?.value
      ?? ci.productsAndServices[0]?.value
      ?? ci.companyOverview.value
      ?? "客户官网展示的主营业务",
  ).slice(0, 180));
  const concreteOpportunity = hasSignals
    ? `已从${signals.length}条客户业务信号中识别出“${evidenceAnchor}”；围绕${input.sellerProfile.productName}，首轮应核对相关业务流程、现有方案、技术接口和采购条件。`
    : `客户官网已展示“${evidenceAnchor}”；围绕${input.sellerProfile.productName}，首轮应核对相关业务流程、现有方案、技术接口和采购条件。`;

  return {
    contactSuggestion: hasOpportunities
      ? inferredField(`建议联系：已发现与${input.sellerProfile.productName}直接相关的可验证信号，可据此开展需求确认。`, topOpp!.signal.sourceIds)
      : inferredField(`建议先联系与${input.sellerProfile.productName}应用场景相关的业务、产品或技术负责人，核对现有方案与采购边界。`, topSignal?.sourceIds ?? ci.companyOverview.sourceIds),
    recommendationReason: hasOpportunities && topOpp
      ? inferredField("已根据公开业务信号形成首轮联系切入点；潜在痛点、采购计划和决策条件仍需通过首次沟通确认。", topOpp.signal.sourceIds)
      : inferredField(
            overlappingSolution
            ? `已识别目标公司存在与${input.sellerProfile.productName}相近的自研或现有能力；首轮应核对系统边界、接口和明确的互补缺口，再决定推进方式。`
            : concreteOpportunity,
          oa.currentSolutionOrCompetition.sourceIds.length ? oa.currentSolutionOrCompetition.sourceIds : topSignal?.sourceIds ?? [],
        ),
    keyCustomerSignals: signals.slice(0, 3),
    priorityContactRole: cp.recommendedContact.status !== "insufficient" ? cp.recommendedContact : inferredField("根据客户业务性质，建议优先联系业务、产品或技术负责人；确认存在外采需求后再同步采购负责人。", []),
    priorityOpportunity: hasOpportunities && topOpp?.painPoint.value
      ? { value: topOpp.painPoint.value, status: "inferred", sourceIds: topOpp.painPoint.sourceIds }
      : inferredField(concreteOpportunity, topSignal?.sourceIds ?? ci.productsAndServices[0]?.sourceIds ?? []),
    recommendedNextStep: cp.nextStep.status !== "insufficient" ? cp.nextStep : inferredField(input.sellerProfile.callToAction, []),
  };
}

type SemanticQualityIssue = {
  code: string;
  field: string;
  detail: string;
};

async function judgeSemanticQuality(
  config: AppConfig,
  input: ResearchInput,
  report: SalesReport,
  sources: Source[],
): Promise<{ passed: boolean; issues: SemanticQualityIssue[] } | undefined> {
  const referencedSourceIds = referencedIdsFromFields([
    report.salesVerdict.contactSuggestion,
    report.salesVerdict.recommendationReason,
    ...report.salesVerdict.keyCustomerSignals,
    report.salesVerdict.priorityContactRole,
    report.salesVerdict.priorityOpportunity,
    report.salesVerdict.recommendedNextStep,
    report.customerIntelligence.companyOverview,
    ...report.customerIntelligence.productsAndServices,
    report.customerIntelligence.targetCustomersAndMarket,
    report.customerIntelligence.businessModel,
    report.customerIntelligence.productPositioning,
    report.customerIntelligence.scaleAndCapability,
    ...report.customerIntelligence.recentUpdates,
  ]);
  const evidence = buildSynthesisEvidence(sources, input, referencedSourceIds).map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    sourceType: item.sourceType,
    publishedAt: item.publishedAt,
    excerpt: item.excerpt.slice(0, 420),
  }));
  const system = `你是销售调研报告的最终质量审计员。只输出 JSON，不改写报告。
逐项检查：
1. 公司概况是否真的是公司介绍，而不是某个具体产品、OCR、菜单或招聘页面；
2. 产品匹配和机会是否与卖方产品直接相关，是否有公开信号支撑；
3. 客户已有自研/同类能力时，报告是否仍错误建议直接销售；
4. 是否混入其他行业模板（如包材、食品安全、产线、样品、小批量测试）；
5. 近期动态是否有日期且来自新闻/公告来源；
6. 联系方式是否像编号、截断邮箱或被传真/网址污染；
7. 是否存在结论互相矛盾、空泛套话或把推测写成事实。
只有影响销售判断真实性或可用性的缺陷才列为 issue。返回：
{"passed":true/false,"issues":[{"code":"relevance|grounding|contradiction|template_pollution|recent_update|contact|specificity","field":"字段路径","detail":"中文原因"}]}`;
  const payload = {
    sellerProduct: input.sellerProfile.productName,
    industry: input.customIndustry ?? input.preset,
    report: {
      salesVerdict: report.salesVerdict,
      customerIntelligence: report.customerIntelligence,
      opportunityAnalysis: report.opportunityAnalysis,
      conversationPlan: report.conversationPlan,
      contactIntelligence: report.contactIntelligence,
    },
    evidence,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await completeJson(config, system, payload, 1_400, attempt > 0);
      const parsed = extractJson(raw);
      if (!parsed) continue;
      const issues = Array.isArray(parsed.issues)
        ? parsed.issues.map((item): SemanticQualityIssue | undefined => {
            if (!isRecord(item)) return undefined;
            const code = typeof item.code === "string" ? item.code.slice(0, 40) : "";
            const field = typeof item.field === "string" ? item.field.slice(0, 100) : "";
            const detail = readableText(item.detail);
            return code && field && detail ? { code, field, detail } : undefined;
          }).filter((item): item is SemanticQualityIssue => Boolean(item)).slice(0, 10)
        : [];
      return { passed: parsed.passed === true && issues.length === 0, issues };
    } catch (error) {
      if (attempt === 1) {
        console.error("Semantic quality review failed:", error instanceof Error ? error.message : "unknown");
      }
    }
  }
  return undefined;
}

// ─── 3 阶段增强主流程（spec §5）───

export async function enhanceWithLlm(
  report: SalesReport,
  input: ResearchInput,
  sources: Source[],
  config: AppConfig,
  preExtracted?: SourceFactExtractionResult,
  options: { stages?: readonly ReportGenerationStage[] } = {},
): Promise<SalesReport> {
  sources = dedupeSources(sources);
  const stages = new Set<ReportGenerationStage>(
    options.stages ?? ["facts", "opportunity", "conversation", "quality_review"],
  );
  if (!config.OPENAI_API_KEY) {
    const extraction = preExtracted ?? await extractSourceFactBundles(config, input, sources);
    const merged = mergeSourceFactBundles(extraction.bundles, sources);
    const opportunityAnalysis = ensureDiscoveryOpportunity(input, merged.customerIntelligence, report.opportunityAnalysis);
    return normalizeSalesReportAudit({
      ...report,
      reportMeta: { ...report.reportMeta, status: "仅采集" },
      customerIntelligence: merged.customerIntelligence,
      opportunityAnalysis,
      salesVerdict: synthesizeVerdict(input, merged.customerIntelligence, opportunityAnalysis, report.conversationPlan, merged.signals),
      qualityAudit: {
        ...(report.qualityAudit ?? { directSourceCount: 0, firecrawlBaseSourceCount: 0, firecrawlGapSourceCount: 0, evidencePerCategory: {}, filteredSources: [], fieldStatuses: {}, stageOutcomes: {}, rejectedFields: [], minimumStandardMet: false, missingFields: [] }),
        stageOutcomes: { ...(report.qualityAudit?.stageOutcomes ?? {}), ...extraction.outcomes },
        rejectedFields: [...(report.qualityAudit?.rejectedFields ?? []), ...extraction.rejected],
      },
      sources,
      collectionNotes: [...report.collectionNotes, "未配置中文研究模型，当前仅保留已采集来源。"],
      mainReferenceLinks: sources.slice(0, 5).map((source) => ({ title: source.title, url: source.url })),
    });
  }

  const qualityAudit: QualityAudit = report.qualityAudit ?? { directSourceCount: 0, firecrawlBaseSourceCount: 0, firecrawlGapSourceCount: 0, evidencePerCategory: {}, filteredSources: [], fieldStatuses: {}, stageOutcomes: {}, rejectedFields: [], minimumStandardMet: false, missingFields: [] };
  let llmCalls = report.metrics.llmCalls;

  // ── 阶段 1：事实抽取 ──
  let ci: CustomerIntelligence = report.customerIntelligence;
  let contacts: ContactIntelligence = report.contactIntelligence ?? { channels: [], publicContacts: [] };
  let signals: ResearchListItem[] = report.salesVerdict.keyCustomerSignals ?? [];
  const factsStartedAt = Date.now();
  const factsResult = stages.has("facts")
    ? await generateFacts(config, report, input, sources, preExtracted)
    : null;
  if (stages.has("facts")) {
    llmCalls += 1;
    console.info(JSON.stringify({ event: "research_stage_timing", stage: "facts", durationMs: Date.now() - factsStartedAt }));
  }

  if (factsResult) {
    ci = factsResult.ci;
    contacts = factsResult.contacts;
    signals = factsResult.signals;
    qualityAudit.stageOutcomes = { ...qualityAudit.stageOutcomes, ...factsResult.outcomes };
    qualityAudit.rejectedFields = [...qualityAudit.rejectedFields, ...factsResult.rejected];
  } else if (stages.has("facts")) {
    // A failed facts pass does not erase an already populated customer profile.
    // Repair passes re-run a single stage; if the model round trips all fail but
    // the report still carries usable intelligence from a prior pass, keep it
    // and mark the stage partial so checkMinimum does not doom the whole report.
    const hasPriorCi = report.customerIntelligence.companyOverview.status !== "insufficient"
      || report.customerIntelligence.productsAndServices.length > 0
      || (report.salesVerdict.keyCustomerSignals?.length ?? 0) > 0;
    qualityAudit.stageOutcomes.facts = hasPriorCi ? "partial" : "failed";
  }

  const directlyExtractedContacts = extractVerifiedContactsFromSources(sources, input.targetUrl);
  contacts = normalizeContactIntelligence({
    channels: [...contacts.channels, ...directlyExtractedContacts.channels],
    publicContacts: [...contacts.publicContacts, ...directlyExtractedContacts.publicContacts],
  }, sources, input.targetUrl);

  // ── 阶段 2：机会分析 ──
  let oa: OpportunityAnalysis = report.opportunityAnalysis;
  const opportunityStartedAt = Date.now();
  const oppResult = stages.has("opportunity")
    ? await generateOpportunity(config, report, input, sources, ci, signals)
    : null;
  if (stages.has("opportunity")) {
    llmCalls += 1;
    console.info(JSON.stringify({ event: "research_stage_timing", stage: "opportunity", durationMs: Date.now() - opportunityStartedAt }));
  }

  if (oppResult) {
    oa = oppResult.oa;
    qualityAudit.stageOutcomes = { ...qualityAudit.stageOutcomes, ...oppResult.outcomes };
    qualityAudit.rejectedFields = [...qualityAudit.rejectedFields, ...oppResult.rejected];
  } else if (stages.has("opportunity")) {
    // When the model round-trips all fail but we still have enough signals and
    // company facts to produce a useful (even if negative) recommendation, mark
    // the stage partial instead of failed. A "暂不建议推销" verdict backed by
    // real signals IS a valid outcome — it prevents a sales rep from wasting
    // time on the wrong account. Only hard-fail when there is truly nothing.
    const hasPriorOa = report.opportunityAnalysis.opportunities.length > 0
      || report.opportunityAnalysis.currentSolutionOrCompetition.status !== "insufficient";
    const hasSignals = signals.length > 0;
    const hasFacts = ci.companyOverview.status !== "insufficient" || ci.productsAndServices.length > 0;
    qualityAudit.stageOutcomes.opportunity = (hasPriorOa || (hasSignals && hasFacts)) ? "partial" : "failed";
  }

  // ── 阶段 3：沟通作战 ──
  oa = ensureOpportunityDepth(input, ci, oa);
  if (!oppResult && oa.opportunities.length >= 2) {
    qualityAudit.stageOutcomes.opportunity = "partial";
  }

  let cp: ConversationPlan = report.conversationPlan;
  const conversationStartedAt = Date.now();
  const convResult = stages.has("conversation")
    ? await generateConversation(config, report, input, sources, ci, oa)
    : null;
  if (stages.has("conversation")) {
    llmCalls += 1;
    console.info(JSON.stringify({ event: "research_stage_timing", stage: "conversation", durationMs: Date.now() - conversationStartedAt }));
  }

  if (convResult) {
    cp = convResult.cp;
    qualityAudit.stageOutcomes = { ...qualityAudit.stageOutcomes, ...convResult.outcomes };
    qualityAudit.rejectedFields = [...qualityAudit.rejectedFields, ...convResult.rejected];
  } else if (stages.has("conversation")) {
    // Same logic as opportunity: if we can still produce a useful conversation
    // plan (even with fallback questions) backed by facts and signals, mark
    // partial rather than failed so the report is deliverable.
    const hasPriorCp = report.conversationPlan.discoveryQuestions.length > 0
      || report.conversationPlan.opening30s.status !== "insufficient"
      || report.conversationPlan.valueBridge.status !== "insufficient";
    const hasFactsOrOpps = ci.companyOverview.status !== "insufficient"
      || ci.productsAndServices.length > 0
      || oa.opportunities.length > 0;
    qualityAudit.stageOutcomes.conversation = (hasPriorCp || hasFactsOrOpps) ? "partial" : "failed";
  }
  cp = ensureConversationDepth(input, ci, oa, cp);
  if (!convResult && cp.discoveryQuestions.length >= 3) {
    qualityAudit.stageOutcomes.conversation = "partial";
  }

  // ── 汇总 SalesVerdict ──
  const salesVerdict = synthesizeVerdict(input, ci, oa, cp, signals);

  // ── 检查信息缺口 ──
  const allGaps: string[] = [];
  if (ci.companyOverview.status === "insufficient") allGaps.push("公司介绍");
  if (ci.productsAndServices.length === 0) allGaps.push("产品与服务");
  if (ci.businessModel.status === "insufficient") allGaps.push("商业模式");
  if (ci.productPositioning.status === "insufficient") allGaps.push("产品定位");
  if (ci.scaleAndCapability.status === "insufficient") allGaps.push("规模与能力");
  if (ci.recentUpdates.length === 0) allGaps.push("近期动态");

  // ── 状态记录 ──
  const fieldStatuses: Record<string, FieldStatus> = {};
  for (const [key, val] of Object.entries(ci)) {
    if (val && typeof val === "object" && "status" in val) {
      const status = (val as ResearchField).status;
      if (status) fieldStatuses[`ci.${key}`] = status;
    }
  }
  for (let i = 0; i < oa.opportunities.length; i++) {
    if (oa.opportunities[i]) {
      fieldStatuses[`oa.opp[${i}].signal`] = oa.opportunities[i]!.signal.status;
      fieldStatuses[`oa.opp[${i}].painPoint`] = oa.opportunities[i]!.painPoint.status;
    }
  }

  let candidateReport: SalesReport = {
    ...report,
    salesVerdict,
    contactIntelligence: contacts,
    customerIntelligence: { ...ci, informationGaps: allGaps },
    opportunityAnalysis: oa,
    conversationPlan: cp,
    qualityAudit: { ...qualityAudit, fieldStatuses },
    sources,
  };
  if (stages.has("quality_review")) {
    const qualityStartedAt = Date.now();
    const semanticReview = await judgeSemanticQuality(config, input, candidateReport, sources);
    llmCalls += 1;
    console.info(JSON.stringify({ event: "research_stage_timing", stage: "quality_review", durationMs: Date.now() - qualityStartedAt }));
    qualityAudit.rejectedFields = qualityAudit.rejectedFields.filter(
      (item) => !item.field.startsWith("qualityJudge."),
    );
    if (semanticReview) {
      qualityAudit.stageOutcomes.quality_review = semanticReview.passed ? "success" : "failed";
      qualityAudit.rejectedFields = [
        ...qualityAudit.rejectedFields,
        ...semanticReview.issues.map((issue) => ({
          field: `qualityJudge.${issue.code}.${issue.field}`,
          reason: issue.detail,
        })),
      ];
    } else {
      qualityAudit.stageOutcomes.quality_review = "partial";
    }
  }
  candidateReport = {
    ...candidateReport,
    qualityAudit: { ...qualityAudit, fieldStatuses },
    metrics: { ...candidateReport.metrics, llmCalls },
  };
  const minimum = checkMinimum(candidateReport);
  const minimumStandardMet = minimum.passed;
  const reportStatus = minimum.passed ? "达标" : "未达标";

  return normalizeSalesReportAudit({
    reportMeta: { ...report.reportMeta, status: reportStatus },
    salesVerdict,
    contactIntelligence: contacts,
    customerIntelligence: { ...ci, informationGaps: allGaps },
    opportunityAnalysis: oa,
    conversationPlan: cp,
    qualityAudit: {
      ...qualityAudit,
      fieldStatuses,
      minimumStandardMet,
      missingFields: [...new Set([...allGaps, ...minimum.missing])],
    },
    coverage: report.coverage,
    metrics: { ...report.metrics, llmCalls },
    sources,
    collectionNotes: [...new Set([
      ...report.collectionNotes,
      `模型分阶段整理完成，状态：${reportStatus}。`,
    ])].slice(0, 10),
    mainReferenceLinks: [...new Map(sources.map((s) => [s.url, s])).values()].slice(0, 5).map((s) => ({ title: s.title, url: s.url })),
  });
}
