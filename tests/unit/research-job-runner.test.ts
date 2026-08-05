import { describe, expect, it } from "vitest";

describe("GitHub Actions portable research runner", () => {
  it("exports a portable job runner outside the Vercel workflow adapter", async () => {
    const runner = await import("@/lib/research-job-runner");
    expect(runner.runResearchJob).toBeTypeOf("function");
  });
});
