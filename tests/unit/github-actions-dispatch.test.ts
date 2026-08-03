import { describe, expect, it, vi } from "vitest";
import { dispatchResearchJob } from "@/lib/github-actions-dispatch";

describe("GitHub Actions dispatch", () => {
  it("dispatches only the research id to the configured workflow", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await dispatchResearchJob("job-123", {
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_REF: "main",
      GITHUB_DISPATCH_TOKEN: "secret",
    }, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/actions/workflows/research-runner.yml/dispatches",
      expect.objectContaining({ body: JSON.stringify({ ref: "main", inputs: { research_id: "job-123" } }) }),
    );
  });

  it("returns a clear error when GitHub rejects a dispatch", async () => {
    await expect(dispatchResearchJob("job-123", {
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_REF: "main",
      GITHUB_DISPATCH_TOKEN: "secret",
    }, async () => new Response("Bad credentials", { status: 401 }))).rejects.toThrow("GitHub Actions 未能接收调研任务");
  });
});
