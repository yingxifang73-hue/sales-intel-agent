import { describe, expect, it } from "vitest";
import { isQueuedResearchExpired } from "@/lib/research-job-timeout";

describe("queued research timeout", () => {
  it("only expires a queued job after the dispatch grace period", () => {
    const now = new Date("2026-08-03T03:00:00.000Z");
    expect(isQueuedResearchExpired("queued", "2026-08-03T02:52:59.999Z", now, 7 * 60_000)).toBe(true);
    expect(isQueuedResearchExpired("running", "2026-08-03T02:00:00.000Z", now, 7 * 60_000)).toBe(false);
    expect(isQueuedResearchExpired("queued", "2026-08-03T02:59:00.000Z", now, 7 * 60_000)).toBe(false);
  });
});
