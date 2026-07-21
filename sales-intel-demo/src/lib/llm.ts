import OpenAI from "openai";
import type { AppConfig } from "@/lib/config";
import type { Battlecard, ResearchInput } from "@/lib/types";

type PainHypothesis = Battlecard["painHypotheses"][number];
type TalkTrack = Battlecard["talkTrack"];
type AdvicePatch = Pick<Battlecard, "painHypotheses" | "talkTrack">;
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function validSourceIds(value: unknown, card: Battlecard, fallback: string[]): string[] {
  const valid = new Set(card.sources.map((source) => source.id));
  const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && valid.has(id)) : [];
  return ids.length ? ids.slice(0, 5) : fallback;
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

function normalizeQuestions(value: unknown, fallback: TalkTrack["discoveryQuestions"]): TalkTrack["discoveryQuestions"] {
  if (!Array.isArray(value)) return fallback;
  const questions = value.map((item) => {
    if (typeof item === "string" && item.trim()) return { question: item.trim(), purpose: "核实公开信号对应的实际情况。" };
    if (isRecord(item) && typeof item.question === "string" && item.question.trim()) {
      return { question: item.question.trim(), purpose: stringValue(item.purpose, "核实公开信号对应的实际情况。") };
    }
    return undefined;
  }).filter((item): item is TalkTrack["discoveryQuestions"][number] => Boolean(item));
  return questions.length >= 3 ? questions.slice(0, 3) : fallback;
}

export function normalizeModelAdvice(raw: string, card: Battlecard): AdvicePatch | undefined {
  const parsed = extractJson(raw);
  if (!parsed) return undefined;
  const rawPains = Array.isArray(parsed.painHypotheses) ? parsed.painHypotheses : [];
  const pains = rawPains.map((item, index): PainHypothesis | undefined => {
    if (!isRecord(item) || typeof item.text !== "string" || !item.text.trim()) return undefined;
    const fallback = card.painHypotheses[index] ?? card.painHypotheses[0]!;
    return {
      text: item.text.trim(),
      businessImpact: stringValue(item.businessImpact, fallback.businessImpact),
      confidenceLabel: item.confidenceLabel === "中" || item.confidenceLabel === "高" || item.confidenceLabel === "低" ? item.confidenceLabel : fallback.confidenceLabel,
      validationQuestion: stringValue(item.validationQuestion, fallback.validationQuestion),
      sourceIds: validSourceIds(item.sourceIds, card, fallback.sourceIds),
    };
  }).filter((item): item is PainHypothesis => Boolean(item)).slice(0, 3);

  const rawTalkTrack = isRecord(parsed.talkTrack) ? parsed.talkTrack : undefined;
  const baseTrack = card.talkTrack;
  const rawOpening = rawTalkTrack?.opening;
  const openingText = isRecord(rawOpening) ? rawOpening.text : rawOpening;
  const openingSourceIds = isRecord(rawOpening) ? rawOpening.sourceIds : undefined;
  const talkTrack: TalkTrack = {
    objective: stringValue(rawTalkTrack?.objective, baseTrack.objective),
    opening: {
      text: stringValue(openingText, baseTrack.opening.text),
      sourceIds: validSourceIds(openingSourceIds, card, baseTrack.opening.sourceIds),
    },
    discoveryQuestions: normalizeQuestions(rawTalkTrack?.discoveryQuestions, baseTrack.discoveryQuestions),
    valueBridge: stringValue(rawTalkTrack?.valueBridge, baseTrack.valueBridge),
    recommendedNextStep: stringValue(rawTalkTrack?.recommendedNextStep, baseTrack.recommendedNextStep),
    avoid: (Array.isArray(rawTalkTrack?.avoid) ? rawTalkTrack?.avoid : [rawTalkTrack?.avoid])
      .filter((item): item is string => typeof item === "string" && item.trim().length >= 4)
      .map((item) => item.trim())
      .slice(0, 3),
  };
  if (!talkTrack.avoid.length) talkTrack.avoid = baseTrack.avoid;

  if (!pains.length && !rawTalkTrack) return undefined;
  return { painHypotheses: pains.length ? pains : card.painHypotheses, talkTrack };
}

function compactEvidence(card: Battlecard) {
  return card.sources.slice(0, 5).map(({ id, title, content }) => ({
    id,
    title,
    excerpt: content.replace(/\s+/g, " ").trim().slice(0, 520),
  }));
}

export async function enhanceWithLlm(card: Battlecard, input: ResearchInput, config: AppConfig): Promise<Battlecard> {
  if (!config.OPENAI_API_KEY) {
    return { ...card, modelStatus: "not_configured", collectionNotes: [...card.collectionNotes, "未配置模型密钥，已基于采集证据生成建议。"] };
  }
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, baseURL: config.OPENAI_BASE_URL, timeout: 35_000, maxRetries: 1 });
  try {
    const completion = await client.chat.completions.create({
      model: config.OPENAI_MODEL,
      temperature: 0.2,
      max_tokens: 1_200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是 B2B 售前顾问。只依据给出的公开证据写建议，不能把推断写成事实。返回一个紧凑 JSON：painHypotheses 至多 2 条，每条含 text、businessImpact、validationQuestion、sourceIds；talkTrack 含 objective、opening、discoveryQuestions（恰好 3 条）、recommendedNextStep、avoid。sourceIds 只能使用给定 ID。缺少证据时少写，不要编造。",
        },
        {
          role: "user",
          content: JSON.stringify({ seller: { productName: input.sellerProfile.productName, valueProposition: input.sellerProfile.valueProposition, targetCustomer: input.sellerProfile.targetCustomer }, evidence: compactEvidence(card) }),
        },
      ],
      ...(config.OPENAI_BASE_URL.includes("api.deepseek.com") ? { thinking: { type: "disabled" } } : {}),
    } as never);
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("empty model response");
    const advice = normalizeModelAdvice(content, card);
    if (!advice) throw new Error("model response contained no usable advice");
    return { ...card, ...advice, modelStatus: "used", collectionNotes: [...card.collectionNotes, "模型已基于公开证据生成销售建议。"] };
  } catch (error) {
    console.error("LLM advice retained evidence-based card:", error instanceof Error ? error.message : "unknown error");
    return { ...card, modelStatus: "evidence_based", collectionNotes: [...card.collectionNotes, "模型建议本次未采用；已基于采集证据生成建议。"] };
  }
}
