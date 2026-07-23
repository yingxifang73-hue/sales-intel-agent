# Sales Report Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every validated research and sales field in a readable, evidence-traceable five-module report.

**Architecture:** Preserve the research pipeline and introduce a presentation layer that resolves duplicate/fallback fields before React renders them. Persist the full seller profile with each history entry, render one complete home for every field, and use a Swiss report layout with responsive grids and evidence-first interactions.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest.

## Global Constraints

- Preserve current collection, Firecrawl, evidence filtering, and LLM behavior.
- Preserve unrelated user and Claude changes in the dirty worktree.
- Render every validated report field; never fabricate missing content.
- Keep every hypothesis visibly marked `待验证` and every factual cited field traceable.
- Keep backward compatibility with history records that only contain `productName`.

---

### Task 1: Persist complete seller context

**Files:**
- Modify: `sales-intel-demo/src/lib/report-history.ts`
- Modify: `sales-intel-demo/src/app/page.tsx`
- Test: `sales-intel-demo/tests/unit/report-history.test.ts`

- [ ] Add an optional `sellerProfile: SellerProfile` field to `SavedResearchReport`.
- [ ] Save the normalized profile after a completed run and continue accepting older records.
- [ ] Add history parsing tests for both full and legacy records.

### Task 2: Centralize display fallbacks and evidence coverage

**Files:**
- Modify: `sales-intel-demo/src/lib/report-presentation.ts`
- Test: `sales-intel-demo/tests/unit/report-presentation.test.ts`

- [ ] Rename modules to `调研速览 / 客户事实 / 机会与匹配 / 首次沟通 / 证据与边界`.
- [ ] Add pure helpers for pain, opening, questions, next step and avoid fallback precedence.
- [ ] Include overview, signals, competition, risks and every product mapping in evidence grouping.
- [ ] Add tests that use a full report fixture and verify no cited source is silently omitted.

### Task 3: Render every field exactly once in its detailed module

**Files:**
- Modify: `sales-intel-demo/src/app/page.tsx`

- [ ] Expand the report header with seller context and research metadata.
- [ ] Rebuild 01 as a 30-second contact brief.
- [ ] Render every company fact and update in 02.
- [ ] Render every pain, need, product mapping, competition observation and risk in 03.
- [ ] Render objective, all entry points, recommendation, value bridge, opening, all questions, proof points, next step and avoid items in 04.
- [ ] Render evidence summary, claims, source groups, notes, warnings, model status and metrics in 05.
- [ ] Use honest module-level empty states rather than empty cards.

### Task 4: Apply the complete responsive Swiss layout

**Files:**
- Modify: `sales-intel-demo/src/app/globals.css`

- [ ] Replace oversized centered typography with a 1180–1240px left-aligned report grid.
- [ ] Implement sticky module tabs, readable card type, evidence chips and status badges.
- [ ] Use full-width narrative sections for long text and two-column cards only for short parallel facts.
- [ ] Add 1366px, 900px and 640px breakpoints so the page works at 100% browser zoom.
- [ ] Keep print/PDF styles readable.

### Task 5: Prove full-field coverage

**Files:**
- Create or modify: `sales-intel-demo/tests/unit/report-presentation.test.ts`
- Modify only if a defect is found: report UI and presentation files

- [ ] Run targeted report and history tests.
- [ ] Run the complete unit suite, TypeScript check, ESLint and production build.
- [ ] Start the application and visually verify landing, running, history and all five report modules at desktop and mobile widths.
- [ ] Verify source buttons navigate to the correct evidence card and PDF output preserves content hierarchy.
