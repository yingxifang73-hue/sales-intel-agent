# 售前销售情报 Agent Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可供 30 位体验用户使用的网页 Demo：输入卖方产品与目标公司官网，流式完成公开信息采集、证据整理、销售推理，并生成带来源的会前销售作战卡。

**Architecture:** 使用 Next.js App Router 构建单体全栈应用。业务逻辑是一条可观测流水线，依次调用 Firecrawl 托管 API、证据抽取和销售合成；Firecrawl 与 LLM 都隔离在 provider 接口后，测试使用 fake provider。研究结果和用户反馈保存在 SQLite，页面通过 NDJSON 流接收真实进度与最终报告。

**Tech Stack:** Node.js 24.14.0；Next.js 16.2.10；React 19.2.7；TypeScript 7.0.2；Tailwind CSS 4.3.3；Zod 4.4.3；OpenAI SDK 6.48.0；Firecrawl SDK 4.30.1；better-sqlite3 12.11.1；Vitest 4.1.10；Testing Library 16.3.2；Playwright 1.61.1。

## Global Constraints

- 项目目录固定为 `sales-intel-demo/`，规格与计划保留在仓库根目录的 `docs/superpowers/`。
- 只允许公开、无需登录的网页来源；不绕过验证码、付费墙、登录或网站访问控制。
- 所有事实和触发信号的 `sourceIds` 必须引用存在的来源；无法校验的事实不得显示。
- 单份报告上限：3 个触发信号、3 个痛点假设、3 个产品映射、5 个推荐问题、5 个风险。
- 研究成功最低条件：至少 2 个有效公开来源；理想条件为至少 5 个去重来源和 2 个官方域名来源。
- 普通任务目标：中位完成时间不超过 90 秒，95 分位不超过 180 秒，单次外部服务成本不超过人民币 3 元。
- 目标视口为 390px 和 1440px，任何页面不得出现横向滚动。
- 研究记录最多保存 30 天，服务启动时清理过期记录。
- 首版只使用 Firecrawl 托管 API；不得复制或嵌入 Firecrawl AGPL 服务端源码。

---

## File Map

```text
sales-intel-demo/
├─ package.json                         # 脚本与精确依赖版本
├─ tsconfig.json                        # TypeScript strict 与 @/* 路径别名
├─ eslint.config.mjs                    # Next.js ESLint flat config
├─ postcss.config.mjs                   # Tailwind PostCSS 插件
├─ .env.example                        # 服务端环境变量名和安全默认值
├─ next.config.ts                      # standalone 部署输出
├─ vitest.config.ts                    # jsdom/node 测试配置
├─ playwright.config.ts                # 浏览器验收配置
├─ Dockerfile                          # Node standalone 部署
├─ THIRD_PARTY_NOTICES.md              # 外部服务与开源许可证记录
├─ README.md                            # 本地运行、部署和体验说明
├─ .gitignore                           # 密钥、构建物与 SQLite 排除规则
├─ data/.gitkeep                       # SQLite 持久化目录
├─ public/.gitkeep                     # standalone image 的静态资源目录
├─ scripts/delete-run.ts               # 按运行 ID 删除数据
├─ src/app/layout.tsx                  # 页面元数据、字体和全局骨架
├─ src/app/page.tsx                    # Demo 单页入口
├─ src/app/globals.css                 # 视觉 tokens 与打印样式
├─ src/app/api/access/route.ts         # 邀请码换 HttpOnly Cookie
├─ src/app/api/research/route.ts       # NDJSON 研究流接口
├─ src/app/api/feedback/route.ts       # 反馈写入接口
├─ src/components/demo-shell.tsx       # 输入、进度、报告状态机
├─ src/components/seller-profile-form.tsx
├─ src/components/target-form.tsx
├─ src/components/progress-timeline.tsx
├─ src/components/battlecard.tsx
├─ src/components/feedback-bar.tsx
├─ src/lib/config.ts                    # 环境变量校验
├─ src/lib/auth/session.ts              # 邀请码会话签名与校验
├─ src/lib/domain/schemas.ts            # 唯一领域 schema 与类型源
├─ src/lib/providers/crawler.ts         # CrawlerPort 接口
├─ src/lib/providers/firecrawl.ts       # Firecrawl 适配器
├─ src/lib/providers/llm.ts             # LlmPort 接口
├─ src/lib/providers/openai-compatible.ts
├─ src/lib/research/presets.ts          # 五个研究预设
├─ src/lib/research/url-policy.ts        # URL/SSRF 防护
├─ src/lib/research/dedupe.ts            # URL 与内容去重
├─ src/lib/research/collect.ts           # 查询规划和采集编排
├─ src/lib/intelligence/extract-evidence.ts
├─ src/lib/intelligence/synthesize-report.ts
├─ src/lib/intelligence/validate-citations.ts
├─ src/lib/pipeline/run-research.ts      # 五阶段流水线
├─ src/lib/pipeline/ndjson.ts            # 流事件编码
├─ src/lib/storage/database.ts           # SQLite 初始化与 30 天清理
├─ src/lib/storage/run-repository.ts
├─ src/lib/storage/feedback-repository.ts
├─ tests/unit/*.test.ts                  # 领域与纯函数测试
├─ tests/setup.ts                        # Testing Library matcher
├─ tests/integration/*.test.ts           # provider、流水线、数据库测试
├─ tests/e2e/demo.spec.ts                # 390px/1440px 主流程验收
├─ tests/evaluation/*.test.ts            # 引用覆盖和报告上限
└─ tests/fixtures/research-fixture.ts    # 可重复研究结果
```

