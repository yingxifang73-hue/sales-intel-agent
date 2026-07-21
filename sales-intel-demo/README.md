# 售前销售情报作战卡 Demo

输入目标公司网址、行业和你的产品信息，生成带公开来源的售前作战卡：概览、业务信号、待验证的核心潜在痛点、产品切入、销售谈话建议和发现型问题。

## 启动

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`。

## 公开资料采集方式

系统按以下顺序工作：

1. Node.js `fetch()` 先直连目标官网的公开 HTML 页面；
2. 配置 `FIRECRAWL_API_KEY` 后，Firecrawl 必定作为第二步继续补充：抓取可读 Markdown，并按行业重点补充公开网页和新闻；
3. 两路资料合并去重。任意一路成功即可继续生成；两路都没有可用来源时才返回错误。

页面中的“采集与生成状态”是正常状态说明，不是错误。只有确实影响资料覆盖的问题才会显示为红色提醒。

## 配置模型建议

复制 `.env.example` 为 `.env.local`，按需设置：

```bash
FIRECRAWL_API_KEY=...
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-pro
ENABLE_LLM_ENHANCEMENT=true
```

模型只增强“业务核心潜在痛点”和“销售谈话建议”。即使模型不可用或返回格式不完整，报告也会继续使用实际采集的来源标题和摘要生成可核验的证据版建议；不会退回无关的通用模板。

请勿将 API 密钥提交到仓库或填写到浏览器端。

## 验证

```bash
pnpm vitest run
pnpm build
```

## 安全边界

- 仅允许公开 HTTP(S) 目标；拒绝 localhost、私网和保留地址。
- 不绕过登录、付费墙、反爬或网站访问规则。
- 每项痛点是待验证假设，且保留来源链接；不要将公开资料推断表述为客户已确认的内部事实。
