# Report Quality Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make collected正文 reliably become a complete, structured sales report and prevent incomplete model output from being delivered as a completed report.

**Architecture:** Keep the existing Vercel Workflow and Supabase job model. Strengthen the existing source-selection, source-fact extraction, cross-source reduction, analysis, and final quality-gate boundaries; the frontend continues polling the same job API.

**Tech Stack:** Next.js 16, TypeScript, Zod, Vitest, Supabase, Vercel Workflow, Firecrawl, Jina Reader, Serper, OpenAI-compatible FastRoute/Qwen API.

## Global Constraints

- Preserve the current frontend pages and report chapters.
- Do not start a real provider research run.
- Search snippets are discovery metadata, never report evidence.
- Facts retain real source IDs; AI judgments remain distinguishable from facts.
- A report that fails the minimum standard cannot be completed or consume a trial.
- Loading copy must be identical in source, tests, and production resources.

---

### Task 1: Source eligibility and ranking

**Files:**
- Modify: `sales-intel-demo/src/lib/web-search.ts`
- Modify: `sales-intel-demo/src/lib/source-quality.ts`
- Test: `sales-intel-demo/tests/unit/source-quality.test.ts`

**Interfaces:**
- `assessSource(source, targetUrl)` rejects unhydrated search snippets and low-information pages.
- `selectReportSources(sources, targetUrl, limit)` returns a balanced, relevance-ranked set with official core pages ahead of jobs/help pages.

- [ ] Add failing tests for snippet exclusion, official overview precedence, and job/help-page demotion.
- [ ] Run the targeted test and confirm the new assertions fail.
- [ ] Mark search snippets as discovery-only and require body-length/quality thresholds for evidence.
- [ ] Add page-purpose and target-host scoring; balance core categories after ranking.
- [ ] Run the targeted test and confirm it passes.

### Task 2: Reliable per-source AI extraction

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/src/lib/config.ts`
- Modify: `sales-intel-demo/src/lib/research-workflow-state.ts`
- Test: `sales-intel-demo/tests/unit/llm.test.ts`
- Test: `sales-intel-demo/tests/unit/research-workflow-state.test.ts`

**Interfaces:**
- `completeJson` supports bounded attempts with retryable timeout/provider failures.
- `extractSourceFactBundles` records a failed model source once, after retries are exhausted.
- Source extraction receives compact正文 excerpts rather than 60k-character navigation-heavy payloads.

- [ ] Add failing tests for retry-after-timeout and preserving successful bundles.
- [ ] Run the targeted tests and confirm failure.
- [ ] Implement two attempts with exponential backoff and a source-fact token budget.
- [ ] Reduce batch size so one gateway slowdown does not fail four sources together.
- [ ] Run targeted tests and confirm pass.

### Task 3: Quality-aware fact reduction

**Files:**
- Modify: `sales-intel-demo/src/lib/source-facts.ts`
- Modify: `sales-intel-demo/src/lib/evidence.ts`
- Test: `sales-intel-demo/tests/unit/source-facts.test.ts`
- Test: `sales-intel-demo/tests/unit/evidence-cleaning.test.ts`

**Interfaces:**
- `extractDeterministicSourceFacts` emits only complete, page-purpose-compatible sentences.
- `mergeSourceFactBundles` ranks and combines facts by source trust, completeness, language quality, and semantic uniqueness.

- [ ] Add failing fixtures containing navigation, English slogans, job snippets, and real body paragraphs.
- [ ] Run targeted tests and confirm failure.
- [ ] Reject navigation-like, promotional, truncated, and discovery-only sentences.
- [ ] Merge multiple high-quality facts into substantive fields instead of taking the first bundle.
- [ ] Run targeted tests and confirm pass.

### Task 4: Complete analysis and repair pass

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/src/lib/quality-gate.ts`
- Test: `sales-intel-demo/tests/unit/llm.test.ts`
- Test: `sales-intel-demo/tests/unit/fault-tolerance.test.ts`

**Interfaces:**
- Analysis generation receives the merged fact library and produces the full existing schema.
- `checkMinimum(report)` validates content depth, required subfields, stage outcomes, and placeholder/garbage text.

- [ ] Add failing tests for thin customer profile, one-line opportunity, failed conversation, and placeholder text.
- [ ] Run targeted tests and confirm failure.
- [ ] Expand prompts and normalizers to preserve more structured facts and generate two to three opportunity chains plus complete conversation material.
- [ ] Add one targeted repair generation when the first report misses required fields.
- [ ] Run targeted tests and confirm pass.

### Task 5: Completion semantics and trial safety

**Files:**
- Modify: `sales-intel-demo/src/workflows/research-workflow.ts`
- Test: `sales-intel-demo/tests/unit/research-workflow-state.test.ts`

**Interfaces:**
- `verifyAndSettle` completes and settles only when `checkMinimum(report).passed` is true.
- A failed quality repair throws a fatal workflow error; `failAndRelease` releases the reservation.

- [ ] Add a failing test proving an under-minimum report cannot be settled or completed.
- [ ] Run the targeted test and confirm failure.
- [ ] Enforce the quality gate before settlement and persist a user-safe failure reason.
- [ ] Run the targeted test and confirm pass.

### Task 6: Loading-copy production guarantee

**Files:**
- Modify: `sales-intel-demo/src/components/ResearchProgress.tsx`
- Modify: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`
- Modify: `sales-intel-demo/next.config.ts`

**Interfaces:**
- `ResearchProgress` always renders “调研需要一定时间，保证数据准确性，请耐心等待~”.
- Production pages use no-store/revalidation settings appropriate for replacing stale application assets.

- [ ] Add assertions for the new text and absence of the old text.
- [ ] Run the targeted test and confirm the assertions protect both card and page heading.
- [ ] Remove obsolete progress description copy and correct malformed symbols/encoding in the component.
- [ ] Run the targeted test and confirm pass.

### Task 7: Verification and deployment

**Files:**
- No new product files.

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Deploy production with Vercel.
- [ ] Verify the production URL and deployed resources contain the new loading copy.
- [ ] Do not submit a real research request.
