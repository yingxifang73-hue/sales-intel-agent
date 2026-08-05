export type GitHubDispatchConfig = {
  GITHUB_REPOSITORY?: string;
  GITHUB_REF?: string;
  GITHUB_DISPATCH_TOKEN?: string;
};

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

const WORKFLOW_FILE = "research-runner.yml";
const DEFAULT_REPOSITORY = "yingxifang73-hue/sales-intel-agent";
const DEFAULT_REF = "feat/sales-intelligence-demo";

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`缺少 ${name} 配置，无法触发 GitHub Actions 调研任务。`);
  return trimmed;
}

export async function dispatchResearchJob(
  jobId: string,
  config: GitHubDispatchConfig,
  fetcher: Fetcher = fetch,
): Promise<void> {
  // The deployment target belongs to this product and is not a secret. Keep a
  // safe default so a Render environment-variable edit cannot stop all users.
  const repository = config.GITHUB_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const ref = config.GITHUB_REF?.trim() || DEFAULT_REF;
  const token = required(config.GITHUB_DISPATCH_TOKEN, "GITHUB_DISPATCH_TOKEN");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY 必须使用 owner/repository 格式。");
  }

  const response = await fetcher(
    `https://api.github.com/repos/${repository}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      body: JSON.stringify({ ref, inputs: { research_id: jobId } }),
    },
  );

  if (response.ok) return;
  const detail = (await response.text()).slice(0, 300);
  throw new Error(`GitHub Actions 调研任务触发失败（HTTP ${response.status}）：${detail || "未返回错误详情"}`);
}
