import { buildUndeliverableReport, checkMinimum } from "@/lib/quality-gate";
import { getConfig } from "@/lib/config";
import { dedupeSources } from "@/lib/dedupe";
import { enhanceWithLlm, extractSourceFactBundles, type SourceFactExtractionResult } from "@/lib/llm";
import {
  loadResearchJob,
  markResearchJobCompleted,
  markResearchJobFailed,
  settleTrialRunById,
  setResearchJobStage,
  storeResearchCollection,
  storeResearchReport,
  storeSelectedSources,
  storeSourceFacts,
} from "@/lib/research-jobs";
import { collectProductionSources, synthesizeReport } from "@/lib/research";
import { assessEvidenceReadiness, selectReportSources } from "@/lib/source-quality";
import { SalesReportSchema } from "@/lib/types";
import {
  isReportModuleComplete,
  mergeSourceFactExtraction,
  reportModuleLabel,
  reportModuleProgress,
  SOURCE_FACT_BATCH_SIZE,
  sourceFactBatchCount,
  type ReportModuleStage,
} from "@/lib/research-workflow-state";
import { presentResearchFailure } from "@/lib/workflow-error";
import { selectRepairStages, type ReportGenerationStage } from "@/lib/report-repair";
import { normalizeSalesReportAudit } from "@/lib/quality-audit";
import { ZodError } from "zod";

function parseWorkflowReport(value: unknown, stage: string) {
  try {
    return SalesReportSchema.parse(normalizeSalesReportAudit(value));
  } catch (error) {
    if (error instanceof ZodError) {
      console.error(JSON.stringify({
        event: "research_report_schema_failure",
        stage,
        issueCount: error.issues.length,
        paths: error.issues.slice(0, 8).map((issue) => issue.path.join(".")),
      }));
      throw new Error(`报告在“${stage}”阶段未通过结构校验，已停止重复生成。`);
    }
    throw error;
  }
}

async function markRunning(jobId: string) {
  const job = await loadResearchJob(jobId);
  if (job.status === "failed") {
    throw new Error("调研任务已取消或后台执行等待超时，不再执行。");
  }
  await setResearchJobStage(jobId, "validate", 5, "正在验证输入并准备调研。");
}

async function collectSources(jobId: string) {
  const job = await loadResearchJob(jobId);
  if (job.collection) return;
  await setResearchJobStage(jobId, "collect", 18, "正在发现、抓取公司官网与公开资料。");
  const config = getConfig();
  const collection = await collectProductionSources(job.input, {
    searchApiKey: config.SERPER_API_KEY,
    jinaApiKey: config.JINA_API_KEY,
    firecrawlApiKey: config.FIRECRAWL_API_KEY,
    firecrawlBaseUrl: config.FIRECRAWL_BASE_URL,
  });
  await storeResearchCollection(jobId, collection);
  if (!collection.sources.length) {
    throw new Error("目标官网当前无法访问或未返回可读取正文，搜索渠道也未找到可用公开页面。");
  }
}

async function selectSources(jobId: string): Promise<number> {
  const job = await loadResearchJob(jobId);
  if (job.selectedSources?.length) return job.selectedSources.length;
  if (!job.collection) throw new Error("采集结果缺失，不能进行证据筛选。");
  await setResearchJobStage(jobId, "evidence", 35, "正在筛选可追溯的高质量公开资料。");
  const sources = selectReportSources(dedupeSources(job.collection.sources), job.input.targetUrl, 20, job.input);
  if (!sources.length) throw new Error("采集到的网页均不满足报告证据要求。");
  const readiness = assessEvidenceReadiness(sources, job.input.targetUrl);
  if (!readiness.ready) {
    throw new Error(`公开资料尚不足以生成可靠报告：${readiness.reasons.join("；")}。本次未进入模型分析。`);
  }
  await storeSelectedSources(jobId, sources);
  return sources.length;
}

async function beginFactExtraction(jobId: string) {
  await setResearchJobStage(jobId, "facts", 42, "正在并行提取全部来源中的公司事实。");
}

