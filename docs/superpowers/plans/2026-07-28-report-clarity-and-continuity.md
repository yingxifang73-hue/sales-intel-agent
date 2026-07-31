# 报告清晰度、持续调研与历史页统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让调研可跨页面持续执行，并让报告和历史页呈现高信息密度、中文化且没有空白占位或技术噪音的界面。

**Architecture:** 根页面继续持有 SSE 请求与研究状态，视图切换只改变显示内容。视图层通过过滤后的报告视图模型显示模块与备注；采集/模型层负责清洗网页正文并只输出可验证的结构化中文结论。

**Tech Stack:** Next.js、React、TypeScript、Zod、现有 Firecrawl/搜索采集器、OpenAI 兼容模型 API、Vitest、Testing Library。

## Global Constraints

- 不创建新前端或重复项目；保持现有报告 1–6 个正式模块与第 7 备注模块。
- 不伪造公开事实、联系人、地址、规模或客户。
- 所有新用户可见文本使用中文；不展示采集工具或模型内部日志。
- 不修改既有历史报告内容；只影响新调研的采集归纳与所有页面的渲染样式。

---

### Task 1: 持续调研状态与边框进度

**Files:**
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/src/components/ResearchProgress.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

- [x] 保持根页面持有 `isRunning` 和 SSE 事件，视图切换不取消请求。
- [x] `research` 视图渲染输入或进度，AppShell 导航只切换视图。
- [x] 用 SVG `rect` 的 `strokeDasharray`/`strokeDashoffset` 绘制圆角卡片边界进度，移除中央 spinner。
- [x] 运行 UI 单测，确认通过。

### Task 2: 报告内容去噪与空模块处理

**Files:**
- Modify: `sales-intel-demo/src/components/FieldBadge.tsx`
- Modify: `sales-intel-demo/src/components/ReportDetailPage.tsx`
- Modify: `sales-intel-demo/src/components/TabBusinessProducts.tsx`
- Modify: `sales-intel-demo/src/components/TabMatchingOpportunity.tsx`
- Modify: `sales-intel-demo/src/components/TabEvidence.tsx`
- Modify: `sales-intel-demo/src/lib/report-viewmodel.ts`
- Test: `sales-intel-demo/tests/unit/report-viewmodel.test.ts`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

- [x] 增加 UI 断言，报告不含 `AI 判断`、`详情` 和报告状态。
- [x] 移除报告中的 FieldBadge 展示和产品列表展开按钮；把产品、信号和机会改成标题/要点的直接结构。
- [x] 将第七章标题与 TabEvidence 改为“备注”，仅显示非技术性补充信息。
- [x] 在视图模型中提供 `supplementalNotes`，过滤技术文本，并去重/截短。
- [x] 仅当字段有真实内容时渲染客户画像卡片；无内容时显示一个简短章节说明。
- [x] 运行两个单元测试，确认通过。

### Task 3: 强化中文化结构化归纳

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/src/lib/web-search.ts`
- Modify: `sales-intel-demo/src/lib/research.ts`
- Test: `sales-intel-demo/tests/unit/llm-evidence.test.ts`
- Test: `sales-intel-demo/tests/unit/research.test.ts`

- [x] 保留既有模型证据覆盖测试，并避免将原始抓取正文作为展示字段兜底。
- [x] 使用既有缺口搜索覆盖公司概述、市场、商业模式、定位、规模能力及联系信息。
- [x] 保持模型中文结构化字段约束和有效 `sourceIds` 校验。
- [x] 清除 Markdown 元数据和常见抓取噪音，同时不以词频删除真实官网正文。
- [x] 运行对应单元测试，确认通过。

### Task 4: 导航、历史页和全局视觉统一

**Files:**
- Modify: `sales-intel-demo/src/components/AppShell.tsx`
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

- [x] 将历史页移除旧内联小字号，保留可点击的完整记录行。
- [x] 将侧栏宽度设为 280px，增大导航的字体、图标和触控区域，并保留响应式布局。
- [x] 将历史页统一为与输入页相同的标题区、圆角记录表面与蓝色操作。
- [x] 调整全局字体、间距、边界和按钮，消除小字、溢出和多余空白。
- [x] 运行视觉单测，确认通过。

### Task 5: 完整验证

**Files:**
- Verify only: `sales-intel-demo`

- [x] 运行 `pnpm test`：21 个文件、73 个测试全部通过。
- [x] 运行 `pnpm typecheck` 与 `pnpm lint`，退出码 0。
- [x] 运行 `pnpm build`，Next.js 生产构建成功。
- [x] 使用本地浏览器检查更新后的输入页；没有触发真实外部调研。
