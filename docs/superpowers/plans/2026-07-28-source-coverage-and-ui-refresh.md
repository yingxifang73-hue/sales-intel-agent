# 来源覆盖与 UI 更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以真实公开来源补齐核心公司事实，并将调研应用更新为用户提供的四张 UI 设计图的布局与交互。

**Architecture:** 在现有 LangGraph 主流程内增强官网页面排序、公司身份解析与字段缺口补采；不改变报告 Schema 的事实来源要求。前端继续使用 Next.js 客户端组件，将输入、进度和报告视图重组为统一的黑白细边框界面，并由浏览器打印样式实现 PDF 导出。

**Tech Stack:** Next.js、React、TypeScript、Zod、LangGraph、Firecrawl、Serper、Jina Reader、Vitest。

## Global Constraints

- 不创建新前端或重复项目；保留当前输入与报告的内容宽度。
- Firecrawl 用于官网发现与正文采集；Serper/Jina 用于外部公开资料发现和正文采集。
- 事实字段必须有来源；未获得来源时使用信息不足或待验证。
- 删除前端证据抽屉和查看证据入口，但不删除报告中的来源数据。
- 导出报告按钮必须为黑色主操作，并导出 PDF。
- 只修改本次功能涉及的文件；不提交、推送或覆盖当前未提交改动。

---

### Task 1: 让官网与外部搜索覆盖关键公司事实

**Files:**
- Modify: `sales-intel-demo/src/lib/firecrawl.ts`
- Modify: `sales-intel-demo/src/lib/web-search.ts`
- Modify: `sales-intel-demo/src/lib/research.ts`
- Test: `sales-intel-demo/tests/unit/firecrawl.test.ts`
- Test: `sales-intel-demo/tests/unit/company-identity.test.ts`
- Test: `sales-intel-demo/tests/unit/research.test.ts`

**Interfaces:**
- Consumes: `FirecrawlCrawler.collect(input)` and `SearchCrawler.collect(input)`.
- Produces: `RawSource[]` with reliable `company`, `product`, `news`, and `business_signal` coverage before `selectReportSources`.

- [x] Add failing tests for Chinese brand identity aliases, generic URL page selection, and a targeted company/scale/customer gap search.
- [x] Run the focused test files and confirm the new assertions fail before implementation.
- [x] Add content- and link-aware page scoring to Firecrawl selection; include page titles/links that describe company, scale, customer and partnership information even when their paths are generic.
- [x] Extend company identity extraction using official structured metadata, page text and search-result candidate names; never accept an unrelated name.
- [x] Add field-level gap queries for company overview, scale/capability and client/cooperation facts; deep-scrape their selected public pages and retain only company-relevant results.
- [x] Run focused tests, then `pnpm typecheck`.

### Task 2: 保证报告消费增强后的字段覆盖

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/src/lib/quality-gate.ts`
- Test: `sales-intel-demo/tests/unit/llm-evidence.test.ts`
- Test: `sales-intel-demo/tests/unit/llm.test.ts`

**Interfaces:**
- Consumes: verified `Source[]` from Task 1.
- Produces: `SalesReport.customerIntelligence` whose overview, scale/capability and customer facts cite sources or stay insufficient.

- [x] Add failing evidence-validation tests for the three core facts and for unsupported-model-output rejection.
- [x] Run these tests to verify the new assertions fail.
- [x] Update LLM extraction instructions and deterministic post-validation so the three facts require direct source support.
- [x] Update the minimum quality audit to record missing core facts accurately without inventing a passing status.
- [x] Run the focused tests and `pnpm typecheck`.

### Task 3: 用最新设计图重建应用视图并删除证据抽屉

**Files:**
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`
- Modify: `sales-intel-demo/src/components/AppShell.tsx`
- Modify: `sales-intel-demo/src/components/ResearchProgress.tsx`
- Modify: `sales-intel-demo/src/components/ReportDetailPage.tsx`
- Modify: `sales-intel-demo/src/components/ContactSection.tsx`
- Delete: `sales-intel-demo/src/components/EvidenceDrawer.tsx`
- Modify: `sales-intel-demo/src/components/TabEvidence.tsx`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

**Interfaces:**
- Consumes: existing `ReportViewModel` and `SalesReport`.
- Produces: input, progress, contact and report layouts with no `onViewSource`, no drawer state and no raw JSON action.

- [x] Add failing UI tests that assert no evidence-drawer controls and presence of the four designed information regions.
- [x] Run the UI test to verify the new assertions fail.
- [x] Implement the input, progress, report and contact layouts following `C:\\Users\\Administrator\\Desktop\\UI设计图\\01.png` through `04.png`; retain only real report data and existing empty states.
- [x] Remove evidence-drawer props, controls and component usage; retain a folded supplemental section without per-source viewing UI.
- [x] Add responsive and print CSS matching the black/white layout and excluding app navigation from printing.
- [x] Run the UI test, `pnpm typecheck`, and `pnpm lint`.

### Task 4: 导出真实 PDF 并完成回归验证

**Files:**
- Modify: `sales-intel-demo/src/components/ReportDetailPage.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

**Interfaces:**
- Consumes: rendered report document.
- Produces: `window.print()` PDF flow with a report-specific title and print-only document layout.

- [x] Add a failing test asserting the export control invokes the PDF print flow rather than downloading JSON.
- [x] Run the focused test to confirm failure.
- [x] Implement report title assignment and print invocation; remove JSON Blob download behavior.
- [x] Run all unit tests, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- [x] Mark each task complete in this document after its verification command exits successfully.
