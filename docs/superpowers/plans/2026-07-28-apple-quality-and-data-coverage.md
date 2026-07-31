# Apple Quality and Data Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all sales-research screens readable and polished on desktop while collecting and presenting verified public company/contact facts more completely.

**Architecture:** Keep the existing Next.js client and one LangGraph pipeline. Improve the collection-to-evidence boundary so contact pages and category-specific source excerpts survive into structured extraction; then replace the narrow report typography/layout with one shared Apple-style surface system. Report navigation owns opening and scrolling chapter details.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Playwright, LangGraph, Firecrawl, Jina Reader, Serper.

## Global Constraints

- Do not fabricate company details, contacts, addresses, or sources.
- Preserve existing local report history and do not rerun a company merely to populate the UI.
- Do not show source drawers, evidence drawers, “原始信息”, or “查看证据” controls in the product UI.
- Delete the report-status display from the report header.
- Use system SF Pro/PingFang typography, 16px body reading text, large desktop content width, 14–18px card radius, restrained blue primary actions.

---

### Task 1: Preserve contact and category evidence

**Files:**
- Modify: `sales-intel-demo/src/lib/web-search.ts`
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/src/lib/contact-intelligence.ts`
- Modify: `sales-intel-demo/tests/unit/firecrawl.test.ts`
- Modify: `sales-intel-demo/tests/unit/llm-evidence.test.ts`
- Modify: `sales-intel-demo/tests/unit/contact-intelligence.test.ts`

**Interfaces:**
- Produces searchable contact candidates and model evidence grouped by category.
- Keeps `normalizeContactIntelligence(raw, sources, targetUrl): ContactIntelligence` as the verification boundary.

- [x] Add failing tests proving a contact URL remains eligible for contact collection and that model evidence contains at least one source per available company/contact category.
- [x] Change search filtering so only login/legal/cart pages are globally low-value; contact/official-channel pages remain eligible and are classified as contact evidence.
- [x] Add a deterministic source scanner for verified emails, telephone numbers, addresses and official contact URLs; merge it with model output through existing source-value validation and deduplication.
- [x] Expand `buildModelEvidence` from a flat 8×1000 excerpt pack to a bounded category-balanced pack that preserves company, scale, contact, product and news evidence.
- [x] Run the targeted unit tests and then `pnpm typecheck`.

### Task 2: Make report navigation state consistent

**Files:**
- Modify: `sales-intel-demo/src/components/ReportDetailPage.tsx`
- Modify: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

**Interfaces:**
- The report table of contents invokes `openSection(sectionId: string): void`.
- Chapters remain native `details` elements for accessible keyboard operation.

- [x] Add a failing UI test that clicking a TOC item opens its target `details` and calls scrolling only after it is open.
- [x] Replace passive anchor-only TOC navigation with a click handler that opens the target chapter and invokes `scrollIntoView({ block: "start" })`.
- [x] Make all expandable chapters initially closed; leave the overview and contact sections visible as the report landing content.
- [x] Remove the report-status metadata item and update the identity grid to avoid ellipsis clipping.
- [x] Run `pnpm test -- --run tests/unit/ui-redesign.test.tsx`.

### Task 3: Apply the unified desktop visual system

**Files:**
- Modify: `sales-intel-demo/src/app/globals.css`
- Modify: `sales-intel-demo/src/components/ContactSection.tsx`
- Modify: `sales-intel-demo/src/components/ReportDetailPage.tsx`
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

**Interfaces:**
- Reuses existing class names, adding only page-level `si-*` classes where needed.
- Retains all report text and structured data fields.

- [x] Add visual-structure assertions for the deleted status field and the new TOC behavior.
- [x] Introduce shared desktop tokens: 1480px content width, 16px base reading text, 15–18px cards, consistent 48px controls, system font rendering, soft neutral surface and one blue primary action.
- [x] Rebuild input, progress, report and contact page spacing around the shared tokens; increase card titles/body text and remove large empty desktop gutters.
- [x] Ensure status/copy text wraps safely instead of using visual ellipses for meaningful report data.
- [x] Add responsive overrides below 980px and 720px without reducing desktop reading sizes.
- [x] Run the UI test and inspect 1920px screenshots for the input and report views.

### Task 4: End-to-end verification

**Files:**
- Test: `sales-intel-demo/tests/unit/*.test.ts`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

- [x] Run `pnpm test` and expect all test files to pass.
- [x] Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` and expect exit code 0.
- [x] Use local Chrome at 1920px to screenshot input and generated-progress layouts; verify no clipped status, no small 12px reading copy in the primary report body, and no old six-step progress panel.
- [x] Report the data limitation honestly: old reports retain their original evidence; improved extraction applies on the next real research run.
