import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { DemoCrawler, FirecrawlCrawler, runResearch } from "@/lib/research";
import { ResearchInputSchema } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const input = ResearchInputSchema.parse(await request.json());
    const config = getConfig();
    const crawler = config.E2E_FAKE_PROVIDERS === "true" || !config.FIRECRAWL_API_KEY ? new DemoCrawler() : new FirecrawlCrawler(config.FIRECRAWL_API_KEY);
    return NextResponse.json(await runResearch(input, crawler, config));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成作战卡时发生未知错误。" }, { status: 400 });
  }
}
