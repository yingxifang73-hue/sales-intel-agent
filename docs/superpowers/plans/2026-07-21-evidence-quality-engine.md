# Evidence Quality Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让客户调研报告经过清洗、筛选、中文理解和质量验收后再交付，消除英文拼接、HTML 乱码、章节错配和产品无关话术。

**Architecture:** 新增独立证据处理模块，负责解码、清洗、片段选择和中文质量检测。模型层拆为公司研究与销售策略两次调用，并分别宽松解析和校验；研究层仅提供诚实的中文占位，不再把英文原文直接展示为报告结论。

**Tech Stack:** TypeScript、Zod、Vitest、Next.js、Firecrawl、DeepSeek OpenAI-compatible API。

## Global Constraints

- 最终正文以中文为主，专有名词除外。
- 不得输出未解码 HTML 实体。
- 公开事实必须绑定有效来源 ID。
- 子业务不得冒充集团整体事实。
- 销售建议必须同时关联客户公开信号和用户产品。
- 模型内容不合格时不得展示原始英文片段。

---

### Task 1: 证据清洗与质量检测

**Files:**
- Create: `sales-intel-demo/src/lib/evidence.ts`
- Create: `sales-intel-demo/tests/unit/evidence.test.ts`
- Modify: `sales-intel-demo/src/lib/research.ts`

- [ ] 写失败测试：解码 `&#39;`、`&quot;`、数字/十六进制实体，过滤导航与 Cookie 文案。
- [ ] 写失败测试：从长页面选择公司介绍、产品与新闻相关的高信息密度片段。
- [ ] 写失败测试：检测正文中文占比、残留 HTML 实体与乱码特征。
- [ ] 实现 `decodeHtmlEntities`、`cleanSourceText`、`selectEvidenceExcerpts`、`isReadableChinese`。
- [ ] 在直连与 Firecrawl 来源进入去重前统一清洗标题和正文。
- [ ] 运行 `pnpm vitest run tests/unit/evidence.test.ts`。

### Task 2: 公司研究结构化模型调用

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/tests/unit/llm.test.ts`

- [ ] 写失败测试：完整中文公司研究 JSON 能归一化为 Overview 和 Analysis。
- [ ] 写失败测试：英语主导、残留 HTML 实体、未知来源 ID 的结果被拒绝。
- [ ] 实现 `normalizeCompanyResearch`，对字段做宽松解析、来源校验和中文质量门。
- [ ] 使用清洗后的证据包调用 DeepSeek，提示目标公司/子业务范围和证据不足规则。
- [ ] 公司研究失败时返回明确状态，不把原始英文填入结论。

### Task 3: 产品相关销售策略模型调用

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/tests/unit/llm.test.ts`
- Modify: `sales-intel-demo/src/app/page.tsx`

- [ ] 写失败测试：销售策略必须包含用户产品名、客户信号、有效来源和中文正文。
- [ ] 实现第二阶段策略调用，以已通过质检的公司研究作为输入。
- [ ] 产品只有名称时，提示模型使用“待验证关联”，不推断未提供的功能和指标。
- [ ] 将“你的产品”提示文字改为支持名称或一句自然语言描述。
- [ ] 运行 LLM 单元测试。

### Task 4: 诚实降级与页面状态

**Files:**
- Modify: `sales-intel-demo/src/lib/research.ts`
- Modify: `sales-intel-demo/src/lib/types.ts`
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/tests/unit/research.test.ts`

- [ ] 基础报告只输出中文状态和来源摘要标签，不直接显示英文原文。
- [ ] 模型研究未通过质量门时，页面明确显示“中文研究未完成，请重试”。
- [ ] 保留来源链接，避免用泛化模板伪装完整研究。
- [ ] 更新研究测试，断言降级内容无英文长句和 HTML 实体。

### Task 5: 美的真实验收

**Files:**
- Modify: `sales-intel-demo/README.md`

- [ ] 重新构建并重启本地服务。
- [ ] 使用美的官网、制造业、冰箱制造器发起真实请求。
- [ ] 自动检查四章节中文占比、HTML 实体、有效引用、产品名称、来源数和模型状态。
- [ ] 人工抽查公司介绍、近期动态和开场话术是否语义相关。
- [ ] 运行 `pnpm vitest run` 与 `pnpm build`。
- [ ] 更新 README 并提交。
