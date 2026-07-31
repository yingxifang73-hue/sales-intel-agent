# Production Surface Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove fake-data paths, obsolete UI, duplicate diagnostic code and one-off artifacts without changing the real research pipeline, SalesReport schema, evidence fidelity or approved UI output.

**Architecture:** Keep the single LangGraph production flow (`validate_input` through `generate_final_report`), verified public-source collection, structured contact extraction and the unified report UI. Delete only code proven unused or unsafe for production; retain test fixtures through dependency injection rather than a runtime fake-provider switch.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, LangGraph, Firecrawl, OpenAI-compatible API, Vitest.

## Global Constraints

- Do not remove or truncate any SalesReport field, evidence citation, contact verification rule, external-source collection or final report chapter.
- Do not create a replacement UI or a fake demo path.
- The normal API must always use the real LangGraph research pipeline.
- Preserve the approved four product states: input, progress, history and unified report.
- Restore evidence-cleaning test coverage before deleting any legacy test helpers.

---

### Task 1: Remove runtime fake research and old report surface

**Files:**
- Modify: `sales-intel-demo/src/app/api/research/route.ts`
- Modify: `sales-intel-demo/src/lib/pipeline/run-research.ts`
- Modify: `sales-intel-demo/src/lib/research.ts`
- Modify: `sales-intel-demo/src/lib/config.ts`
- Delete: `sales-intel-demo/src/components/TabOverview.tsx`
- Delete: `sales-intel-demo/src/lib/report-presentation.ts`
- Delete: `sales-intel-demo/tests/unit/report-presentation.test.ts`
- Delete: `sales-intel-demo/tests/unit/report-ui.test.tsx`

- [x] Remove `E2E_FAKE_PROVIDERS`, `DemoCrawler` and `runResearchSync`; leave the NDJSON graph stream as the only API response path.
- [x] Delete the unused overview component and report-presentation helper layer after verifying no production imports exist.
- [x] Run `pnpm typecheck` and `pnpm test`.

### Task 2: Remove unsafe diagnostics and one-off artifacts

**Files:**
- Delete: `sales-intel-demo/src/app/api/debug/raw-data/route.ts`
- Delete: `sales-intel-demo/src/lib/debug-instrument.ts`
- Delete: `sales-intel-demo/scripts/`
- Delete: historical files in `sales-intel-demo/diagnostics/`
- Modify: `sales-intel-demo/.gitignore`

- [x] Delete the unauthenticated debug route, which can re-run scraping and model calls from a public GET request.
- [x] Delete one-off scripts that embed old targets or fake report data.
- [x] Ignore diagnostics output so local runtime logs cannot re-enter the repository.
- [x] Keep `research-archive.ts` and its test as a future, non-UI full-archive utility.

### Task 3: Align configuration, dependencies and evidence tests

**Files:**
- Modify: `sales-intel-demo/.env.example`
- Modify: `sales-intel-demo/src/lib/config.ts`
- Modify: `sales-intel-demo/package.json`
- Modify: `sales-intel-demo/pnpm-workspace.yaml`
- Modify: `sales-intel-demo/THIRD_PARTY_NOTICES.md`
- Modify: `sales-intel-demo/README.md`
- Restore: `sales-intel-demo/tests/unit/evidence.test.ts`

- [x] Retain Firecrawl, Serper, Jina and OpenAI-compatible settings; add `OPENAI_API_KEY` to the example.
- [x] Remove unused database, session-secret and fake-provider configuration.
- [x] Remove unused `better-sqlite3` dependencies and related build permission.
- [x] Restore source-cleaning tests and update README to describe the approved report structure and real pipeline.
- [x] Run `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

### Task 4: Verify output preservation

**Files:**
- Verify only: `sales-intel-demo/src/app/page.tsx`
- Verify only: `sales-intel-demo/src/components/ReportDetailPage.tsx`
- Verify only: `sales-intel-demo/src/components/ContactSection.tsx`

- [x] Start the app and confirm the input page, six-stage progress rendering, history view and unified report still load.
- [x] Confirm a report can still surface contacts, evidence and all seven report sections without horizontal overflow on mobile.
