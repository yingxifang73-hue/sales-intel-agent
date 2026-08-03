export type GitHubDispatchConfig = {
  GITHUB_REPOSITORY?: string;
  GITHUB_REF?: string;
  GITHUB_DISPATCH_TOKEN?: string;
};

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

const WORKFLOW_FILE = "research-runner.yml";

function required(value: string | undefined, name: string): string {
  if (value) return value;
  throw new Error(`后台调研尚未配置 ${name}。请联系管理员完成 GitHub Actions 配置后重试。`);
}

export async function dispatchResearchJob(
  jobId: string,
  config: GitHubDispatchConfig,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const repository = required(config.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const ref = required(config.GITHUB_REF, "GITHUB_REF");
  const token = required(config.GITHUB_DISPATCH_TOKEN, "GITHUB_DISPATCH_TOKEN");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY 格式错误，应为 owner/repository。");
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
  throw new Error(`GitHub Actions 未能接收调研任务（HTTP ${response.status}）：${detail || "请检查调度令牌和仓库权限。"}`);
}
