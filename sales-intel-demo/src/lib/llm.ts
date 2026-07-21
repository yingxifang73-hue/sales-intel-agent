import OpenAI from "openai";
import { z } from "zod";
import type { AppConfig } from "@/lib/config";
import { PainHypothesisSchema, TalkTrackSchema, type Battlecard, type ResearchInput } from "@/lib/types";

const AdviceSchema = z.object({ painHypotheses: z.array(PainHypothesisSchema).min(1).max(3), talkTrack: TalkTrackSchema });

export async function enhanceWithLlm(card: Battlecard, input: ResearchInput, config: AppConfig): Promise<Battlecard> {
  if (!config.OPENAI_API_KEY) return card;
  const sourceIds = new Set(card.sources.map((source) => source.id));
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, baseURL: config.OPENAI_BASE_URL, timeout: 30_000, maxRetries: 0 });
  try {
    const request = { model: config.OPENAI_MODEL, temperature: 0.2, max_tokens: 900, response_format: { type: "json_object" as const }, messages: [
      { role: "system", content: "你是B2B售前顾问。只能根据提供的来源推断；所有痛点都必须标注为待验证，且每条 sourceIds 只能使用给定 ID。输出 JSON：{painHypotheses:[{text,businessImpact,confidenceLabel,validationQuestion,sourceIds}],talkTrack:{objective,opening:{text,sourceIds},discoveryQuestions:[{question,purpose}],valueBridge,recommendedNextStep,avoid}}。" },
      { role: "user", content: JSON.stringify({ seller: input.sellerProfile, company: input.targetUrl, sources: card.sources.map(({ id, title, content }) => ({ id, title, content: content.slice(0, 2500) })) }) },
    ], ...(config.OPENAI_BASE_URL.includes("api.deepseek.com") ? { thinking: { type: "disabled" } } : {}) };
    const completion = await client.chat.completions.create(request as never);
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("模型未返回内容");
    const advice = AdviceSchema.parse(JSON.parse(content));
    const cited = [...advice.painHypotheses, advice.talkTrack.opening].every((item) => item.sourceIds.every((id) => sourceIds.has(id)));
    if (!cited) throw new Error("模型返回了未知来源编号");
    return { ...card, ...advice };
  } catch (error) {
    console.error("LLM advice fallback:", error instanceof Error ? error.message : "unknown error");
    return { ...card, warnings: [...card.warnings, "模型增强未完成，以下为基于公开证据的规则版建议。"] };
  }
}
