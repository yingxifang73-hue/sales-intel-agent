/**
 * Portable research executor used by the GitHub Actions runner.
 * It deliberately has no dependency on Vercel Workflow, so Render can
 * submit jobs while GitHub executes them in the background.
 */
export { runResearchJob } from "@/workflows/research-workflow";
