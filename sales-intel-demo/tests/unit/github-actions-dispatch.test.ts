import { describe, expect, it, vi } from "vitest";
import { dispatchResearchJob, type GitHubDispatchConfig } from "@/lib/github-actions-dispatch";

describe("GitHub Actions dispatch", () => {
  const config: GitHubDispatchConfig = {
    GITHUB_REPOSITORY: "owner/repo",
    GITHUB_REF: "feat/sales-intelligence-demo",
    GITHUB_DISPATCH_TOKEN: "test-token",
  };

  it("dispatches only the job id to the configured workflow", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await dispatchResearchJob("job-123", config, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/actions/workflows/research-runner.yml/dispatches",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        body: JSON.stringify({ ref: "feat/sales-intelligence-demo", inputs: { research_id: "job-123" } }),
      }),
    );
  });

  it("returns GitHub's response detail when dispatch is rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"message":"Bad credentials"}', { status: 401 }));

    await expect(dispatchResearchJob("job-123", config, fetchMock)).rejects.toThrow("GitHub Actions 调研任务触发失败");
  });
});
