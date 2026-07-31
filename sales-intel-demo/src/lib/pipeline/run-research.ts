import { randomUUID } from "node:crypto";
import type { AppConfig } from "@/lib/config";
import { createResearchGraph } from "@/lib/pipeline/research-graph";
import type { Metrics, PipelineEvent, ResearchInput, SalesReport, Source } from "@/lib/types";

const STAGE_PROGRESS = {
  site: 10,
  collect: 35,
  facts: 60,
  opportunity: 78,
  conversation: 90,
  validate: 98,
} as const;

type GraphUpdate = Record<string, unknown>;

function updateValue<T>(update: GraphUpdate, node: string): T | undefined {
  const value = update[node];
  return value as T | undefined;
}

/**
 * Streams actual LangGraph node completions. A stage is never announced as
 * complete before its underlying graph node has returned.
 */
export async function* runResearchPipeline(
  input: ResearchInput,
  _searchApiKey?: string,
  _jinaApiKey?: string,
  config?: AppConfig,
): AsyncGenerator<PipelineEvent> {
  const runId = randomUUID();
  const startedAt = Date.now();
  yield { kind: "started", runId };

  if (!config) {
    yield { kind: "failed", code: "configuration", message: "研究服务配置缺失。" };
    return;
  }

  yield { kind: "stage", stage: "site", progress: STAGE_PROGRESS.site, message: "正在验证目标网址…" };
  yield { kind: "stage", stage: "collect", progress: STAGE_PROGRESS.site + 1, message: "正在发现并抓取公司公开页面…" };

  try {
    const graph = createResearchGraph();
    const stream = await graph.stream({ input, config }, { streamMode: "updates" });
    let finalReport: SalesReport | undefined;

    for await (const rawUpdate of stream) {
      const update = rawUpdate as GraphUpdate;

      const collection = updateValue<{
        collection?: {
          sources: Source[];
          warnings: string[];
          qualityAuditSeed: { directSourceCount: number; firecrawlBaseSourceCount: number };
        };
      }>(update, "crawl_company_website")?.collection;
      if (collection) {
        for (const warning of collection.warnings) yield { kind: "warning", message: warning };
        yield {
          kind: "stage",
          stage: "collect",
          progress: STAGE_PROGRESS.collect,
          message: `已采集 ${collection.sources.length} 条公开来源（直连 ${collection.qualityAuditSeed.directSourceCount}，Firecrawl ${collection.qualityAuditSeed.firecrawlBaseSourceCount}）。`,
        };
      }

      const sources = updateValue<{ sources?: Source[] }>(update, "evaluate_evidence")?.sources;
      if (sources) {
        yield { kind: "stage", stage: "facts", progress: STAGE_PROGRESS.facts - 5, message: `证据筛选完成，保留 ${sources.length} 条高质量来源；正在进行结构化分析…` };
      }

      const analyzed = updateValue<{ report?: SalesReport }>(update, "analyze_sales_fit")?.report;
      if (analyzed) {
        yield { kind: "stage", stage: "facts", progress: STAGE_PROGRESS.facts, message: "客户事实分析完成。" };
        yield { kind: "stage", stage: "opportunity", progress: STAGE_PROGRESS.opportunity, message: "产品匹配与机会分析完成。" };
        yield { kind: "stage", stage: "conversation", progress: STAGE_PROGRESS.conversation, message: "首次沟通方案生成完成。" };
      }

      const verified = updateValue<{ report?: SalesReport }>(update, "verify_claims")?.report;
      if (verified) {
        yield { kind: "stage", stage: "validate", progress: STAGE_PROGRESS.validate, message: "证据与最低交付标准检查完成。" };
      }

      const generated = updateValue<{ report?: SalesReport }>(update, "generate_final_report")?.report;
      if (generated) finalReport = generated;
    }

    if (!finalReport) {
      yield { kind: "failed", code: "missing_report", message: "研究流程结束时未生成报告。" };
      return;
    }

    const metrics = buildMetrics(startedAt, finalReport.sources, finalReport.metrics.llmCalls);
    yield {
      kind: "completed",
      runId,
      report: { ...finalReport, metrics },
      metrics,
    };
  } catch (error) {
    yield {
      kind: "failed",
      code: "research_graph_error",
      message: error instanceof Error ? error.message : "研究流程发生未知错误。",
    };
  }
}

function buildMetrics(startedAt: number, sources: Source[], llmCalls: number): Metrics {
  return {
    durationMs: Date.now() - startedAt,
    sourceCount: sources.length,
    officialSourceCount: sources.filter((source) => source.sourceType === "official").length,
    crawlerCalls: 2,
    llmCalls,
  };
}