### Task 1: 初始化可测试的全栈项目

**Files:**
- Create: `sales-intel-demo/package.json`
- Create: `sales-intel-demo/.gitignore`
- Create: `sales-intel-demo/tsconfig.json`
- Create: `sales-intel-demo/eslint.config.mjs`
- Create: `sales-intel-demo/postcss.config.mjs`
- Create: `sales-intel-demo/.env.example`
- Create: `sales-intel-demo/next.config.ts`
- Create: `sales-intel-demo/vitest.config.ts`
- Create: `sales-intel-demo/playwright.config.ts`
- Create: `sales-intel-demo/src/app/layout.tsx`
- Create: `sales-intel-demo/src/app/page.tsx`
- Create: `sales-intel-demo/src/app/globals.css`
- Create: `sales-intel-demo/tests/setup.ts`
- Create: `sales-intel-demo/data/.gitkeep`
- Create: `sales-intel-demo/public/.gitkeep`
- Test: `sales-intel-demo/tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: Node.js 24.14.0 与 pnpm。
- Produces: 可启动、可构建、可执行 Vitest/Playwright 的 Next.js 应用。

- [ ] **Step 1: 初始化 Git 与目录**

Run:

```powershell
git init
New-Item -ItemType Directory -Force sales-intel-demo/src/app, sales-intel-demo/tests/unit, sales-intel-demo/tests/integration, sales-intel-demo/tests/e2e, sales-intel-demo/tests/evaluation, sales-intel-demo/tests/fixtures, sales-intel-demo/data, sales-intel-demo/public | Out-Null
```

Expected: 根目录出现 `.git/`，所有目录创建成功；不删除现有 `docs/`、`outputs/` 或 `work/`。

- [ ] **Step 2: 写入固定版本依赖**

`sales-intel-demo/package.json` 的依赖必须是：

```json
{
  "name": "sales-intelligence-demo",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "12.11.1",
    "firecrawl": "4.30.1",
    "next": "16.2.10",
    "openai": "6.48.0",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "@tailwindcss/postcss": "4.3.3",
    "@testing-library/jest-dom": "7.0.0",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/better-sqlite3": "7.6.13",
    "@types/node": "26.1.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "eslint": "10.7.0",
    "eslint-config-next": "16.2.10",
    "jsdom": "29.1.1",
    "tailwindcss": "4.3.3",
    "tsx": "4.23.1",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 3: 写失败的 smoke test**

```ts
import { describe, expect, it } from "vitest";

describe("project", () => {
  it("runs the test harness", () => {
    expect("sales-intelligence-demo").toBe("not-configured");
  });
});
```

- [ ] **Step 4: 安装依赖并验证测试失败**

Run:

```powershell
cd sales-intel-demo
pnpm install --frozen-lockfile=false
pnpm test -- tests/unit/smoke.test.ts
```

Expected: FAIL，显示 `expected 'sales-intelligence-demo' to be 'not-configured'`。

- [ ] **Step 5: 完成最小页面与测试配置**

`src/app/page.tsx`：

```tsx
export default function HomePage() {
  return <main><h1>会前销售作战卡</h1></main>;
}
```

将 smoke test 的期望改为：

```ts
expect("sales-intelligence-demo").toBe("sales-intelligence-demo");
```

`next.config.ts` 必须设置：

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = { output: "standalone" };
export default nextConfig;
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`eslint.config.mjs`：

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "data/*.db*"])
]);
```

`postcss.config.mjs`：

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`.gitignore`：

```gitignore
node_modules/
.next/
playwright-report/
test-results/
.env
.env.local
data/*.db
data/*.db-shm
data/*.db-wal
```

`vitest.config.ts` 与 `tests/setup.ts`：

```ts
// vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "jsdom", setupFiles: ["./tests/setup.ts"], include: ["tests/**/*.test.{ts,tsx}"] }
});

// tests/setup.ts
import "@testing-library/jest-dom/vitest";
```

`playwright.config.ts`：

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: { command: "pnpm dev", port: 3000, reuseExistingServer: true },
  use: { baseURL: "http://127.0.0.1:3000" }
});
```

