# Resumable Report Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic report-generation workflow into resumable report-module steps so a slow provider response retries only the affected module while preserving every source and completed report section.

**Architecture:** Keep source collection and per-source fact extraction unchanged. Persist a valid draft report before model work, then run facts, opportunity, conversation, and quality-review model stages in separate Vercel Workflow steps; expose the six approved Chinese business-module stage names by inserting validation/persistence boundaries for product fit, opportunities, next step, and final verdict.

**Tech Stack:** Next.js 16, TypeScript, Vercel Workflow, Supabase, Vitest, Zod.

## Global Constraints

- User-visible module names are exactly: 销售结论、客户画像、产品匹配、机会与痛点、沟通方案、下一步.
- 联系方式与地址 remains a fixed deterministic section and is not a separate model stage.
- Keep all selected sources, citations, report text, and existing quality gates.
- Do not switch models, reduce source count, merge content, or add fake data.
- A retry must never regenerate a previously persisted successful module.

---

### Task 1: Define resumable module stages

**Files:**
- Modify: `sales-intel-demo/src/lib/research-workflow-state.ts`
- Test: `sales-intel-demo/tests/unit/research-workflow-state.test.ts`

**Interfaces:**
- Consumes: existing `SalesReport` and `ResearchJob`.
- Produces: `REPORT_MODULE_STAGES`, `reportModuleProgress(stage)`, and `isReportModuleComplete(report, stage)`.

- [ ] **Step 1: Write failing stage-contract tests**

```ts
expect(REPORT_MODULE_STAGES.map((stage) => stage.label)).toEqual([
  "客户画像", "产品匹配", "机会与痛点", "沟通方案", "下一步", "销售结论",
]);
expect(reportModuleProgress("customer_profile")).toBe(76);
expect(reportModuleProgress("sales_verdict")).toBe(96);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm exec vitest run tests/unit/research-workflow-state.test.ts`

Expected: FAIL because the module-stage exports do not exist.

- [ ] **Step 3: Implement the exact module contract**

```ts
export const REPORT_MODULE_STAGES = [
  { id: "customer_profile", label: "客户画像", progress: 76 },
  { id: "product_fit", label: "产品匹配", progress: 82 },
  { id: "opportunities", label: "机会与痛点", progress: 86 },
  { id: "talk_track", label: "沟通方案", progress: 90 },
  { id: "next_step", label: "下一步", progress: 93 },
  { id: "sales_verdict", label: "销售结论", progress: 96 },
] as const;
```

Completion checks must use persisted `qualityAudit.stageOutcomes` for model stages and actual report fields for validation-only stages.

- [ ] **Step 4: Run the focused test**

Run: `pnpm exec vitest run tests/unit/research-workflow-state.test.ts`

Expected: PASS.

### Task 2: Split report generation into durable persisted steps

**Files:**
- Modify: `sales-intel-demo/src/workflows/research-workflow.ts`
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Test: `sales-intel-demo/tests/unit/research-workflow-state.test.ts`
- Test: `sales-intel-demo/tests/unit/fault-tolerance.test.ts`

**Interfaces:**
- Consumes: `enhanceWithLlm(report, input, sources, config, sourceFacts, { stages })`.
- Produces: independent Workflow steps `initializeReport`, `generateCustomerProfile`, `generateProductFit`, `saveOpportunities`, `generateTalkTrack`, `saveNextStep`, and `finalizeSalesVerdict`.

- [ ] **Step 1: Write failing recovery tests**

```ts
expect(isReportModuleComplete(reportWithOpportunitySuccess, "product_fit")).toBe(true);
expect(isReportModuleComplete(reportWithOpportunitySuccess, "opportunities")).toBe(true);
expect(isReportModuleComplete(reportWithConversationSuccess, "talk_track")).toBe(true);
expect(isReportModuleComplete(reportWithConversationSuccess, "next_step")).toBe(true);
```

The test must also assert that sources and customer intelligence remain deep-equal after a later-stage update.

- [ ] **Step 2: Verify the recovery tests fail**

Run: `pnpm exec vitest run tests/unit/research-workflow-state.test.ts tests/unit/fault-tolerance.test.ts`

Expected: FAIL on missing resumable completion behavior.

