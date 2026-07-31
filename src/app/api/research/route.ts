import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { createResearchJob, setResearchJobWorkflowRun } from "@/lib/research-jobs";
import { finishTrialRun, reserveTrialRun, tokenFromRequest } from "@/lib/trial";
import { ResearchInputSchema } from "@/lib/types";
import { runSalesResearchWorkflow } from "@/workflows/research-workflow";

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
  try {
    accessToken = tokenFromRequest(request) ?? "";
    reservation = await reserveTrialRun(accessToken);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "请先输入有效兑换码。" }, { status: 403 });
  }

  try {
    const job = await createResearchJob(input, reservation.runId, accessToken);
    const run = await start(runSalesResearchWorkflow, [job.id]);
    await setResearchJobWorkflowRun(job.id, run.runId);
    return NextResponse.json({ researchId: job.id, status: "queued", progress: 0 }, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
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