async function extractFactsBatch(jobId: string, batchIndex: number): Promise<SourceFactExtractionResult> {
  const job = await loadResearchJob(jobId);
  const sources = job.selectedSources ?? [];
  const start = batchIndex * SOURCE_FACT_BATCH_SIZE;
  const batch = sources.slice(start, start + SOURCE_FACT_BATCH_SIZE);
  if (!batch.length) return { bundles: [], outcomes: { facts: "success" }, rejected: [] };
  const existing = job.sourceFacts;
  const alreadyStored = new Set(existing?.bundles.map((bundle) => bundle.sourceId) ?? []);
  const pending = batch.filter((source) => !alreadyStored.has(source.id));
  if (!pending.length) return { bundles: [], outcomes: { facts: "success" }, rejected: [] };
  return extractSourceFactBundles(getConfig(), job.input, pending);
}

async function storeFactExtractions(jobId: string, extractions: SourceFactExtractionResult[]) {
  const job = await loadResearchJob(jobId);
  const merged = extractions.reduce(
    (current, extraction) => mergeSourceFactExtraction(current, extraction),
    job.sourceFacts,
  );
  if (!merged) throw new Error("来源事实提取结果缺失。");
  await storeSourceFacts(jobId, merged);
  await setResearchJobStage(jobId, "facts", 69, "全部来源已经完成事实提取，正在合并客户画像。");
}

async function initializeReport(jobId: string) {
  const job = await loadResearchJob(jobId);
  if (job.report) return;
  if (!job.collection || !job.selectedSources?.length) throw new Error("报告生成所需的来源数据缺失。");
  const draft = synthesizeReport(
    job.input,
    job.selectedSources,
    job.collection.notes,
    job.collection.warnings,
    job.collection.coverage,
    job.collection.qualityAuditSeed,
  );
  draft.metrics.durationMs = Math.max(0, Date.now() - new Date(job.createdAt).getTime());
  await storeResearchReport(jobId, parseWorkflowReport(draft, "客户画像"));
}

async function runModelModule(
  jobId: string,
  module: ReportModuleStage,
  modelStage: ReportGenerationStage,
) {
  const job = await loadResearchJob(jobId);
  if (!job.report || !job.selectedSources?.length) throw new Error(`${reportModuleLabel(module)}所需的报告上下文缺失。`);
  if (isReportModuleComplete(job.report, module)) return;

  const label = reportModuleLabel(module);
  await setResearchJobStage(jobId, module, reportModuleProgress(module), `正在整理${label}。`);
  const updated = await enhanceWithLlm(
    job.report,
    job.input,
    job.selectedSources,
    getConfig(),
    job.sourceFacts,
    { stages: [modelStage] },
  );
  updated.metrics.durationMs = Math.max(0, Date.now() - new Date(job.createdAt).getTime());
  await storeResearchReport(jobId, parseWorkflowReport(updated, label));
}

async function generateCustomerProfile(jobId: string) {
  await runModelModule(jobId, "customer_profile", "facts");
}

async function generateProductFit(jobId: string) {
  await runModelModule(jobId, "product_fit", "opportunity");
}

async function saveOpportunities(jobId: string) {
  const job = await loadResearchJob(jobId);
  if (!job.report || !isReportModuleComplete(job.report, "opportunities")) {
    throw new Error("机会与痛点尚未完成，不能进入下一模块。");
  }
  await setResearchJobStage(
    jobId,
    "opportunities",
    reportModuleProgress("opportunities"),
    "正在整理机会与痛点。",
  );
  await storeResearchReport(jobId, parseWorkflowReport(job.report, "机会与痛点"));
}

async function generateTalkTrack(jobId: string) {
  await runModelModule(jobId, "talk_track", "conversation");
}

async function saveNextStep(jobId: string) {
  const job = await loadResearchJob(jobId);
  if (!job.report || !isReportModuleComplete(job.report, "next_step")) {
    throw new Error("下一步尚未完成，不能进入销售结论。");
  }
  await setResearchJobStage(
    jobId,
    "next_step",
    reportModuleProgress("next_step"),
    "正在整理下一步。",
  );
  await storeResearchReport(jobId, parseWorkflowReport(job.report, "下一步"));
}

async function finalizeSalesVerdict(jobId: string) {
  await runModelModule(jobId, "sales_verdict", "quality_review");
}

/**
 * A provider can finish a response while omitting required structured fields.
 * Keep the already collected sources, make one focused generation pass, and
 * retain it only when the report objectively improves. This never re-crawls
 * the company website or external sources.
 */
