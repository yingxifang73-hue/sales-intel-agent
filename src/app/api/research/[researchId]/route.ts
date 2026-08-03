import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { expireQueuedResearchJob, expireStalledResearchJob, loadAuthorizedResearchJob, markResearchJobFailed, settleTrialRunById } from "@/lib/research-jobs";
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

/**
 * Ends a persisted client job that can no longer be executed. This is used
 * during executor migrations so a browser can never remain trapped on an old
 * loading screen or lose a reserved trial run.
 */
export async function DELETE(request: Request, context: { params: Promise<{ researchId: string }> }) {
  try {
    const { researchId } = await context.params;
    const accessToken = tokenFromRequest(request);
    if (!accessToken) return NextResponse.json({ error: "请先输入有效兑换码。" }, { status: 401 });
    const job = await loadAuthorizedResearchJob(researchId, accessToken);
    if (job.status === "completed") {
      return NextResponse.json({ error: "调研报告已完成，不能取消。" }, { status: 409 });
    }
    if (job.status !== "failed") {
      await markResearchJobFailed(job.id, "此任务由旧版页面创建，未接入当前后台执行器，已自动结束并退回调研次数。");
      await settleTrialRunById(job.trialRunId, false).catch((error) => {
        console.error("Trial run release after legacy job cancellation failed:", error instanceof Error ? error.message : "unknown");
      });
    }
    return NextResponse.json({ status: "failed", message: "旧版未执行任务已结束，本次调研次数已退回。" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法结束旧版调研任务。" }, { status: 404 });
  }
}
