import { runResearchJob } from "@/lib/research-job-runner";

function readResearchId(argumentsList: string[]): string {
  const index = argumentsList.indexOf("--research-id");
  const researchId = index >= 0 ? argumentsList[index + 1]?.trim() : "";
  if (!researchId) throw new Error("缺少 --research-id 参数。");
  return researchId;
}

async function main() {
  const researchId = readResearchId(process.argv.slice(2));
  await runResearchJob(researchId);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