async function repairReportModule(
  jobId: string,
  module: ReportModuleStage,
  modelStage: ReportGenerationStage,
) {
  const job = await loadResearchJob(jobId);
  if (!job.report || !job.selectedSources?.length) return;

  const label = reportModuleLabel(module);
  const current = parseWorkflowReport(job.report, label);
  const before = checkMinimum(current);
  if (before.passed) return;

  const repairStages = selectRepairStages(before.missing, current.qualityAudit?.rejectedFields);
  if (!repairStages.includes(modelStage)) return;

  await setResearchJobStage(
    jobId,
    module,
    reportModuleProgress(module),
    `正在补全${label}，不会重新抓取资料。`,
  );
  const repaired = await enhanceWithLlm(
    current,
    job.input,
    job.selectedSources,
    getConfig(),
    job.sourceFacts,
    { stages: [modelStage] },
  );
  repaired.metrics.durationMs = Math.max(0, Date.now() - new Date(job.createdAt).getTime());
  const candidate = parseWorkflowReport(repaired, label);
  const after = checkMinimum(candidate);

  if (after.passed || after.missing.length < before.missing.length) {
    await storeResearchReport(jobId, candidate);
  }
}

async function repairCustomerProfile(jobId: string) {
  await repairReportModule(jobId, "customer_profile", "facts");
}

async function repairProductFit(jobId: string) {
  await repairReportModule(jobId, "product_fit", "opportunity");
}

async function repairTalkTrack(jobId: string) {
  await repairReportModule(jobId, "talk_track", "conversation");
}

async function repairSalesVerdict(jobId: string) {
  await repairReportModule(jobId, "sales_verdict", "quality_review");
}

async function verifyAndSettle(jobId: string) {
  const job = await loadResearchJob(jobId);
  if (job.status === "completed") return;
  if (!job.report) throw new Error("最终报告缺失，不能结算调研次数。");
  await setResearchJobStage(jobId, "sales_verdict", 98, "正在检查销售结论与报告完整性。");
  const report = parseWorkflowReport(job.report, "报告校验");
  const minimum = checkMinimum(report);
  const finalized = {
    ...report,
    qualityAudit: report.qualityAudit ? { ...report.qualityAudit, minimumStandardMet: minimum.passed, missingFields: minimum.missing } : report.qualityAudit,
  };
  await storeResearchReport(jobId, parseWorkflowReport(finalized, "报告校验"));
  if (!minimum.passed) {
    throw new Error(buildUndeliverableReport(minimum.missing));
  }
  await settleTrialRunById(job.trialRunId, true);
  await markResearchJobCompleted(jobId);
}

async function failAndRelease(jobId: string, error: unknown) {
  const job = await loadResearchJob(jobId);
  if (job.status === "completed" || job.status === "failed") return;
  await settleTrialRunById(job.trialRunId, false);
  await markResearchJobFailed(jobId, presentResearchFailure(error, job.currentStage));
}

export async function runResearchJob(jobId: string) {
  try {
    await markRunning(jobId);
    await collectSources(jobId);
    const sourceCount = await selectSources(jobId);
    const batchCount = sourceFactBatchCount(sourceCount);
    await beginFactExtraction(jobId);
    const extractions: SourceFactExtractionResult[] = [];
    const batchIndexes = Array.from({ length: batchCount }, (_, batchIndex) => batchIndex);
    for (let offset = 0; offset < batchIndexes.length; offset += 4) {
      extractions.push(...await Promise.all(
        batchIndexes.slice(offset, offset + 4).map((batchIndex) => extractFactsBatch(jobId, batchIndex)),
      ));
    }
    await storeFactExtractions(jobId, extractions);
    await initializeReport(jobId);
    await generateCustomerProfile(jobId);
    await generateProductFit(jobId);
    await saveOpportunities(jobId);
    await generateTalkTrack(jobId);
    await saveNextStep(jobId);
    await finalizeSalesVerdict(jobId);
    await repairCustomerProfile(jobId);
    await repairProductFit(jobId);
    await repairTalkTrack(jobId);
    await repairSalesVerdict(jobId);
    await verifyAndSettle(jobId);
    return { jobId, status: "completed" as const };
  } catch (error) {
    await failAndRelease(jobId, error);
    throw error;
  }
}
