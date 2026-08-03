import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GitHub Actions research workflow", () => {
  it("uses workflow dispatch and invokes the portable runner", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/research-runner.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("research_id:");
    expect(workflow).toContain("pnpm research:run -- --research-id");
    expect(workflow).not.toContain("GITHUB_DISPATCH_TOKEN");
  });
});
