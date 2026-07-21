# 双通道销售情报重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让售前情报 Demo 合并 Node.js 直连与 Firecrawl 的公开来源，并稳定输出基于真实证据的痛点和销售谈话建议。

**Architecture:** 采集层返回独立通道结果、状态与真实警告；协调器同时汇总直连与 Firecrawl 的来源并去重。证据层从来源中构建公司相关的基础卡片；模型层只可选地覆盖两项销售建议，并在输出不完整时局部归一化而不是丢弃整份结果。

**Tech Stack:** Next.js 16、TypeScript、Zod、Vitest、Firecrawl SDK、OpenAI-compatible DeepSeek API。

## Global Constraints

- 仅访问公开 HTTP(S) 内容，并继续使用现有 SSRF 防护。
- Node.js 直连优先；配置 Firecrawl 时必须作为第二步补充执行。
- 任何痛点均为待验证假设，且必须关联真实来源。
- 不记录或展示 API 密钥。
- 不绕过登录、反爬或访问限制。

---

### Task 1: 建立双通道采集合同与测试

**Files:**
- Modify: `sales-intel-demo/src/lib/research.ts`
- Modify: `sales-intel-demo/tests/unit/research.test.ts`

**Interfaces:**
- Produces `CollectionResult`，包含 `sources`、`notes` 与 `warnings`。
- `HybridCrawler.collect(input)` 总是尝试直连；配置密钥时也尝试 Firecrawl。

- [ ] 写入模拟直连成功、Firecrawl 成功的测试，断言两路均被调用且来源合并。
- [ ] 写入单路失败测试，断言另一路来源仍可用于生成报告。
- [ ] 将采集接口拆分为独立通道结果，`Promise.allSettled` 汇总两路结果。
- [ ] 将成功/覆盖信息放入 `notes`，仅把影响来源覆盖的情况放入 `warnings`。
- [ ] 运行 `pnpm vitest run tests/unit/research.test.ts`，确认通过。

### Task 2: 以真实来源生成基础作战卡

**Files:**
- Modify: `sales-intel-demo/src/lib/research.ts`
- Modify: `sales-intel-demo/tests/unit/research.test.ts`

**Interfaces:**
- Produces `synthesizeBattlecard(input, sources, notes, warnings)`。
- 每个基础痛点、信号与开场均引用来源标题或有效摘要和有效 source ID。

- [ ] 写入来源标题和摘要不同于行业预设词的测试，断言生成内容包含该来源信息。
- [ ] 实现 HTML 元描述/正文段落的摘要提取和重复文本过滤。
- [ ] 使规则卡片使用选中的真实摘要，保留待验证语气。
- [ ] 运行研究层单元测试，确认不再生成固定的泛化事实。

### Task 3: 增加可恢复的模型建议解析

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Create: `sales-intel-demo/tests/unit/llm.test.ts`

**Interfaces:**
- Produces `enhanceWithLlm(card, input, config)`，模型可用字段仅覆盖 `painHypotheses` 与 `talkTrack`。
- 支持从 Markdown code fence 或文本中提取 JSON，且对数组/字符串差异归一化。

- [ ] 写入“有效 JSON”“avoid 为字符串”“缺少非关键字段”“截断 JSON”的测试。
- [ ] 实现紧凑证据包和 JSON 提取/安全解析函数。
- [ ] 对缺少的字段用证据卡片对应字段补全；无可用模型内容时保留证据卡片并附中性状态说明。
- [ ] 对 DeepSeek 使用非思考模式、有限重试和无密钥诊断日志。
- [ ] 运行 `pnpm vitest run tests/unit/llm.test.ts`，确认通过。

### Task 4: 区分状态、警告与错误的页面呈现

**Files:**
- Modify: `sales-intel-demo/src/lib/types.ts`
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`
- Modify: `sales-intel-demo/tests/unit/types.test.ts`

**Interfaces:**
- `Battlecard` 增加 `collectionNotes` 与可选 `modelStatus`。
- 页面以中性状态块显示正常采集，以告警块显示实际影响结果的错误。

- [ ] 写入类型校验测试，覆盖新字段。
- [ ] 更新类型、API 返回值和前端结果渲染。
- [ ] 增加信息状态样式，不复用红色 warning 样式。
- [ ] 运行类型测试与构建，确认通过。

### Task 5: 真实端到端验证

**Files:**
- Modify: `sales-intel-demo/README.md`

- [ ] 使用不含密钥的真实官网请求验证 API 返回非空来源、痛点和销售谈话建议。
- [ ] 记录来源数量、采集通道状态、模型是否采用和关键字段数量；不输出密钥与完整客户内容。
- [ ] 运行 `pnpm vitest run` 与 `pnpm build`。
- [ ] 更新 README，说明直连与 Firecrawl 的补充关系、DeepSeek 配置和故障含义。
- [ ] 提交实现与测试。
