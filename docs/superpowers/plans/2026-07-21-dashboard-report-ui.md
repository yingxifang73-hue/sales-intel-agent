# Dashboard Report UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current linear report page with a clear Chinese sales-research dashboard that lets a salesperson move between report modules without losing the current report.

**Architecture:** Keep the existing `/api/research` request and `Battlecard` data contract unchanged. Add a small presentation module that defines the report-module navigation, then use it from the client page to render either the dashboard overview or a focused module detail. Rebuild the stylesheet around one responsive dashboard shell rather than styling the old report sections.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest.

## Global Constraints

- Work only in `D:\销售Agent` on branch `feat/sales-intelligence-demo`.
- Keep the target website, industry preset, and seller-product inputs.
- Do not display invented business data, model outcomes, people, or metrics.
- All user-facing UI copy must be Chinese and readable UTF-8.
- Do not add an icon dependency; use labelled controls and inline semantic SVG only when an icon supports a real interaction.
- Do not alter API payloads, research collection, model calls, or secret files in this UI task.

---

### Task 1: Define report-module navigation data

**Files:**

- Create: `sales-intel-demo/src/lib/report-presentation.ts`
- Create: `sales-intel-demo/tests/unit/report-presentation.test.ts`

**Interfaces:**

- Produces `ReportModule` (`"overview" | "company" | "analysis" | "strategy" | "sources"`) and `reportModules` for the page navigation.
- `reportModules` contains the Chinese module title, short description, and source report section, with no report data embedded.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { reportModules } from "@/lib/report-presentation";

describe("reportModules", () => {
  it("keeps a Chinese dashboard overview followed by four report modules", () => {
    expect(reportModules.map((module) => module.id)).toEqual([
      "overview", "company", "analysis", "strategy", "sources",
    ]);
    expect(reportModules.every((module) => /[\u4e00-\u9fff]/.test(module.title))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/report-presentation.test.ts`

Expected: FAIL because `@/lib/report-presentation` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type ReportModule = "overview" | "company" | "analysis" | "strategy" | "sources";

export const reportModules: ReadonlyArray<{
  id: ReportModule;
  title: string;
  description: string;
}> = [
  { id: "overview", title: "调研总览", description: "先看客户、证据和下一步" },
  { id: "company", title: "公司画像", description: "公司、产品与公开动态" },
  { id: "analysis", title: "业务判断", description: "模式、定位与待验证痛点" },
  { id: "strategy", title: "销售准备", description: "切入、开场和发现问题" },
  { id: "sources", title: "来源证据", description: "本次调研使用的公开页面" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/report-presentation.test.ts`

Expected: PASS with 1 test.

### Task 2: Replace the page with dashboard and focused module views

**Files:**

- Modify: `sales-intel-demo/src/app/page.tsx`
- Uses: `sales-intel-demo/src/lib/report-presentation.ts`

**Interfaces:**

- Consumes: existing `Battlecard`, `Preset`, `/api/research`, and `reportModules`.
- Produces: a dashboard overview after report generation and an in-page focused detail mode selected by `ReportModule`.

- [ ] **Step 1: Preserve request behavior**

Keep the existing `submit` request body and response handling. Add `activeModule` state initialized to `"overview"`; set it to `"overview"` after a successful response; reset report and active module from the real `开始新调研` action.

- [ ] **Step 2: Implement the visible dashboard hierarchy**

Replace the old `masthead`, linear form, and `ReportSection` rendering with:

```tsx
<main className="dashboard-shell">
  <aside className="sidebar">…real report-module navigation…</aside>
  <section className="dashboard-main">
    <header className="topbar">…current page context and reset action…</header>
    <section className="research-composer">…target URL, preset, seller product and submit…</section>
    {report ? <ReportWorkspace report={report} activeModule={activeModule} /> : <EmptyResearchState />}
  </section>
</main>
```

Every navigation button must set `activeModule`. The overview must show only facts derived from `report`: report overview text, source count, collection notes/model state, first current-update signal, and the recommended next step. It must render clickable module cards for company, analysis, strategy and sources.

- [ ] **Step 3: Implement focused detail modules**

Render one focused module at a time for `company`, `analysis`, `strategy`, and `sources`. Include a `返回总览` button which sets `activeModule` to `"overview"`. Reuse all existing content fields, including pain hypotheses, sales opening, five discovery questions, constraints, warnings and source links. Never render raw source `content`.

- [ ] **Step 4: Type-check the page**

Run: `pnpm typecheck`

Expected: exit code 0.

### Task 3: Create the dashboard visual system and verify it

**Files:**

- Modify: `sales-intel-demo/src/app/globals.css`

**Interfaces:**

- Consumes: class names introduced in `page.tsx`.
- Produces: responsive dashboard styling for desktop rail and mobile navigation.

- [ ] **Step 1: Implement the Swiss dashboard system**

Use only neutral white/grey surfaces (`#f7f7f8`, `#ffffff`, `#e5e5e7`), near-black navigation (`#242426`), and one Yves Klein blue action/data accent (`#002fa7`). Use Helvetica Neue / Arial / Microsoft YaHei; retain visible hairline borders and grid alignment. Use rounded cards to mirror the reference dashboard, without shadows that imply fake elevation.

- [ ] **Step 2: Add the signature interaction treatment**

Make the selected report module visible as a blue left rule and filled module card. The detail view must have a compact breadcrumb-like header with the real section title and a clear `返回总览` action.

- [ ] **Step 3: Implement mobile layout**

At widths under 800px, convert the vertical rail into a horizontal scrolling module bar; stack all form controls and report cards; retain readable source links and action targets.

- [ ] **Step 4: Run automated verification**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 5: Run visual interaction verification**

Start the app with `pnpm dev`, generate a report against the existing example URL, and verify in the browser that the dashboard overview renders; click `销售准备`; then click `返回总览`. Capture a screenshot after the overview appears.
