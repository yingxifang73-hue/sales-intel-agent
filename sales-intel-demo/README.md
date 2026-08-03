# 销售调研 Agent

面向 B2B 销售的公开信息调研工具。输入目标公司官网、行业和我方产品后，系统基于真实公开来源生成可追溯的销售调研报告。

## 报告输出

报告为一体化长页，按销售使用优先级展示：

1. 销售结论：是否值得联系、关键客户信号、优先机会和下一步。
2. 联系方式与地址：仅展示可被公开来源验证的官网、联系页、电话、邮箱、线上渠道、地址和真实联系人。
3. 客户画像、产品匹配、机会与痛点、首次沟通方案。
4. 补充信息与证据备份：默认折叠，支持来源追溯和 JSON 导出。

系统明确区分来源直接事实、AI 基于多条事实的判断和信息不足时的缺口；不会把推测写成客户已确认的事实，也不会使用假公司数据填充报告。

## 启动

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`。

## 资料采集

系统按以下顺序工作：

1. Firecrawl（配置 `FIRECRAWL_API_KEY` 时）发现官网页面并抓取正文 Markdown；
2. Node.js 直连作为官网抓取降级通道；Serper 只用于发现外部公开来源；
3. 采集结果合并去重。任意一路成功即可继续生成；所有通道都没有可用来源时才返回错误。

## 配置

复制 `.env.example` 为 `.env.local`，按需设置：

```bash
FIRECRAWL_API_KEY=...
SERPER_API_KEY=...
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
ENABLE_LLM_ENHANCEMENT=true
```

`OPENAI_BASE_URL` 和 `OPENAI_MODEL` 支持 OpenAI 兼容服务。模型增强不可用时，系统仍会从实际采集的公开来源生成基础报告，不会退回模板或演示数据。

请勿将 API 密钥提交到仓库或填写到浏览器端。

## Render + GitHub Actions 后台调研

Render 只负责网页、创建调研任务和读取进度。完整的抓取、事实提取、报告分析和质量校验由 GitHub Actions 在后台完成，因此切换页面或 Render 的 HTTP 请求结束都不会中断调研。

在 Render 的 Environment 中设置：

```bash
GITHUB_REPOSITORY=yingxifang73-hue/sales-intel-agent
GITHUB_REF=feat/sales-intelligence-demo
GITHUB_DISPATCH_TOKEN=...
RESEARCH_DISPATCH_GRACE_MS=420000
```

`GITHUB_DISPATCH_TOKEN` 应为细粒度 GitHub Token，仅授予该私有仓库的 **Actions: Read and write** 权限。它只用于触发 `.github/workflows/research-runner.yml`，不会传递模型或抓取密钥。

在 GitHub 仓库的 Actions secrets 中设置：

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_MODEL
ENABLE_LLM_ENHANCEMENT
SERPER_API_KEY
JINA_API_KEY
FIRECRAWL_API_KEY
FIRECRAWL_BASE_URL
```

请在 GitHub 的 Billing → Actions 中把预算设为 **$0**。GitHub Free 私有仓库每月有 2,000 分钟 Linux 运行额度；额度耗尽时任务会被 GitHub 阻止，不会产生自动扣费。若任务在 7 分钟内未被 GitHub Actions 接收，系统会标记失败、说明配置原因，并自动释放本次兑换码次数。

## 验证

```bash
pnpm vitest run
pnpm build
```

## 安全边界

- 仅允许公开 HTTP(S) 目标；拒绝 localhost、私网和保留地址。
- 不绕过登录、付费墙、反爬或网站访问规则。
- 正式接口只运行真实采集与 LangGraph 工作流，不提供假数据模式。
