import { NextResponse } from "next/server";
import { loadAuthorizedResearchJob } from "@/lib/research-jobs";
import { tokenFromRequest } from "@/lib/trial";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ researchId: string }> }) {
  try {
    const { researchId } = await context.params;
    const accessToken = tokenFromRequest(request);
    if (!accessToken) return NextResponse.json({ error: "请先输入有效兑换码。" }, { status: 401 });
    const job = await loadAuthorizedResearchJob(researchId, accessToken);
    return NextResponse.json({
      researchId: job.id,
      status: job.status,
      progress: job.progress,
      currentStage: job.currentStage,
      message: job.message,
      input: job.input,
      report: job.report,
      error: job.error,
      updatedAt: job.updatedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "调研任务不存在。" }, { status: 404 });
  }
}
