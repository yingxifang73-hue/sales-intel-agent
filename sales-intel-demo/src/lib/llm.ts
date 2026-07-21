import OpenAI from "openai";
import type { AppConfig } from "@/lib/config";
import { isReadableChinese, sanitizeChineseOutput, selectEvidenceExcerpts } from "@/lib/evidence";
import type { Battlecard, ResearchInput } from "@/lib/types";

type JsonRecord = Record<string, unknown>;
type CompanyResearchPatch = Pick<Battlecard, "companyOverview" | "companyAnalysis">;
type SalesStrategyPatch = Pick<Battlecard, "salesStrategy">;
type CitedText = Battlecard["overview"];
type PainHypothesis = Battlecard["painHypotheses"][number];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractJson(raw: string): JsonRecord | undefined {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(fenced.slice(start, end + 1));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function validSourceIds(value: unknown, card: Battlecard): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const known = new Set(card.sources.map((source) => source.id));
  const ids = value.filter((id): id is string => typeof id === "string" && known.has(id));
  return ids.length ? [...new Set(ids)].slice(0, 5) : undefined;
}

function readableText(value: unknown): string | undefined {
  if (typeof value !== "string" || /&(?:#x?[0-9a-f]+|[a-z][a-z0-9]+);/i.test(value)) return undefined;
  const text = sanitizeChineseOutput(value);
  return isReadableChinese(text) ? text : undefined;
}

function normalizeCited(value: unknown, card: Battlecard): CitedText | undefined {
  if (!isRecord(value)) return undefined;
  const text = readableText(value.text);
  const sourceIds = validSourceIds(value.sourceIds, card);
  return text && sourceIds ? { text, sourceIds } : undefined;
}

function normalizeCitedList(value: unknown, card: Battlecard): CitedText[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => normalizeCited(item, card)).filter((item): item is CitedText => Boolean(item)).slice(0, 3);
  return items.length ? items : undefined;
}

function strategyEvidenceIds(card: Battlecard): string[] {
  return [...new Set([
    ...card.companyOverview.companyIntroduction.sourceIds,
    ...card.companyOverview.productsAndServices.flatMap((item) => item.sourceIds),
    ...card.companyOverview.recentUpdates.flatMap((item) => item.sourceIds),
    ...card.companyAnalysis.painHypotheses.flatMap((item) => item.sourceIds),
  ])].slice(0, 3);
}

function normalizeStrategyCited(value: unknown, card: Battlecard, fallbackSourceIds: string[]): CitedText | undefined {
  const cited = normalizeCited(value, card);
  if (cited) return cited;
  const direct = readableText(value);
  if (direct && fallbackSourceIds.length) return { text: direct, sourceIds: fallbackSourceIds };
  if (!isRecord(value) || !fallbackSourceIds.length) return undefined;
  const parts = Object.entries(value)
    .filter(([key]) => key !== "sourceIds")
    .map(([, item]) => readableText(item))
    .filter((item): item is string => Boolean(item));
  if (!parts.length) return undefined;
  return { text: parts.join("；"), sourceIds: fallbackSourceIds };
}

function normalizeStrategyCitedList(value: unknown, card: Battlecard, fallbackSourceIds: string[]): CitedText[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => normalizeStrategyCited(item, card, fallbackSourceIds))
    .filter((item): item is CitedText => Boolean(item))
    .slice(0, 3);
  return items.length ? items : undefined;
}

function normalizeCompetitionObservation(value: unknown, card: Battlecard, fallbackSourceIds: string[]): CitedText | undefined {
  const cited = normalizeCited(value, card);
  if (cited) return cited;
  if (!isRecord(value)) return undefined;
  const text = readableText(value.text);
  if (!text || !/(?:资料|证据|信息).{0,12}(?:不足|有限|未提及|未出现|无法确认)|建议.{0,8}验证/.test(text)) return undefined;
  return {
    text: `${text.replace(/[。；;\s]+$/, "")}。该项属于信息缺口，不将具体竞品或竞争结论当作已证实事实。`,
    sourceIds: fallbackSourceIds.slice(0, 2),
  };
}

function normalizePain(value: unknown, card: Battlecard): PainHypothesis | undefined {
  if (!isRecord(value)) return undefined;
  const cited = normalizeCited(value, card);
  const businessImpact = readableText(value.businessImpact);
  const validationQuestion = readableText(value.validationQuestion);
  const confidenceLabel = value.confidenceLabel === "高" || value.confidenceLabel === "中" || value.confidenceLabel === "低" ? value.confidenceLabel : "低";
  return cited && businessImpact && validationQuestion ? { ...cited, businessImpact, validationQuestion, confidenceLabel } : undefined;
}

