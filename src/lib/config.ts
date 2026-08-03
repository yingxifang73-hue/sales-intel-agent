import { z } from "zod";

const EnvironmentSchema = z.object({
  // 搜索 API（Serper.dev Google 搜索）
  SERPER_API_KEY: z.string().optional(),
  // Jina Reader API（可选，不配则用直连 fallback）
  JINA_API_KEY: z.string().optional(),
  // Firecrawl 用于官网页面发现与正文抓取；未配置时会显式降级为直连 + 搜索。
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_BASE_URL: z.url().default("https://api.firecrawl.dev/v2"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  ENABLE_LLM_ENHANCEMENT: z.enum(["true", "false"]).default("true"),
  MODEL_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(180_000).default(90_000),
  FIRECRAWL_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(60_000).default(15_000),
  DIRECT_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  INTERNAL_PAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  GITHUB_REPOSITORY: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional(),
  GITHUB_REF: z.string().min(1).optional(),
  GITHUB_DISPATCH_TOKEN: z.string().min(1).optional(),
  RESEARCH_DISPATCH_GRACE_MS: z.coerce.number().int().min(60_000).max(30 * 60_000).default(7 * 60_000),
});

export type AppConfig = z.infer<typeof EnvironmentSchema>;

export function getConfig(environment: Record<string, string | undefined> = process.env): AppConfig {
  return EnvironmentSchema.parse(environment);
}
