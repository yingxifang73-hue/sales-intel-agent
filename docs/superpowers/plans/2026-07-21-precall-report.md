# Pre-call Research Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将简略销售作战卡升级为基于公开证据的完整 B2B 客户调研报告，同时保留官网、行业预设、产品和价值主张输入。

**Architecture:** 报告数据结构拆成公司概览、公司分析、销售策略和来源状态。研究层从现有双通道来源先生成完整的证据版内容；模型只增强分析与策略，失败时保留完整证据版；页面按纵向报告渲染四个章节。

**Tech Stack:** Next.js 16、React、TypeScript、Zod、Vitest、Firecrawl、OpenAI-compatible DeepSeek API。

## Global Constraints

- 目标公司官网、行业预设、产品和价值主张保留为输入。
- 公开事实必须可追溯来源；推断均标记为待验证。
- Firecrawl 是直连后的补充通道，不是仅在直连失败时备用。
- 未配置模型或模型未采用时仍输出完整四章节报告。
- 不处理需要登录、付费墙或绕过访问限制的内容。

---

### Task 1: 定义完整报告数据结构

**Files:**
- Modify: `sales-intel-demo/src/lib/types.ts`
- Modify: `sales-intel-demo/tests/unit/types.test.ts`

**Interfaces:**
- Produces `PrecallReport` with `companyOverview`, `companyAnalysis`, `salesStrategy`, `sources`, `collectionNotes`, `modelStatus`, `warnings`.

- [ ] 写入 Zod 测试，断言报告必须含四个章节与五个发现型问题。
- [ ] 定义可引用文本、待验证假设、概览和分析章节的 schema。
- [ ] 保留输入 schema 与来源 schema。
- [ ] 运行 `pnpm vitest run tests/unit/types.test.ts`，确认通过。

### Task 2: 从真实来源生成完整证据版报告

**Files:**
- Modify: `sales-intel-demo/src/lib/research.ts`
- Modify: `sales-intel-demo/tests/unit/research.test.ts`

**Interfaces:**
- Produces `synthesizePrecallReport(input, sources, collectionNotes, warnings): PrecallReport`.
- Overview includes company intro, products/services, industry/coverage, recent updates.
- Analysis includes business model, positioning, target customers, competition observation, pain hypotheses.

- [ ] 写入来源摘要测试，断言公司概览和公司分析均使用真实标题/正文而非固定模板。
- [ ] 实现章节摘要选择与“公开资料不足，建议沟通中验证”的明确降级文字。
- [ ] 实现包含切入点、推荐理由、开场话术、潜在需求、五个问题和下一步的基础销售策略。
- [ ] 运行 `pnpm vitest run tests/unit/research.test.ts`，确认通过。

### Task 3: 让模型增强完整报告的分析和策略

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/tests/unit/llm.test.ts`

**Interfaces:**
- Consumes `PrecallReport` and returns a partial override of `companyAnalysis` and `salesStrategy`.
- Produces complete evidence-based report on parsing/API failure.

- [ ] 写入模型 JSON 对概览分析字段、潜在需求和销售话术的归一化测试。
- [ ] 将紧凑证据包与提示词改为完整报告所需字段，限制模型仅补充可用证据。
- [ ] 缺失字段回退到基础报告对应字段，不丢弃章节。
- [ ] 运行 `pnpm vitest run tests/unit/llm.test.ts`，确认通过。

### Task 4: 构建纵向报告 UI

**Files:**
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`

**Interfaces:**
- Consumes `PrecallReport` and renders numbered Overview, Analysis, Strategy, Sources sections.

- [ ] 保留现有四项输入和提交行为。
- [ ] 用报告头、章节编号、事实块、待验证块和销售策略突出区替换当前四格卡片。
- [ ] 将来源按官网/新闻显示，将采集与模型状态显示为中性信息。
- [ ] 运行 `pnpm build`，确认类型和页面编译通过。

### Task 5: 真实官网验收与文档

**Files:**
- Modify: `sales-intel-demo/README.md`

- [ ] 对真实官网调用 API，记录四章节是否齐全、来源数、模型状态和五个问题数量，不输出密钥。
- [ ] 运行 `pnpm vitest run` 和 `pnpm build`。
- [ ] 更新 README 的输出说明，明确完整报告内容与证据/待验证边界。
- [ ] 提交实现。