export function normalizeCompanyResearch(raw: string, card: Battlecard): CompanyResearchPatch | undefined {
  const parsed = extractJson(raw);
  const overview = isRecord(parsed?.companyOverview) ? parsed.companyOverview : undefined;
  const analysis = isRecord(parsed?.companyAnalysis) ? parsed.companyAnalysis : undefined;
  if (!overview || !analysis) return undefined;

  const companyIntroduction = normalizeCited(overview.companyIntroduction, card);
  const productsAndServices = normalizeCitedList(overview.productsAndServices, card);
  const industryAndCoverage = normalizeCited(overview.industryAndCoverage, card);
  const recentUpdates = normalizeCitedList(overview.recentUpdates, card);
  const businessModel = normalizeCited(analysis.businessModel, card);
  const productPositioning = normalizeCited(analysis.productPositioning, card);
  const targetCustomers = normalizeCited(analysis.targetCustomers, card);
  const competitionObservation = normalizeCompetitionObservation(
    analysis.competitionObservation,
    card,
    productPositioning?.sourceIds ?? companyIntroduction?.sourceIds ?? [],
  );
  const painHypotheses = Array.isArray(analysis.painHypotheses)
    ? analysis.painHypotheses.map((item) => normalizePain(item, card)).filter((item): item is PainHypothesis => Boolean(item)).slice(0, 3)
    : [];

  if (!companyIntroduction || !productsAndServices || !industryAndCoverage || !recentUpdates || !businessModel || !productPositioning || !targetCustomers || !competitionObservation || !painHypotheses.length) {
    return undefined;
  }
  return {
    companyOverview: { companyIntroduction, productsAndServices, industryAndCoverage, recentUpdates },
    companyAnalysis: { businessModel, productPositioning, targetCustomers, competitionObservation, painHypotheses },
  };
}

export function normalizeSalesStrategy(raw: string, card: Battlecard, productName: string): SalesStrategyPatch | undefined {
  const parsed = extractJson(raw);
  const strategy = isRecord(parsed?.salesStrategy) ? parsed.salesStrategy : undefined;
  if (!strategy) return undefined;
  const fallbackSourceIds = strategyEvidenceIds(card);
  const entryPoints = normalizeStrategyCitedList(strategy.entryPoints, card, fallbackSourceIds);
  const recommendation = normalizeStrategyCited(strategy.recommendation, card, fallbackSourceIds);
  const opening = normalizeStrategyCited(strategy.opening, card, fallbackSourceIds);
  const potentialNeeds = normalizeStrategyCitedList(strategy.potentialNeeds, card, fallbackSourceIds);
  const discoveryQuestions = Array.isArray(strategy.discoveryQuestions)
    ? strategy.discoveryQuestions.map((item) => {
        if (!isRecord(item)) return undefined;
        const question = readableText(item.question);
        const purpose = readableText(item.purpose);
        return question && purpose ? { question, purpose } : undefined;
      }).filter((item): item is Battlecard["questions"][number] => Boolean(item)).slice(0, 5)
    : [];
  const recommendedNextStep = readableText(strategy.recommendedNextStep);
  const avoid = Array.isArray(strategy.avoid) ? strategy.avoid.map(readableText).filter((item): item is string => Boolean(item)).slice(0, 3) : [];
  const productLinked = Boolean(recommendation?.text.includes(productName) || opening?.text.includes(productName));
  if (!entryPoints || !recommendation || !opening || !potentialNeeds || discoveryQuestions.length !== 5 || !recommendedNextStep || !avoid.length || !productLinked) {
    return undefined;
  }
  const isBareProductName = productName.trim().length < 20 && !/[，,；;：:（）()]/.test(productName);
  if (isBareProductName) {
    const safeEntryPoints: CitedText[] = [];
    for (const entryPoint of entryPoints) {
      const segments = entryPoint.text.split(/[；;]/).map((item) => item.trim()).filter(Boolean);
      const signal = segments.find((item) => !item.includes(productName) && /(?:公开|目标公司|贵司|客户|集团|公司|美的)/.test(item))
        ?? segments.find((item) => !item.includes(productName));
      if (!signal) continue;
      const factualSignal = signal.replace(/[，；](?:表明|说明|意味着|可能)[\s\S]*$/, "").replace(/[。\s]+$/, "");
      const text = `客户公开信号：${factualSignal}。建议用该信号验证与“${productName}”是否存在真实关联，不据此推断产品能力或效果。`;
      if (!safeEntryPoints.some((item) => item.text === text)) safeEntryPoints.push({ ...entryPoint, text });
    }
    const productTopic = productName.replace(/(?:制造器|制造设备|设备|系统|软件|平台|服务|解决方案)/g, "").trim();
    const relatedEvidence = card.companyOverview.productsAndServices.find((item) => productTopic.length >= 2 && item.text.includes(productTopic))
      ?? card.companyOverview.productsAndServices[0]
      ?? card.companyOverview.companyIntroduction;
    entryPoints.splice(0, entryPoints.length, ...(safeEntryPoints.length ? safeEntryPoints : [{
      text: `客户公开资料显示：${relatedEvidence.text.slice(0, 180)}。建议用该信号验证与“${productName}”是否存在真实关联，不据此推断产品能力或效果。`,
      sourceIds: relatedEvidence.sourceIds,
    }]));
    const customerSignal = entryPoints[0].text.replace(/[。；;\s]+$/, "").slice(0, 180);
    recommendation.text = `公开资料提供了以下切入信号：${customerSignal}。目前只知道销售方产品名称为“${productName}”，不能据此推断功能或效果；建议先验证客户的实际场景、现有方案与评估标准，再判断是否值得进入产品交流。`;
    opening.text = `您好，我关注到贵司公开资料中的这项业务信号：${customerSignal}。我们提供“${productName}”，但在不了解贵司实际场景前不预设它一定适用。想先请教贵司目前在相关制造环节有哪些计划或难题，再判断是否值得进一步交流。`;
  }
  return { salesStrategy: { entryPoints, recommendation, opening, potentialNeeds, discoveryQuestions, recommendedNextStep, avoid } };
}

