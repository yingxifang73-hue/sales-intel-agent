import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { DemoCrawler, HybridCrawler, runResearch } from "@/lib/research";
import { ResearchInputSchema } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const input = ResearchInputSchema.parse(await request.json());
    const config = getConfig();
    const crawler = config.E2E_FAKE_PROVIDERS === "true" ? new DemoCrawler() : new HybridCrawler(config.FIRECRAWL_API_KEY);
    return NextResponse.json(await runResearch(input, crawler, config));
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "生成作战卡时发生未知错误。";
    const message = /DNS resolution failed|ENOTFOUND/i.test(rawMessage) ? "暂时无法解析目标官网地址，请稍后重试或补充官网资料。" : rawMessage;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
