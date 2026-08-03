import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { dispatchResearchJob } from "@/lib/github-actions-dispatch";
import { createResearchJob, markResearchJobFailed } from "@/lib/research-jobs";
import { finishTrialRun, reserveTrialRun, tokenFromRequest } from "@/lib/trial";
import { ResearchInputSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let input;
  try {
    input = ResearchInputSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "请求参数不合法。" }, { status: 400 });
  }

  let accessToken: string;
  let reservation;
  let researchJobId: string | undefined;
  try {
    accessToken = tokenFromRequest(request) ?? "";
    reservation = await reserveTrialRun(accessToken);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "请先输入有效兑换码。" }, { status: 403 });
  }

  try {
    const job = await createResearchJob(input, reservation.runId, accessToken);
    researchJobId = job.id;
    await dispatchResearchJob(job.id, getConfig());
    return NextResponse.json({ researchId: job.id, status: "queued", progress: 0 }, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (researchJobId) {
      try {
        await markResearchJobFailed(researchJobId, error instanceof Error ? error.message : "GitHub Actions 调研任务触发失败。");
      } catch (jobError) {
        console.error("Research job failure persistence failed:", jobError instanceof Error ? jobError.message : "unknown");
      }
    }
    try {
      await finishTrialRun(accessToken, reservation.runId, false);
    } catch (settlementError) {
      console.error("Trial run release failed:", settlementError instanceof Error ? settlementError.message : "unknown");
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to queue the research workflow." },
      { status: 500 },
    );
  }
}