- [ ] **Step 3: Persist the deterministic draft before model calls**

```ts
async function initializeReport(jobId: string) {
  "use step";
  const job = await loadResearchJob(jobId);
  if (job.report) return;
  const draft = synthesizeReport(/* existing complete source inputs */);
  await storeResearchReport(jobId, parseWorkflowReport(draft, "客户画像"));
}
```

- [ ] **Step 4: Implement one model stage per durable step**

Each model step must:

```ts
const job = await loadResearchJob(jobId);
if (!job.report || !job.selectedSources?.length) throw new FatalError("报告上下文缺失。");
if (isReportModuleComplete(job.report, moduleId)) return;
await setResearchJobStage(jobId, moduleId, reportModuleProgress(moduleId), `正在整理${label}。`);
const updated = await enhanceWithLlm(
  job.report,
  job.input,
  job.selectedSources,
  getConfig(),
  job.sourceFacts,
  { stages: [llmStage] },
);
await storeResearchReport(jobId, parseWorkflowReport(updated, label));
```

Use `facts` for 客户画像, `opportunity` for 产品匹配/机会与痛点, `conversation` for 沟通方案/下一步, and `quality_review` for 销售结论. The validation-only partner step must only verify and persist the already generated shared result.

- [ ] **Step 5: Replace the monolithic workflow call order**

```ts
await initializeReport(jobId);
await generateCustomerProfile(jobId);
await generateProductFit(jobId);
await saveOpportunities(jobId);
await generateTalkTrack(jobId);
await saveNextStep(jobId);
await finalizeSalesVerdict(jobId);
await repairIncompleteReport(jobId);
await verifyAndSettle(jobId);
```

- [ ] **Step 6: Run focused workflow tests**

Run: `pnpm exec vitest run tests/unit/research-workflow-state.test.ts tests/unit/fault-tolerance.test.ts tests/unit/llm.test.ts`

Expected: PASS.

### Task 3: Show real module progress in the UI

**Files:**
- Modify: `sales-intel-demo/src/components/ResearchProgress.tsx`
- Modify: `sales-intel-demo/src/app/page.tsx`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

**Interfaces:**
- Consumes: persisted `currentStage`, `progress`, and `message`.
- Produces: current approved module label and non-regressing progress display.

- [ ] **Step 1: Add a failing UI test**

```tsx
expect(rendered.getByText("正在整理产品匹配。")).toBeTruthy();
expect(rendered.getByText("当前进度 82%")).toBeTruthy();
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `pnpm exec vitest run tests/unit/ui-redesign.test.tsx`

Expected: FAIL until the new module stage is rendered.

- [ ] **Step 3: Render the backend message without replacing module labels**

Keep background polling unchanged. The progress component must show the exact backend module message and preserve the existing “期间可切换页面” explanation.

- [ ] **Step 4: Run the UI test**

Run: `pnpm exec vitest run tests/unit/ui-redesign.test.tsx`

Expected: PASS.

### Task 4: Verify, deploy, and inspect production

**Files:**
- Modify only if verification exposes a regression.

**Interfaces:**
- Consumes: completed implementation.
- Produces: a Ready Vercel production deployment and HTTP 200 production alias.

- [ ] **Step 1: Run all tests**

Run: `pnpm test`

Expected: all test files and tests pass.

- [ ] **Step 2: Run type and production build checks**

Run: `pnpm typecheck`

Expected: exit code 0.

Run: `pnpm build`

Expected: Next.js production build completes and Workflow build lists the workflow steps.

- [ ] **Step 3: Deploy production**

Run: `npx --yes vercel@latest --prod --yes`

Expected: deployment state `READY` and alias `https://sales-intel-agent-red.vercel.app`.

- [ ] **Step 4: Verify production**

Run:

```powershell
$response = Invoke-WebRequest -Uri 'https://sales-intel-agent-red.vercel.app' -UseBasicParsing -TimeoutSec 30
$response.StatusCode
```

Expected: `200`.

- [ ] **Step 5: Inspect one new workflow trace without running a paid research**

Verify the deployed Workflow definition exposes separate durable report-module steps. Do not start a real research job or consume crawler/model/trial quota.
