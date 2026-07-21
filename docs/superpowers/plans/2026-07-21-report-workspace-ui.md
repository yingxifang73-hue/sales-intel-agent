# Report Workspace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the initial sales-research screen a focused intake experience and show interactive report navigation only after a report exists.

**Architecture:** Keep the existing `Battlecard` request and report-detail components. Change the root page to select one of two layouts from `report`: `ResearchEntry` before generation, and `ReportWorkspace` after generation. Replace the dashboard shell CSS with a single-column entry layout plus a full-width report workspace and horizontal report directory.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest.

## Global Constraints

- Do not change `/api/research`, collection, model calls, report data, or secret files.
- Before a report exists, no report-navigation control may be visible or interactive.
- After a report exists, all five report-navigation controls must switch the visible report module.
- Do not use an outer empty dashboard frame or decorative developer UI.
- Preserve Chinese interface copy and the target URL, industry preset, and seller-product inputs.

---

### Task 1: Gate report navigation by report state

**Files:**

- Modify: `sales-intel-demo/src/app/page.tsx`

**Interfaces:**

- Consumes: current `report`, `activeModule`, `submit`, `startNewResearch`, and `ReportWorkspace`.
- Produces: `ResearchEntry` before a report and `ReportWorkspace` with directory after a report.

- [ ] **Step 1: Add the failing DOM behavior test**

Create `sales-intel-demo/tests/unit/report-presentation.test.ts` assertion that `reportModules` still contains all five module identifiers and that the UI helper has no hidden sixth module.

```ts
expect(reportModules).toHaveLength(5);
expect(reportModules.map((module) => module.id)).toEqual([
  "overview", "company", "analysis", "strategy", "sources",
]);
```

- [ ] **Step 2: Update page layout**

Move the current top bar, sidebar, and report-only navigation inside the `{report && ...}` branch. Render a dedicated `ResearchEntry` containing the product header, explanatory copy, and the existing form when `report` is undefined. Render a compact report header and horizontal `reportModules` navigation when `report` exists.

- [ ] **Step 3: Preserve real navigation**

Use `onNavigate` for each horizontal directory button and keep `ReportWorkspace` responsible for switching overview/detail. Keep `开始新调研` as the action that clears `report` and returns to `ResearchEntry`.

- [ ] **Step 4: Run unit test and type check**

Run: `pnpm test -- tests/unit/report-presentation.test.ts && pnpm typecheck`

Expected: exit code 0.

### Task 2: Rebuild the two screen layouts

**Files:**

- Modify: `sales-intel-demo/src/app/globals.css`

**Interfaces:**

- Consumes: `research-entry`, `report-app`, `report-directory`, and existing report content classes.
- Produces: responsive layouts with no initial sidebar and no oversized outer card.

- [ ] **Step 1: Create the entry screen**

Use a neutral page background, a maximum reading width of 980px, a simple product header and one bordered form surface. Do not set rounded outer containers around the whole page. Keep input labels and submit action clearly aligned.

- [ ] **Step 2: Create the report workspace**

Use a top header with company identity and `开始新调研`, then a horizontal directory with five buttons. Make the active item use the blue border/ink treatment. Give report content the page width and use cards only around individual information groups.

- [ ] **Step 3: Implement responsive behavior**

Below 800px, stack the form fields, allow the report directory to scroll horizontally, and preserve readable source links.

- [ ] **Step 4: Run production verification**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

### Task 3: Verify product-facing preview

**Files:**

- No source-file changes required.

**Interfaces:**

- Consumes: production build.
- Produces: a localhost preview without the Next.js development indicator.

- [ ] **Step 1: Start the production preview**

Run: `pnpm start -- --port 3100`

Expected: the server listens on port 3100 without development overlays.

- [ ] **Step 2: Verify initial state**

Open `http://localhost:3100`; verify there is no `报告导航` landmark and no Next.js development control.

- [ ] **Step 3: Verify report state**

Generate a report with the existing example URL. Verify the horizontal directory appears, click `销售准备`, then click `返回总览` and verify the report overview is shown.
