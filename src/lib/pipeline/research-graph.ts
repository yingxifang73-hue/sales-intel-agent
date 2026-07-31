import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { AppConfig } from "@/lib/config";
import { dedupeSources } from "@/lib/dedupe";
import { enhanceWithLlm, extractSourceFactBundles, type SourceFactExtractionResult } from "@/lib/llm";
import {
  buildResearchPlan,
  collectProductionSources,
  synthesizeReport,
  type DualChannelResult,
  type ResearchTask,
} from "@/lib/research";
import { checkMinimum } from "@/lib/quality-gate";
import { selectReportSources } from "@/lib/source-quality";
import { ResearchInputSchema, SalesReportSchema, type ResearchInput, type SalesReport, type Source } from "@/lib/types";

const ResearchGraphState = Annotation.Root({
  input: Annotation<ResearchInput>(),
  config: Annotation<AppConfig>(),
  collection: Annotation<DualChannelResult | undefined>(),
  researchPlan: Annotation<ResearchTask[] | undefined>(),
  sources: Annotation<Source[] | undefined>(),
  sourceFactExtraction: Annotation<SourceFactExtractionResult | undefined>(),
  report: Annotation<SalesReport | undefined>(),
});

export type ResearchGraphResult = typeof ResearchGraphState.State;

export interface ResearchGraphDependencies {
  collectSources?: typeof collectProductionSources;
  enhanceReport?: typeof enhanceWithLlm;
}

function requireCollection(state: ResearchGraphResult): DualChannelResult {
  if (!state.collection) throw new Error("研究采集结果缺失");
  return state.collection;
}

function requireSources(state: ResearchGraphResult): Source[] {
  if (!state.sources?.length) throw new Error("未获得可用于报告的高质量公开来源");
  return state.sources;
}

function requireReport(state: ResearchGraphResult): SalesReport {
  if (!state.report) throw new Error("研究报告尚未生成");
  return state.report;
}

/**
 * A single, bounded LangGraph workflow. Nodes are functions over one shared
 * state; they are not autonomous agents and never create side effects outside
 * the configured research providers.
 */
export function createResearchGraph(dependencies: ResearchGraphDependencies = {}) {
  const collectSources = dependencies.collectSources ?? collectProductionSources;
  const enhanceReport = dependencies.enhanceReport ?? enhanceWithLlm;

  return new StateGraph(ResearchGraphState)
    .addNode("validate_input", (state: ResearchGraphResult) => ({ input: ResearchInputSchema.parse(state.input) }))
    .addNode(
      "crawl_company_website",
      async (state: ResearchGraphResult) => ({
        collection: await collectSources(state.input, {
          searchApiKey: state.config.SERPER_API_KEY,
          jinaApiKey: state.config.JINA_API_KEY,
          firecrawlApiKey: state.config.FIRECRAWL_API_KEY,
          firecrawlBaseUrl: state.config.FIRECRAWL_BASE_URL,
        }),
      }),
      { retryPolicy: { maxAttempts: 1 }, timeout: 150_000 },
    )
    .addNode("plan_research", (state: ResearchGraphResult) => ({ researchPlan: buildResearchPlan(state.input) }))
    .addNode("evaluate_evidence", (state: ResearchGraphResult) => {
      const collection = requireCollection(state);
      const sources = selectReportSources(dedupeSources(collection.sources), state.input.targetUrl, 20, state.input);
      return { sources };
    })
    .addNode("extract_company_profile", async (state: ResearchGraphResult) => {
      const sources = requireSources(state);
      return { sourceFactExtraction: await extractSourceFactBundles(state.config, state.input, sources) };
    }, { retryPolicy: { maxAttempts: 1 }, timeout: 45_000 })
    .addNode("analyze_sales_fit", async (state: ResearchGraphResult) => {
      const collection = requireCollection(state);
      const sources = requireSources(state);
      const report = synthesizeReport(
        state.input,
        sources,
        collection.notes,
        collection.warnings,
        collection.coverage,
        collection.qualityAuditSeed,
      );
      const enhanced = await enhanceReport(report, state.input, sources, state.config, state.sourceFactExtraction);
      return { report: enhanced };
    }, { retryPolicy: { maxAttempts: 1 }, timeout: 100_000 })
    .addNode("verify_claims", (state: ResearchGraphResult) => {
      const report = requireReport(state);
      const minimum = checkMinimum(report);
      const status = state.config.ENABLE_LLM_ENHANCEMENT === "true" && state.config.OPENAI_API_KEY
        ? (minimum.passed ? "达标" : "未达标")
        : "仅采集";
      return {
        report: {
          ...report,
          reportMeta: { ...report.reportMeta, status },
          qualityAudit: {
            ...(report.qualityAudit ?? {
              directSourceCount: 0,
              firecrawlBaseSourceCount: 0,
              firecrawlGapSourceCount: 0,
              evidencePerCategory: {},
              filteredSources: [],
              fieldStatuses: {},
              stageOutcomes: {},
              rejectedFields: [],
              minimumStandardMet: false,
              missingFields: [],
            }),
            minimumStandardMet: minimum.passed,
            missingFields: minimum.missing,
          },
        },
      };
    })
    .addNode("generate_final_report", (state: ResearchGraphResult) => ({ report: SalesReportSchema.parse(requireReport(state)) }))
    .addEdge(START, "validate_input")
    .addEdge("validate_input", "crawl_company_website")
    .addEdge("crawl_company_website", "plan_research")
    .addEdge("plan_research", "evaluate_evidence")
    .addEdge("evaluate_evidence", "extract_company_profile")
    .addEdge("extract_company_profile", "analyze_sales_fit")
    .addEdge("analyze_sales_fit", "verify_claims")
    .addEdge("verify_claims", "generate_final_report")
    .addEdge("generate_final_report", END)
    .compile();
}

export async function runResearchGraph(
  input: ResearchInput,
  config: AppConfig,
  dependencies?: ResearchGraphDependencies,
): Promise<ResearchGraphResult> {
  return createResearchGraph(dependencies).invoke({ input, config });
}
