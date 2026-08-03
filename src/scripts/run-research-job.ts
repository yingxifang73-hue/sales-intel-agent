import { runResearchJob } from "@/lib/research-job-runner";

function readResearchId(args: string[]): string {
  const index = args.indexOf("--research-id");
  const researchId = index >= 0 ? args[index + 1] : undefined;
  if (!researchId) throw new Error("缺少 --research-id 参数。");
  return researchId;
}

async function main() {
  await runResearchJob(readResearchId(process.argv.slice(2)));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Research job failed.");
  process.exitCode = 1;
});
