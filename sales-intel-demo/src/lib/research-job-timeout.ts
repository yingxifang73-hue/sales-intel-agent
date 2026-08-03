import type { ResearchStatus } from "@/lib/types";

const RUNNING_STAGE_TIMEOUT_MS: Record<string, number> = {
  // This is the first local validation step. If it does not move, no crawler
  // or model call has started, so waiting longer cannot improve report quality.
  validate: 3 * 60_000,
  // A complete crawl and fact extraction intentionally process every source.
  collect: 25 * 60_000,
  facts: 25 * 60_000,
};

const DEFAULT_RUNNING_STAGE_TIMEOUT_MS = 15 * 60_000;

export function runningResearchStageTimeoutMs(stage: string): number {
  return RUNNING_STAGE_TIMEOUT_MS[stage] ?? DEFAULT_RUNNING_STAGE_TIMEOUT_MS;
}

export function isQueuedResearchExpired(
  status: ResearchStatus,
  updatedAt: string,
  now: Date,
  graceMs: number,
): boolean {
  if (status !== "queued") return false;
  const updatedAtMs = new Date(updatedAt).getTime();
  return Number.isFinite(updatedAtMs) && updatedAtMs < now.getTime() - graceMs;
}

/**
 * A job is only considered stuck when its server-side stage heartbeat has not
 * changed for the allowed duration. This survives browser refreshes and route
 * changes, unlike a timer kept in the page component.
 */
export function isRunningResearchStalled(
  status: ResearchStatus,
  stage: string,
  updatedAt: string,
  now: Date,
): boolean {
  if (status !== "running") return false;
  const updatedAtMs = new Date(updatedAt).getTime();
  return Number.isFinite(updatedAtMs)
    && updatedAtMs < now.getTime() - runningResearchStageTimeoutMs(stage);
}
