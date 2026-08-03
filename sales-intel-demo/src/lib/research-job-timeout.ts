import type { ResearchStatus } from "@/lib/types";

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
