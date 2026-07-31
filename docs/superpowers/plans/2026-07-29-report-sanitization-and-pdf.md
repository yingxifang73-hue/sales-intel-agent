# Report Sanitization and PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清除报告异常脚本载荷和模板前缀，并提供可读、可复制、适合 A4 的 PDF 导出。

**Architecture:** 在 `evidence.ts` 建立统一的异常内容检测与报告文案清理函数，事实抽取和 ViewModel 同时调用，形成采集与展示双层保护。PDF 继续使用浏览器原生打印引擎，通过报告专用打印 CSS 控制字体、颜色、分页与隐藏元素。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、CSS Print Media

## Global Constraints

- 不改写或删减模板前缀之后的有效报告正文。
- 不引入假数据。
- 保留现有报告页面与章节结构。
- PDF 必须支持中文、文字选择和长报告分页。

---

### Task 1: 异常载荷和模板前缀清理

**Files:**
- Modify: `sales-intel-demo/src/lib/evidence.ts`
- Modify: `sales-intel-demo/src/lib/source-facts.ts`
- Modify: `sales-intel-demo/src/lib/report-viewmodel.ts`
- Test: `sales-intel-demo/tests/unit/evidence.test.ts`
- Test: `sales-intel-demo/tests/unit/report-viewmodel.test.ts`

**Interfaces:**
- Produces: `sanitizeReportText(value: string): string`
- Consumes: `cleanSourceText(value: string): string`

- [ ] **Step 1: 写入会失败的异常载荷与前缀清理测试**
- [ ] **Step 2: 运行定向测试确认当前实现失败**
- [ ] **Step 3: 实现统一清理函数并接入事实抽取和 ViewModel**
- [ ] **Step 4: 运行定向测试确认通过**

### Task 2: PDF 专用排版

**Files:**
- Modify: `sales-intel-demo/src/components/ReportDetailPage.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

**Interfaces:**
- Consumes: `ReportDetailPage` 的现有 `window.print()` 流程
- Produces: `.si-pdf-exporting` 和 `@media print` 报告样式

- [ ] **Step 1: 写入导出状态、标题和打印样式测试**
- [ ] **Step 2: 运行定向测试确认当前实现失败**
- [ ] **Step 3: 实现 A4 中文排版、分页规则和状态恢复**
- [ ] **Step 4: 运行定向测试确认通过**

### Task 3: 全量验证与部署

**Files:**
- Verify: `sales-intel-demo`

**Interfaces:**
- Consumes: Task 1 与 Task 2 的全部改动
- Produces: 可部署生产构建

- [ ] **Step 1: 运行 `pnpm test`**
- [ ] **Step 2: 运行 `pnpm typecheck` 与 `pnpm lint`**
- [ ] **Step 3: 运行 `pnpm build`**
- [ ] **Step 4: 使用浏览器打印预览生成 PDF 并渲染检查**
- [ ] **Step 5: 部署到现有 Vercel 生产站点并复查**
