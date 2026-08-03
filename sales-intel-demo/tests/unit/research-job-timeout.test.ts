import { describe, expect, it } from "vitest";
import { isQueuedResearchExpired, isRunningResearchStalled } from "@/lib/research-job-timeout";

describe("queued GitHub Actions job timeout", () => {
  it("expires only queued jobs that have not been accepted before the dispatch grace period", () => {
    const now = new Date("2026-08-03T10:00:00.000Z");
    expect(isQueuedResearchExpired("queued", "2026-08-03T09:52:59.999Z", now, 7 * 60_000)).toBe(true);
    expect(isQueuedResearchExpired("queued", "2026-08-03T09:53:00.000Z", now, 7 * 60_000)).toBe(false);
    expect(isQueuedResearchExpired("running", "2026-08-03T09:00:00.000Z", now, 7 * 60_000)).toBe(false);
  });
});

describe("running research heartbeat timeout", () => {
  it("expires a validate job that has stopped reporting progress, without expiring a fresh or long-running collection job", () => {
    const now = new Date("2026-08-03T10:00:00.000Z");
    expect(isRunningResearchStalled("running", "validate", "2026-08-03T09:56:59.999Z", now)).toBe(true);
    expect(isRunningResearchStalled("running", "validate", "2026-08-03T09:57:00.000Z", now)).toBe(false);
    expect(isRunningResearchStalled("running", "collect", "2026-08-03T09:45:00.000Z", now)).toBe(false);
    expect(isRunningResearchStalled("completed", "validate", "2026-08-03T09:00:00.000Z", now)).toBe(false);
  });
});
