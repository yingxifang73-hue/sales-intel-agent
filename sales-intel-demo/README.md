# 客户调研报告 Demo

面向 B2B 销售的 Pre-call Research Agent。输入客户官网、行业预设、你的产品和一句价值主张，自动汇总公开资料并生成首次电话或拜访前可直接阅读的客户调研报告。

## 报告输出

每次生成一份完整的 Pre-call Research Report：

1. **Company Overview｜公司概览**：公司介绍、产品和服务、行业与业务覆盖、近期动态。
2. **Company Analysis｜公司分析**：商业模式、产品定位、目标客户、竞争观察与待验证的业务核心潜在痛点。
3. **Sales Strategy｜销售策略**：电话切入点、推荐理由、开场话术、待验证的潜在需求、5 个发现型问题和建议下一步。
4. **Sources｜来源与采集状态**：可点击的公开来源，以及直连、Firecrawl、模型建议的状态。

公开事实均保留来源；痛点、需求和竞争判断均为待验证分析，不应被表述为客户已确认的内部事实。

## 启动

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`。

## 资料采集

系统按以下顺序工作：

1. Node.js `fetch()` 先访问目标官网的公开 HTML 页面；
2. 配置 `FIRECRAWL_API_KEY` 后，Firecrawl 必定作为第二步补充官网 Markdown，以及公开网页和新闻；
3. 两路结果合并去重。任意一路成功即可继续生成；两路都没有可用来源时才返回错误。

## 配置模型建议

复制 `.env.example` 为 `.env.local`，按需设置：

```bash
FIRECRAWL_API_KEY=...
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-pro
ENABLE_LLM_ENHANCEMENT=true
```

模型会增强公司分析与销售策略。模型没有采用时，完整报告仍会使用实际采集的公开来源生成，不会退回无关模板。

请勿将 API 密钥提交到仓库或填写到浏览器端。

## 验证

```bash
pnpm vitest run
pnpm build
```

## 安全边界

- 仅允许公开 HTTP(S) 目标；拒绝 localhost、私网和保留地址。
- 不绕过登录、付费墙、反爬或网站访问规则。