function evidencePack(card: Battlecard, input: ResearchInput) {
  const focus = [input.preset, "company", "product", "service", "customer", "market", "news", "announced", "公司", "产品", "服务", "客户", "市场", "发布"];
  return card.sources.slice(0, 8).map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    sourceType: source.sourceType,
    publishedAt: source.publishedAt,
    excerpt: selectEvidenceExcerpts(source, focus),
  }));
}

async function completeJson(client: OpenAI, config: AppConfig, system: string, payload: unknown, maxTokens: number): Promise<string> {
  const completion = await client.chat.completions.create({
    model: config.OPENAI_MODEL,
    temperature: 0.1,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(payload) }],
    ...(config.OPENAI_BASE_URL.includes("api.deepseek.com") ? { thinking: { type: "disabled" } } : {}),
  } as never);
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("empty model response");
  return content;
}

function researchPrompt(): string {
  return `你是严谨的 B2B 公司研究员。请用简洁、自然、可直接给中国销售阅读的中文输出 JSON。只使用给出的公开证据，不得编造，不得复制长段英文。品牌名和产品专有名词可保留英文，其余内容必须翻译并总结为中文。区分目标公司整体、子品牌和业务部门；子业务资料不得表述为集团整体事实。只有具有新闻或公告语义的证据才能进入 recentUpdates；若竞争信息不足，明确写“当前公开资料不足，建议沟通中验证”。所有事实对象必须为 {text,sourceIds}，sourceIds 只能使用给定 ID。
输出：{companyOverview:{companyIntroduction,productsAndServices:[...],industryAndCoverage,recentUpdates:[...]},companyAnalysis:{businessModel,productPositioning,targetCustomers,competitionObservation,painHypotheses:[{text,businessImpact,confidenceLabel,validationQuestion,sourceIds}]}}。所有痛点必须以“待验证”表述。`;
}

function strategyPrompt(productName: string): string {
  return `你是 B2B 售前销售顾问。请只输出一个合法 JSON 对象，不要使用 Markdown。基于已经通过证据校验的公司研究，为销售人员生成中文电话准备策略。销售方输入的产品是“${productName}”。如果产品只有名称，不得虚构其功能、参数或效果，只能提出“待验证的关联”，并通过问题确认。推荐理由和开场话术必须明确出现“${productName}”，同时引用至少一项客户公开信号。每个引用对象为 {text,sourceIds}，sourceIds 只能使用给定 ID。
输出：{salesStrategy:{entryPoints:[...],recommendation,opening,potentialNeeds:[...],discoveryQuestions:[{question,purpose}]恰好5条,recommendedNextStep,avoid:[...]}}。正文必须是自然中文，品牌和产品专有名词除外。`;
}

