import { z } from "zod";

const EnvironmentSchema = z.object({
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  SESSION_SECRET: z.string().min(32).optional(),
  DATABASE_PATH: z.string().min(1).default("./data/sales-intel.db"),
  E2E_FAKE_PROVIDERS: z.enum(["true", "false"]).default("false"),
});

export type AppConfig = z.infer<typeof EnvironmentSchema>;

export function getConfig(environment: Record<string, string | undefined> = process.env): AppConfig {
  return EnvironmentSchema.parse(environment);
}

export function requireResearchConfig(config = getConfig()): Required<
  Pick<AppConfig, "FIRECRAWL_API_KEY" | "OPENAI_API_KEY" | "SESSION_SECRET">
> &
  AppConfig {
  if (!config.FIRECRAWL_API_KEY || !config.OPENAI_API_KEY || !config.SESSION_SECRET) {
    throw new Error("研究服务尚未配置：请设置 FIRECRAWL_API_KEY、OPENAI_API_KEY 和 SESSION_SECRET。");
  }

  return config as Required<Pick<AppConfig, "FIRECRAWL_API_KEY" | "OPENAI_API_KEY" | "SESSION_SECRET">> & AppConfig;
}
