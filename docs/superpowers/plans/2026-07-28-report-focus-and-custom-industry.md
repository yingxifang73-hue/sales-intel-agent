# 报告聚焦与自定义行业 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清除无效报告模块、保证销售机会章节有可执行内容，并提供不变形的界面与可自定义行业输入。

**Architecture:** 视图组件删除不需要的报告区块，机会生成层增加严格限定的待验证兜底。`ResearchInput` 增加可选 `customIndustry`，根页面、API 和模型提示保持端到端传递。

**Tech Stack:** Next.js、React、TypeScript、Zod、Vitest、现有 OpenAI 兼容模型接口。

## Global Constraints

- 不伪造目标公司的事实、联系人或已确认采购需求。
- 不增加新的前端项目或 UI 依赖。
- 删除的模块不可出现在目录、PDF 打印或用户可见页面。

---

### Task 1: 进度、品牌、历史与联系方式视觉收口

**Files:**
- Modify: `sales-intel-demo/src/components/ResearchProgress.tsx`
- Modify: `sales-intel-demo/src/components/ContactSection.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

- [ ] 增加失败断言：生成页显示 `progress-spinner`，不显示边框 SVG；联系人不显示“真实公开联系人”或“信息说明”。
- [ ] 使用 CSS 伪元素绘制局部黑色进度边框，并渲染小型 spinner 和紧凑进度文本。
- [ ] 删除联系人和信息说明卡；将剩余卡片改为统一左对齐网格。
- [ ] 统一历史列表的分隔线、按钮和品牌防压缩样式。
- [ ] 运行 UI 测试。

### Task 2: 删除备注和不稳定匹配数字

**Files:**
- Modify: `sales-intel-demo/src/components/ReportDetailPage.tsx`
- Modify: `sales-intel-demo/src/components/TabMatchingOpportunity.tsx`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`

- [ ] 增加失败断言：目录不含“备注”，报告不含“匹配机会数”。
- [ ] 删除第七章及 TabEvidence 引用，删除产品匹配数量卡。
- [ ] 运行 UI 测试。

### Task 3: 必出且诚实的机会与痛点

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/src/components/TabMatchingOpportunity.tsx`
- Test: `sales-intel-demo/tests/unit/llm.test.ts`

- [ ] 增加失败测试：无模型机会结果但有产品信息时，结果含一条 `inferred` 待验证机会。
- [ ] 在 LLM 机会阶段失败或返回空数组时，构造一条限定为待验证的切入点、切入问题和产品关联。
- [ ] 前端将该条目按“待确认事项/我方切入点/首次沟通要问”结构展示。
- [ ] 运行 LLM 与 UI 测试。

### Task 4: Notion 式行业选择与自定义行业端到端传递

**Files:**
- Modify: `sales-intel-demo/src/lib/types.ts`
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/src/app/api/research/route.ts`
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/src/app/globals.css`
- Test: `sales-intel-demo/tests/unit/types.test.ts`

- [ ] 增加失败测试：`customIndustry` 通过输入 Schema 解析。
- [ ] 新建一个本地 React 选择器组件，支持搜索、常见行业、选择“自定义行业”后的文本输入。
- [ ] 在请求体、服务端 Schema 和模型上下文传递 `customIndustry`。
- [ ] 运行类型、单元测试、lint 和生产构建。