const REPAIR_JSON_INSTRUCTION = `这是一次格式纠错重试。必须返回完整 JSON，不能省略任何字段。所有需要引用的内容必须严格使用 {"text":"中文内容","sourceIds":["给定来源ID"]}；数组中的每一项也使用这一结构。不得使用 angle、signal、relevance 等替代字段名，不得把引用对象简化成字符串。`;

async function generateCompanyResearch(client: OpenAI, config: AppConfig, card: Battlecard, input: ResearchInput): Promise<CompanyResearchPatch | undefined> {
  const payload = { companyUrl: input.targetUrl, industryPreset: input.preset, evidence: evidencePack(card, input) };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await completeJson(client, config, `${researchPrompt()}${attempt ? `\n${REPAIR_JSON_INSTRUCTION}` : ""}`, payload, 3_000);
      const normalized = normalizeCompanyResearch(raw, card);
      if (normalized) return normalized;
    } catch (error) {
      if (attempt === 1) console.error("Company research request failed:", error instanceof Error ? error.message : "unknown error");
    }
  }
  return undefined;
}

async function generateSalesStrategy(client: OpenAI, config: AppConfig, card: Battlecard, input: ResearchInput, company: CompanyResearchPatch): Promise<SalesStrategyPatch | undefined> {
  const payload = {
    sellerProduct: input.sellerProfile.productName,
    companyResearch: company,
    evidence: evidencePack(card, input).map(({ id, title, sourceType, publishedAt }) => ({ id, title, sourceType, publishedAt })),
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await completeJson(client, config, `${strategyPrompt(input.sellerProfile.productName)}${attempt ? `\n${REPAIR_JSON_INSTRUCTION}` : ""}`, payload, 1_800);
      const normalized = normalizeSalesStrategy(raw, card, input.sellerProfile.productName);
      if (normalized) return normalized;
    } catch (error) {
      if (attempt === 1) console.error("Sales strategy request failed:", error instanceof Error ? error.message : "unknown error");
    }
  }
  return undefined;
}

export async function enhanceWithLlm(card: Battlecard, input: ResearchInput, config: AppConfig): Promise<Battlecard> {
  if (!config.OPENAI_API_KEY) {
    return { ...card, modelStatus: "not_configured", collectionNotes: [...card.collectionNotes, "未配置中文研究模型，当前仅保留已采集来源。"] };
  }
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, baseURL: config.OPENAI_BASE_URL, timeout: 50_000, maxRetries: 0 });
  try {
    const company = await generateCompanyResearch(client, config, card, input);
    if (!company) throw new Error("company research failed Chinese/evidence quality gate");
    const researchedCard: Battlecard = {
      ...card,
      ...company,
      overview: company.companyOverview.companyIntroduction,
      signals: company.companyOverview.recentUpdates,
      painHypotheses: company.companyAnalysis.painHypotheses,
    };

    try {
      const strategy = await generateSalesStrategy(client, config, researchedCard, input, company);
      if (!strategy) throw new Error("sales strategy failed product/evidence quality gate");
      return {
        ...researchedCard,
        ...strategy,
        talkTrack: {
          objective: "验证公开信号与销售方产品之间是否存在真实业务机会。",
          opening: strategy.salesStrategy.opening,
          discoveryQuestions: strategy.salesStrategy.discoveryQuestions.slice(0, 3),
          valueBridge: strategy.salesStrategy.recommendation.text,
          recommendedNextStep: strategy.salesStrategy.recommendedNextStep,
          avoid: strategy.salesStrategy.avoid,
        },
        questions: strategy.salesStrategy.discoveryQuestions,
        opening: strategy.salesStrategy.opening,
        productMappings: [{ ...strategy.salesStrategy.recommendation, sellerCapability: input.sellerProfile.productName, expectedValue: "具体价值和适用范围需要在沟通中验证。" }],
        modelStatus: "used",
        collectionNotes: [...card.collectionNotes, "公司研究与销售策略已通过中文、引用和产品相关性检查。"],
      };
    } catch (strategyError) {
      console.error("Sales strategy quality fallback:", strategyError instanceof Error ? strategyError.message : "unknown error");
      return { ...researchedCard, modelStatus: "evidence_based", collectionNotes: [...card.collectionNotes, "公司中文研究已完成；销售策略未通过产品相关性检查。"] };
    }
  } catch (error) {
    console.error("Company research quality fallback:", error instanceof Error ? error.message : "unknown error");
    return { ...card, modelStatus: "evidence_based", warnings: [...card.warnings, "中文研究未通过质量检查，请重试。"], collectionNotes: [...card.collectionNotes, "公开来源已采集，但未展示不合格的原文拼接结果。"] };
  }
}