`layout.tsx` 和 `globals.css`：

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "会前销售作战卡", description: "公开证据驱动的 B2B 会前研究 Demo" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
```

```css
@import "tailwindcss";
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; overflow-x: hidden; }
body { background: #f5f2e9; color: #14213d; font-family: Arial, "Microsoft YaHei", sans-serif; }
```

- [ ] **Step 6: 验证基础质量门**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: 三条命令均以 exit code 0 完成，构建输出包含 `/`。

- [ ] **Step 7: Commit**

```powershell
git add sales-intel-demo docs/superpowers
git commit -m "chore: scaffold sales intelligence demo"
```

### Task 2: 定义领域模型、行业预设与配置边界

**Files:**
- Create: `sales-intel-demo/src/lib/config.ts`
- Create: `sales-intel-demo/src/lib/domain/schemas.ts`
- Create: `sales-intel-demo/src/lib/research/presets.ts`
- Test: `sales-intel-demo/tests/unit/schemas.test.ts`
- Test: `sales-intel-demo/tests/unit/presets.test.ts`

**Interfaces:**
- Consumes: Zod 4.4.3。
- Produces: `ResearchInput`、`Source`、`Evidence`、`Battlecard`、`PipelineEvent`、`getResearchPreset()`。

- [ ] **Step 1: 写 schema 失败测试**

```ts
import { describe, expect, it } from "vitest";
import { ResearchInputSchema } from "@/lib/domain/schemas";

describe("ResearchInputSchema", () => {
  it("rejects missing seller context", () => {
    const result = ResearchInputSchema.safeParse({ targetUrl: "https://example.com", preset: "ai" });
    expect(result.success).toBe(false);
  });

  it("accepts a complete request", () => {
    const result = ResearchInputSchema.safeParse({
      seller: {
        productName: "智能客服",
        valueProposition: "降低重复咨询成本",
        problemsSolved: ["响应慢"],
        idealCustomer: "有官网咨询量的企业",
        proofPoints: []
      },
      targetUrl: "https://example.com",
      preset: "ai",
      contactRole: "销售负责人",
      meetingGoal: "确认需求",
      knownContext: ""
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认模块不存在**

Run: `pnpm test -- tests/unit/schemas.test.ts`

Expected: FAIL，错误包含 `Cannot find module '@/lib/domain/schemas'`。

- [ ] **Step 3: 实现唯一领域 schema**

`schemas.ts` 至少定义并导出：

```ts
import { z } from "zod";

export const PresetSchema = z.enum(["general", "ecommerce", "foreign_trade", "ai", "manufacturing"]);
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const SellerProfileSchema = z.object({
  productName: z.string().trim().min(2).max(80),
  valueProposition: z.string().trim().min(5).max(300),
  problemsSolved: z.array(z.string().trim().min(2).max(120)).min(1).max(5),
  idealCustomer: z.string().trim().min(2).max(200),
  proofPoints: z.array(z.string().trim().min(2).max(300)).max(5)
});

export const ResearchInputSchema = z.object({
  seller: SellerProfileSchema,
  targetUrl: z.url().max(2048),
  preset: PresetSchema,
  contactRole: z.string().trim().max(100).default(""),
  meetingGoal: z.string().trim().max(300).default(""),
  knownContext: z.string().trim().max(1000).default("")
});

export const SourceSchema = z.object({
  id: z.string().min(1),
  url: z.url(),
  title: z.string().min(1),
  content: z.string().min(1),
  sourceType: z.enum(["official", "government", "media", "partner", "other"]),
  publishedAt: z.string().nullable(),
  fetchedAt: z.iso.datetime(),
  contentHash: z.string().length(64)
});

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  evidenceText: z.string().min(1).max(500),
  publishedAt: z.string().nullable(),
  kind: z.enum(["fact", "signal"]),
  confidence: ConfidenceSchema
});
```

`BattlecardSchema` 必须包含 `overview`、`signals`、`painHypotheses`、`productMappings`、`questions`、`opening`、`risks`、`sources`，并用 `.max()` 固定规格中的数量上限。

- [ ] **Step 4: 实现五个行业预设并测试差异**

```ts
export const RESEARCH_PRESETS = {
  general: ["公司定位", "产品与服务", "客户与案例", "近期动态", "招聘变化"],
  ecommerce: ["销售渠道与平台", "品牌与SKU", "内容与流量", "履约供应链", "招聘与扩张"],
  foreign_trade: ["出口市场", "产品认证", "展会", "海外渠道", "多语言服务"],
  ai: ["产品层级与技术", "应用场景", "客户案例", "融资招聘", "近期发布与合规"],
  manufacturing: ["产品目录", "产能工艺", "认证", "经销网络", "扩产招聘与招投标"]
} as const;
```

测试断言 `foreign_trade` 包含“产品认证”，`manufacturing` 包含“产能工艺”，且所有预设正好有 5 个主题。

- [ ] **Step 5: 实现环境变量校验**

```ts
const EnvSchema = z.object({
  DEMO_ACCESS_CODE: z.string().min(8),
  COOKIE_SECRET: z.string().min(32),
  FIRECRAWL_API_KEY: z.string().min(10),
  LLM_API_KEY: z.string().min(10),
  LLM_BASE_URL: z.url(),
  LLM_MODEL: z.string().min(1),
  SQLITE_PATH: z.string().default("./data/demo.db")
});

export function getConfig() {
  return EnvSchema.parse(process.env);
}
```

`getConfig()` 必须惰性调用，不得在模块导入时解析环境变量，确保无生产密钥时仍可完成类型检查、单元测试和静态构建。

`.env.example` 只包含变量名和非敏感默认值：

```dotenv
DEMO_ACCESS_CODE=
COOKIE_SECRET=
FIRECRAWL_API_KEY=
LLM_API_KEY=
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen3.5-plus
SQLITE_PATH=./data/demo.db
```

- [ ] **Step 6: 验证并提交**

Run: `pnpm test -- tests/unit/schemas.test.ts tests/unit/presets.test.ts && pnpm typecheck`

Expected: PASS；TypeScript 无错误。

```powershell
git add sales-intel-demo
git commit -m "feat: define research domain and presets"
```

### Task 3: 建立 URL 安全、来源标准化与去重

**Files:**
- Create: `sales-intel-demo/src/lib/research/url-policy.ts`
- Create: `sales-intel-demo/src/lib/research/dedupe.ts`
- Test: `sales-intel-demo/tests/unit/url-policy.test.ts`
- Test: `sales-intel-demo/tests/unit/dedupe.test.ts`

**Interfaces:**
- Consumes: 原始 URL 和 `Source[]`。
- Produces: `assertPublicHttpUrl(url): Promise<URL>`、`canonicalizeUrl(url): string`、`dedupeSources(sources): Source[]`。

- [ ] **Step 1: 写 URL 安全失败测试**

```ts
it.each([
  "file:///etc/passwd",
  "http://localhost:3000",
  "http://127.0.0.1",
  "http://169.254.169.254/latest/meta-data",
  "http://10.0.0.1"
])("rejects %s", async (url) => {
  await expect(assertPublicHttpUrl(url)).rejects.toThrow("PUBLIC_HTTP_URL_REQUIRED");
});

it("accepts a public https URL", async () => {
  await expect(assertPublicHttpUrl("https://example.com")).resolves.toMatchObject({ hostname: "example.com" });
});
```

- [ ] **Step 2: 实现协议、主机和 DNS 结果校验**

实现必须使用 `node:dns/promises` 的 `lookup(hostname, { all: true })`，并拒绝 IPv4 私网、loopback、link-local、IPv6 `::1`、`fc00::/7`、`fe80::/10`。DNS 查询失败返回 `TARGET_DOMAIN_UNRESOLVED`，不是继续访问。

- [ ] **Step 3: 写并实现去重测试**

```ts
it("removes tracking parameters and duplicate content", () => {
  const result = dedupeSources([
    source("https://example.com/news?utm_source=x", "same body"),
    source("https://example.com/news/", "same body"),
    source("https://partner.com/item", "same body")
  ]);
  expect(result).toHaveLength(1);
  expect(result[0].url).toBe("https://example.com/news");
});
```

`canonicalizeUrl` 删除 `utm_*`、`gclid`、`fbclid`，对 hostname 小写，移除默认端口、fragment 和非根路径尾部斜杠。`dedupeSources` 先按规范 URL、再按 SHA-256 正文哈希去重。

- [ ] **Step 4: 验证并提交**

Run: `pnpm test -- tests/unit/url-policy.test.ts tests/unit/dedupe.test.ts`

Expected: 所有恶意 URL 被拒绝，规范化和内容哈希测试通过。

```powershell
git add sales-intel-demo
git commit -m "feat: secure and deduplicate research sources"
```

### Task 4: 实现可替换的 Firecrawl 采集层

**Files:**
- Create: `sales-intel-demo/src/lib/providers/crawler.ts`
- Create: `sales-intel-demo/src/lib/providers/firecrawl.ts`
- Create: `sales-intel-demo/src/lib/research/collect.ts`
- Test: `sales-intel-demo/tests/integration/collect.test.ts`

**Interfaces:**
- Consumes: `ResearchInput`、`RESEARCH_PRESETS`、`CrawlerPort`。
- Produces: `CrawlerPort.mapSite/search/scrape` 与 `collectSources(input, crawler): Promise<Source[]>`。

- [ ] **Step 1: 定义并用 fake crawler 测试采集预算**

```ts
export interface CrawledDocument {
  url: string;
  title: string;
  markdown: string;
  publishedAt: string | null;
}

export interface CrawlerPort {
  mapSite(url: string): Promise<string[]>;
  search(query: string, limit: number): Promise<CrawledDocument[]>;
  scrape(urls: string[]): Promise<CrawledDocument[]>;
}
```

集成测试 fake crawler 返回 10 个站内 URL 和 12 个搜索结果，断言：

- 最多抓取 6 个官网页面。
- 最多执行 5 个行业查询。
- 去重后最多保留 15 个来源。
- 官网至少优先选择首页、about、product/solution、news/blog、careers/job 路径。

- [ ] **Step 2: 运行失败测试**

Run: `pnpm test -- tests/integration/collect.test.ts`

Expected: FAIL，`collectSources` 尚未定义。

- [ ] **Step 3: 实现查询规划与来源分类**

每个查询使用以下确定性模板，不让 LLM 决定搜索预算：

```ts
const query = `site:${hostname} ${topic}`;
const externalQuery = `"${companyName}" ${topic}`;
```

官方域名标记为 `official`；`.gov.cn` 标记为 `government`；标题或域名不能可靠分类时标记为 `other`。单个搜索或抓取失败追加 warning，但继续使用其他成功结果。

- [ ] **Step 4: 实现 FirecrawlAdapter**

```ts
export class FirecrawlAdapter implements CrawlerPort {
  constructor(private readonly client: Firecrawl) {}

  async mapSite(url: string): Promise<string[]> {
    const result = await this.client.map(url, { limit: 50 });
    return result.links.map((item) => typeof item === "string" ? item : item.url);
  }

  async search(query: string, limit: number): Promise<CrawledDocument[]> {
    const result = await this.client.search(query, { limit, scrapeOptions: { formats: ["markdown"] } });
    return mapSearchResult(result);
  }

  async scrape(urls: string[]): Promise<CrawledDocument[]> {
    const settled = await Promise.allSettled(urls.map((url) => this.client.scrape(url, { formats: ["markdown"], onlyMainContent: true })));
    return settled.flatMap(mapSettledScrapeResult);
  }
}
```

适配器测试 mock Firecrawl client，不请求真实网络；断言单页失败不会丢掉其他页面。

- [ ] **Step 5: 验证并提交**

Run: `pnpm test -- tests/integration/collect.test.ts && pnpm typecheck`

Expected: PASS；采集预算和降级行为均被测试覆盖。

```powershell
git add sales-intel-demo
git commit -m "feat: collect public company research sources"
```

### Task 5: 实现结构化证据抽取与销售报告合成

**Files:**
- Create: `sales-intel-demo/src/lib/providers/llm.ts`
- Create: `sales-intel-demo/src/lib/providers/openai-compatible.ts`
- Create: `sales-intel-demo/src/lib/intelligence/extract-evidence.ts`
- Create: `sales-intel-demo/src/lib/intelligence/synthesize-report.ts`
- Create: `sales-intel-demo/src/lib/intelligence/validate-citations.ts`
- Test: `sales-intel-demo/tests/unit/validate-citations.test.ts`
- Test: `sales-intel-demo/tests/integration/intelligence.test.ts`

**Interfaces:**
- Consumes: `ResearchInput`、`Source[]`、`LlmPort.generateJson()`。
- Produces: `Evidence[]` 与已通过 `BattlecardSchema`、引用校验的 `Battlecard`。

- [ ] **Step 1: 定义 LLM 端口和 fake 响应**

```ts
export interface LlmPort {
  generateJson<T>(args: {
    system: string;
    user: string;
    schemaName: string;
    schema: z.ZodType<T>;
  }): Promise<{ data: T; usage: { inputTokens: number; outputTokens: number } | null }>;
}
```

测试 fake LLM 依次返回证据数组和作战卡。断言输入 prompt 包含卖方产品、目标角色、预设主题、带来源 ID 的来源文本。

- [ ] **Step 2: 写引用失败测试**

```ts
it("rejects facts whose sourceIds do not exist", () => {
  expect(() => validateBattlecardCitations(cardWithSource("missing"), [source("s1")]))
    .toThrow("INVALID_SOURCE_REFERENCE:missing");
});

it("accepts hypotheses without pretending they are facts", () => {
  expect(() => validateBattlecardCitations(validHypothesisCard(), [source("s1")])).not.toThrow();
});
```

- [ ] **Step 3: 实现证据抽取 prompt**

系统指令必须明确：

```text
你是证据抽取器，不提供销售建议。只抽取来源文本明确支持的事实或近期信号。
每条证据的 sourceIds 必须引用输入中真实存在的来源 ID；不得用常识补齐营收、规模、客户、融资或战略。
发布日期未知时使用 null。若多个来源支持同一事实，合并 sourceIds。
```

来源正文每条最多送入 8,000 字符，总上下文最多 60,000 字符；按官方、政府、媒体、伙伴、其他顺序截断。

- [ ] **Step 4: 实现销售合成 prompt**

系统指令必须明确：

```text
你是 B2B 销售会前策略助手。事实只能来自 Evidence；推测必须放入 painHypotheses 并标记验证方法。
不要虚构卖方案例。卖方 proofPoints 为空时，productMappings 的 proof 必须为“缺少案例证明”。
开场只能引用 high 或 medium confidence 的 signal/fact，并以发现式问题结束。
```

合成结果先过 `BattlecardSchema.parse()`，再过 `validateBattlecardCitations()`。第一次失败时把 Zod/引用错误追加到修复 prompt，只重试一次。第二次仍为 Zod 结构错误时抛出 `INVALID_LLM_OUTPUT`；若结构合法但仍有无效引用，则用 `stripUnsupportedFacts()` 移除对应事实或信号、在 risks 中追加“部分公开信息因缺少可验证来源未展示”，然后再次执行引用校验。

- [ ] **Step 5: 实现 OpenAI-compatible 适配器**

使用 `chat.completions.create`，温度固定为 `0.1`，`response_format` 固定为 `{ type: "json_object" }`。从 `usage.prompt_tokens` 和 `usage.completion_tokens` 记录 token；没有 usage 时返回 `null`。JSON 解析失败由上层修复重试处理。

- [ ] **Step 6: 验证并提交**

Run:

```powershell
pnpm test -- tests/unit/validate-citations.test.ts tests/integration/intelligence.test.ts
pnpm typecheck
```

Expected: 无来源事实失败；有效证据和假设报告通过；修复重试只发生一次。

```powershell
git add sales-intel-demo
git commit -m "feat: generate evidence-backed sales battlecards"
```

### Task 6: 编排五阶段流水线与 NDJSON 序列化

**Files:**
- Create: `sales-intel-demo/src/lib/pipeline/run-research.ts`
- Create: `sales-intel-demo/src/lib/pipeline/ndjson.ts`
- Test: `sales-intel-demo/tests/integration/run-research.test.ts`
- Test: `sales-intel-demo/tests/unit/ndjson.test.ts`

**Interfaces:**
- Consumes: `CrawlerPort`、`LlmPort`、`ResearchInput`。
- Produces: 顺序固定的 `PipelineEvent`：`started | stage | warning | completed | failed`。

- [ ] **Step 1: 写事件顺序失败测试**

```ts
it("emits all five stages and a completed battlecard", async () => {
  const events = [];
  for await (const event of runResearch(input, deps)) events.push(event);
  expect(events.map((event) => event.type)).toEqual([
    "started", "stage", "stage", "stage", "stage", "stage", "completed"
  ]);
  expect(events.at(-1)?.type).toBe("completed");
});
```

另写失败用例：来源少于 2 个时最后事件是 `failed`，错误码为 `INSUFFICIENT_SOURCES`，且 fake LLM 调用次数为 0。

- [ ] **Step 2: 实现 async generator 流水线**

阶段与 percent 固定：

```ts
const STAGES = [
  { key: "site", label: "识别目标公司与站点结构", percent: 10 },
  { key: "collect", label: "搜索并采集公开来源", percent: 35 },
  { key: "evidence", label: "清洗、去重和抽取证据", percent: 60 },
  { key: "strategy", label: "结合卖方产品生成销售判断", percent: 82 },
  { key: "validate", label: "校验引用并生成作战卡", percent: 95 }
] as const;
```

`started` 生成 UUIDv7 或 `crypto.randomUUID()` runId；`completed` 包含 report 和 metrics；所有异常映射为公开错误码，日志中保留原始错误但不向客户端泄露密钥或完整 prompt。

- [ ] **Step 3: 实现 NDJSON 序列化工具**

```ts
const encoder = new TextEncoder();

export function encodeNdjson(event: PipelineEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}
```

测试把两个事件编码后拼接并按换行解析，断言得到两个完整对象且每行只包含一个事件。

- [ ] **Step 4: 验证并提交**

Run: `pnpm test -- tests/integration/run-research.test.ts tests/unit/ndjson.test.ts`

Expected: 事件顺序、失败降级和 NDJSON 分行行为通过。

```powershell
git add sales-intel-demo
git commit -m "feat: stream research pipeline progress"
```

### Task 7: 实现 SQLite、访问控制与流式 API

**Files:**
- Create: `sales-intel-demo/src/lib/storage/database.ts`
- Create: `sales-intel-demo/src/lib/storage/run-repository.ts`
- Create: `sales-intel-demo/src/lib/storage/feedback-repository.ts`
- Create: `sales-intel-demo/src/lib/auth/session.ts`
- Create: `sales-intel-demo/src/app/api/access/route.ts`
- Create: `sales-intel-demo/src/app/api/research/route.ts`
- Create: `sales-intel-demo/src/app/api/feedback/route.ts`
- Create: `sales-intel-demo/scripts/delete-run.ts`
- Test: `sales-intel-demo/tests/integration/storage.test.ts`
- Test: `sales-intel-demo/tests/integration/access.test.ts`
- Test: `sales-intel-demo/tests/integration/research-route.test.ts`

**Interfaces:**
- Consumes: runId、研究输入、Battlecard、metrics 和反馈。
- Produces: `RunRepository.save/get/delete/pruneExpired`、`FeedbackRepository.create`、`requireDemoSession()` 和受保护的 NDJSON 研究接口。

- [ ] **Step 1: 写内存数据库失败测试**

测试使用 `new Database(":memory:")`，覆盖：保存并读取报告；同一 runId 只能有一条运行；反馈必须关联存在的 runId；`pruneExpired(now)` 删除 30 天前记录并级联删除反馈。

- [ ] **Step 2: 实现确定性 SQLite schema**

```sql
CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY,
  preset TEXT NOT NULL,
  target_url TEXT NOT NULL,
  input_json TEXT NOT NULL,
  report_json TEXT,
  status TEXT NOT NULL CHECK(status IN ('completed','failed')),
  error_code TEXT,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK(rating IN ('useful','incorrect','too_generic')),
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

数据库连接初始化时执行 `PRAGMA foreign_keys = ON`、`PRAGMA journal_mode = WAL`，随后调用 `pruneExpired(new Date())`。

- [ ] **Step 3: 实现签名 Cookie 邀请码会话**

`POST /api/access` 请求体为 `{ code: string }`。使用 `crypto.timingSafeEqual` 比较邀请码，成功后写入名为 `sales_demo_session` 的 HttpOnly、SameSite=Lax、Secure-in-production、7 天有效 Cookie。Cookie 值为 `base64url(payload).base64url(HMAC-SHA256)`；`requireDemoSession` 校验签名与过期时间。

- [ ] **Step 4: 实现受保护的 NDJSON 研究接口**

```ts
const encoder = new TextEncoder();

export async function POST(request: Request) {
  const auth = await requireDemoSession(request);
  if (!auth.ok) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = ResearchInputSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "INVALID_INPUT", details: parsed.error.issues }, { status: 400 });
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runResearch(parsed.data, createDependencies())) {
          await persistTerminalEvent(event, parsed.data);
          controller.enqueue(encodeNdjson(event));
        }
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
```

Route 测试覆盖 401、400、完整 `completed` 流和 `failed` 流；每个终态恰好写入一次 `research_runs`。

- [ ] **Step 5: 实现反馈 API 与删除脚本**

反馈请求 schema：

```ts
const FeedbackInputSchema = z.object({
  runId: z.string().uuid(),
  rating: z.enum(["useful", "incorrect", "too_generic"]),
  comment: z.string().trim().max(500).default("")
});
```

`scripts/delete-run.ts` 接收唯一命令行参数 runId，调用 repository.delete；不存在时 exit code 2，删除成功时输出 `Deleted run <id>`。

- [ ] **Step 6: 验证并提交**

Run: `pnpm test -- tests/integration/storage.test.ts tests/integration/access.test.ts tests/integration/research-route.test.ts`

Expected: CRUD、级联、30 天清理、错误邀请码、篡改 Cookie、401/400 和持久化终态均通过。

```powershell
git add sales-intel-demo
git commit -m "feat: persist reports and demo feedback"
```

### Task 8: 构建输入、真实进度和作战卡界面

**Files:**
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`
- Create: `sales-intel-demo/src/components/demo-shell.tsx`
- Create: `sales-intel-demo/src/components/seller-profile-form.tsx`
- Create: `sales-intel-demo/src/components/target-form.tsx`
- Create: `sales-intel-demo/src/components/progress-timeline.tsx`
- Create: `sales-intel-demo/src/components/battlecard.tsx`
- Create: `sales-intel-demo/src/components/feedback-bar.tsx`
- Test: `sales-intel-demo/tests/unit/demo-shell.test.tsx`
- Test: `sales-intel-demo/tests/unit/battlecard.test.tsx`

**Interfaces:**
- Consumes: `/api/access`、`/api/research` NDJSON、`/api/feedback`。
- Produces: 邀请码、卖方档案、目标公司、进度、结果和反馈的单页状态机。

- [ ] **Step 1: 写界面状态失败测试**

```tsx
it("persists seller profile and submits a research request", async () => {
  render(<DemoShell fetchImpl={fakeNdjsonFetch(validEvents)} storage={memoryStorage()} />);
  await user.type(screen.getByLabelText("产品或服务名称"), "AI 客服");
  await user.type(screen.getByLabelText("一句话价值主张"), "降低重复咨询成本");
  await user.type(screen.getByLabelText("主要解决的问题"), "响应慢");
  await user.type(screen.getByLabelText("理想客户类型"), "有官网咨询的企业");
  await user.type(screen.getByLabelText("公司官网"), "https://example.com");
  await user.click(screen.getByRole("button", { name: "生成作战卡" }));
  expect(await screen.findByText("60 秒客户速览")).toBeVisible();
});
```

另写测试断言事实引用渲染为可点击链接、假设有明显“待验证”标签、来源缺失时组件抛错而不是静默显示。

- [ ] **Step 2: 实现三态 DemoShell**

状态只允许：

```ts
type DemoState =
  | { kind: "input" }
  | { kind: "running"; events: PipelineEvent[] }
  | { kind: "complete"; runId: string; report: Battlecard }
  | { kind: "failed"; code: string; message: string };
```

seller profile 使用 key `sales-demo-seller-v1` 保存到 localStorage；目标公司与会议背景不写 localStorage。提交期间禁用重复提交；失败后保留输入并显示“重新研究”。

- [ ] **Step 3: 实现 NDJSON 解析器**

使用 `response.body.getReader()`、`TextDecoder` 和行缓冲；每读到一条完整 JSON 行就更新 `ProgressTimeline`。解析结束但未收到 `completed` 或 `failed` 时显示 `STREAM_ENDED_EARLY`。

- [ ] **Step 4: 实现有明确视觉层级的作战卡**

视觉方向：温暖的浅米白背景、深海军蓝正文、绿色事实标签、琥珀色触发信号、紫色“待验证假设”；不使用霓虹渐变和通用聊天气泡。桌面为左侧输入/导航与右侧报告，390px 时改为单列。

`Battlecard` 必须按以下顺序渲染：60 秒速览、触发信号、痛点假设、产品切入、5 个问题、30 秒开场、风险未知、来源。每个引用显示 `[1]` 形式并在新标签页打开，使用 `rel="noreferrer"`。

- [ ] **Step 5: 实现复制、打印和反馈**

复制内容为纯文本 Markdown，不包含隐藏 prompt 或 raw source content；打印使用 `window.print()`。反馈按钮提交后锁定，显示“已收到，感谢”；网络失败允许重试。

- [ ] **Step 6: 验证并提交**

Run:

```powershell
pnpm test -- tests/unit/demo-shell.test.tsx tests/unit/battlecard.test.tsx
pnpm typecheck
pnpm build
```

Expected: 组件测试、类型检查、生产构建均通过。

```powershell
git add sales-intel-demo
git commit -m "feat: add research and battlecard experience"
```

### Task 9: 建立跨行业评测、移动端验收和成本指标

**Files:**
- Create: `sales-intel-demo/tests/fixtures/research-fixture.ts`
- Create: `sales-intel-demo/tests/e2e/demo.spec.ts`
- Create: `sales-intel-demo/tests/evaluation/citation-coverage.test.ts`
- Create: `sales-intel-demo/tests/evaluation/report-limits.test.ts`
- Modify: `sales-intel-demo/playwright.config.ts`

**Interfaces:**
- Consumes: fake provider 固定结果、完整 UI 和 BattlecardSchema。
- Produces: 不访问付费 API 的可重复 E2E 与报告质量门。

- [ ] **Step 1: 创建四行业固定 fixture**

每个行业至少包含 5 个来源、6 条证据和一份合法报告：电商、外贸、AI、制造业。fixture 中所有公司名明确使用 `示例` 前缀，URL 使用 `https://example.com/...`，不得混入真实企业虚构事实。

- [ ] **Step 2: 写引用覆盖和数量上限评测**

```ts
it.each(allBattlecards)("has complete fact citations", (card) => {
  const sourceIds = new Set(card.sources.map((source) => source.id));
  const cited = getAllFactSourceIds(card);
  expect(cited.length).toBeGreaterThan(0);
  expect(cited.every((id) => sourceIds.has(id))).toBe(true);
});

it.each(allBattlecards)("stays within battlecard limits", (card) => {
  expect(card.signals.length).toBeLessThanOrEqual(3);
  expect(card.painHypotheses.length).toBeLessThanOrEqual(3);
  expect(card.productMappings.length).toBeLessThanOrEqual(3);
  expect(card.questions).toHaveLength(5);
  expect(card.risks.length).toBeLessThanOrEqual(5);
});
```

- [ ] **Step 3: 写 390px 与 1440px E2E**

Playwright 使用两个 projects：

```ts
projects: [
  { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } }
]
```

测试通过 `E2E_FAKE_PROVIDERS=1` 使用 fixture，完成邀请码、输入、五阶段进度、报告、来源链接和反馈。断言 `document.documentElement.scrollWidth === document.documentElement.clientWidth`。

- [ ] **Step 4: 记录运行指标**

`metrics_json` 至少包含：

```ts
{
  durationMs: number,
  sourceCount: number,
  officialSourceCount: number,
  crawlerCalls: number,
  llmCalls: number,
  inputTokens: number | null,
  outputTokens: number | null
}
```

测试断言每个 completed run 都有 metrics；不在没有供应商定价数据时伪造人民币成本，只在管理日志中输出调用量和 token，人工按账单核对 3 元目标。

- [ ] **Step 5: 执行完整质量门并提交**

Run:

```powershell
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
```

Expected: 全部 exit code 0；移动端和桌面 E2E 均通过；无横向滚动；无无来源事实。

```powershell
git add sales-intel-demo
git commit -m "test: add cross-industry demo acceptance suite"
```

### Task 10: 完成容器部署、许可证清单与体验手册

**Files:**
- Create: `sales-intel-demo/Dockerfile`
- Create: `sales-intel-demo/THIRD_PARTY_NOTICES.md`
- Create: `sales-intel-demo/README.md`
- Modify: `sales-intel-demo/.gitignore`

**Interfaces:**
- Consumes: 通过 Task 9 质量门的 standalone Next.js 构建。
- Produces: 可在支持持久磁盘的单容器环境部署的 Demo 与明确的运行手册。

- [ ] **Step 1: 写 multi-stage Dockerfile**

```dockerfile
FROM node:24.14.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:24.14.0-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm build

FROM node:24.14.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 SQLITE_PATH=/app/data/demo.db
RUN mkdir -p /app/data && chown -R node:node /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: 记录第三方边界**

`THIRD_PARTY_NOTICES.md` 必须列出：

- GPT Researcher，Apache-2.0，仅借鉴研究架构，未复制代码。
- browser-use，MIT，首版未集成。
- Crawl4AI，Apache-2.0，首版未集成。
- Firecrawl 服务端，AGPL-3.0，首版仅调用托管 API，未复制或自托管服务端源码。
- npm 直接依赖名称、版本和许可证；使用 `pnpm licenses list --prod` 生成并人工复核。

- [ ] **Step 3: 写可执行 README**

README 包含：环境变量、安装、测试、本地启动、Docker 构建、持久化 `/app/data`、如何轮换邀请码/密钥、如何按 runId 删除、如何查看 SQLite 反馈、30 人体验说明和公开信息免责声明。

明确写出：

```text
本工具生成的是基于公开信息的销售准备材料，不是事实数据库。带“待验证”的内容必须在客户沟通中确认，不得对外宣称为客户已确认需求。
```

- [ ] **Step 4: 最终验证**

Run:

```powershell
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
docker build -t sales-intelligence-demo:0.1.0 .
```

Expected: 所有命令 exit code 0；Docker image 创建成功；用 fake providers 启动后 `/`、`/api/access` 与完整研究流程可用。

- [ ] **Step 5: Commit**

```powershell
git add sales-intel-demo
git commit -m "docs: prepare sales intelligence demo deployment"
```

## Execution Checkpoints

1. Task 1–3 后检查领域模型、开源边界和 URL 安全，不接真实外部服务。
2. Task 4–7 后用 fake providers 完成整条后端流水线，确认错误降级、引用校验和数据保存。
3. Task 8–9 后让一名不了解项目的人完成一次 390px 手机流程，记录输入困难和报告理解障碍。
4. Task 10 后才配置真实 Firecrawl 与 LLM 密钥，先对 4 个自有或熟悉公司域名做受控测试，再开放给 30 位体验者。
