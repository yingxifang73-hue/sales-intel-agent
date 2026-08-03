import { describe, expect, it } from "vitest";
import { isQueuedResearchExpired } from "@/lib/research-job-timeout";

describe("queued GitHub Actions job timeout", () => {
  it("expires only queued jobs that have not been accepted before the dispatch grace period", () => {
    const now = new Date("2026-08-03T10:00:00.000Z");
    expect(isQueuedResearchExpired("queued", "2026-08-03T09:52:59.999Z", now, 7 * 60_000)).toBe(true);
    expect(isQueuedResearchExpired("queued", "2026-08-03T09:53:00.000Z", now, 7 * 60_000)).toBe(false);
    expect(isQueuedResearchExpired("running", "2026-08-03T09:00:00.000Z", now, 7 * 60_000)).toBe(false);
  });
});
