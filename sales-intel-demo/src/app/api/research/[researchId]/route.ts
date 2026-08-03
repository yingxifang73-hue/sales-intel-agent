import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { expireQueuedResearchJob, expireStalledResearchJob, loadAuthorizedResearchJob, settleTrialRunById } from "@/lib/research-jobs";
import { isQueuedResearchExpired, isRunningResearchStalled, runningResearchStageTimeoutMs } from "@/lib/research-job-timeout";
import { tokenFromRequest } from "@/lib/trial";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ researchId: string }> }) {
  try {
    const { researchId } = await context.params;
    const accessToken = tokenFromRequest(request);
    if (!accessToken) return NextResponse.json({ error: "请先输入有效兑换码。" }, { status: 401 });
    let job = await loadAuthorizedResearchJob(researchId, accessToken);
    const now = new Date();
    const graceMs = getConfig().RESEARCH_DISPATCH_GRACE_MS;
    if (isQueuedResearchExpired(job.status, job.updatedAt, now, graceMs)) {
      const expired = await expireQueuedResearchJob(
        job.id,
        new Date(Date.now() - graceMs).toISOString(),
        "GitHub Actions 未在规定时间内接收任务。请检查 GitHub Actions 的可用分钟数、仓库 Secrets 和 Render 的调度令牌。",
      );
      if (expired) {
        job = expired;
        await settleTrialRunById(job.trialRunId, false).catch((error) => {
          console.error("Trial run release after GitHub Actions timeout failed:", error instanceof Error ? error.message : "unknown");
        });
      }
    }
    if (isRunningResearchStalled(job.status, job.currentStage, job.updatedAt, now)) {
      const timeoutMs = runningResearchStageTimeoutMs(job.currentStage);
      const expired = await expireStalledResearchJob(
        job.id,
        job.currentStage,
        new Date(now.getTime() - timeoutMs).toISOString(),
        `调研在“${job.currentStage}”阶段超过允许时间仍未收到后台进度更新。请稍后重新发起；本次调研次数已自动退回。`,
      );
      if (expired) {
        job = expired;
        await settleTrialRunById(job.trialRunId, false).catch((error) => {
          console.error("Trial run release after stalled research timeout failed:", error instanceof Error ? error.message : "unknown");
        });
      }
    }
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
      createdAt: job.createdAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "调研任务不存在。" }, { status: 404 });
  }
}
