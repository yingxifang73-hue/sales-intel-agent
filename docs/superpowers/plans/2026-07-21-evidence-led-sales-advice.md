# Evidence-led Sales Advice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` task-by-task.

**Goal:** 使用 Qwen3.7-Max 在作战卡中生成可引用的潜在痛点和销售谈话建议。

**Architecture:** 保留现有采集和规则兜底；新增 OpenAI 兼容 LLM 端口，仅接收已去重来源及卖方信息，输出经 Zod 校验的结构化内容。

**Tech Stack:** Next.js、TypeScript、Zod、OpenAI SDK、Vitest。

### Task 1: 配置与数据契约

- [ ] 扩展环境配置，加入 `OPENAI_BASE_URL`。
- [ ] 为痛点和谈话建议新增可引用 schema，并写配置/schema 测试。

### Task 2: 模型生成与可靠回退

- [ ] 用 fake LLM 测试引用约束与失败回退。
- [ ] 实现 OpenAI-compatible 客户端，模型失败时返回规则版及警告。

### Task 3: 报告界面与验证

- [ ] 展示两块新内容及来源编号。
- [ ] 运行测试、类型检查、lint、构建和本地 API 验证。
