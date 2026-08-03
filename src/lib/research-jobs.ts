import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { DualChannelResult } from "@/lib/research";
import type { SourceFactExtractionResult } from "@/lib/llm";
import { ResearchInputSchema, SalesReportSchema, type ResearchInput, type ResearchStatus, type SalesReport, type Source } from "@/lib/types";
import { normalizeSalesReportAudit } from "@/lib/quality-audit";
import { normalizeSalesReportNarrative } from "@/lib/report-text";

export type ResearchJob = {
  id: string;
  trialRunId: string;
  status: ResearchStatus;
  progress: number;
  currentStage: string;
  message: string;
  input: ResearchInput;
  collection?: DualChannelResult;
  selectedSources?: Source[];
  sourceFacts?: SourceFactExtractionResult;
  report?: SalesReport;
  workflowRunId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type DbJob = Record<string, unknown>;

function requiredEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} configuration.`);
  return value;
}

function serviceClient() {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function parseJob(value: DbJob): ResearchJob {
  const input = ResearchInputSchema.parse(value.input);
  const rawReport = asObject(value.report);
  return {
    id: String(value.id),
    trialRunId: String(value.trial_run_id),
    status: value.status as ResearchStatus,
    progress: Number(value.progress ?? 0),
    currentStage: String(value.current_stage ?? "queued"),
    message: String(value.message ?? "已进入调研队列。"),
    input,
    collection: asObject(value.collection) as unknown as DualChannelResult | undefined,
    selectedSources: Array.isArray(value.selected_sources) ? value.selected_sources as Source[] : undefined,
    sourceFacts: asObject(value.source_facts) as unknown as SourceFactExtractionResult | undefined,
    report: rawReport
      ? normalizeSalesReportNarrative(SalesReportSchema.parse(normalizeSalesReportAudit(rawReport)))
      : undefined,
    workflowRunId: typeof value.workflow_run_id === "string" ? value.workflow_run_id : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
    createdAt: String(value.created_at),
    updatedAt: String(value.updated_at),
  };
}

export function hashAccessToken(accessToken: string): string {
  return createHash("sha256").update(accessToken.trim()).digest("hex");
}

export async function createResearchJob(input: ResearchInput, trialRunId: string, accessToken: string): Promise<ResearchJob> {
  const { data, error } = await serviceClient().from("research_jobs").insert({
    input,
    trial_run_id: trialRunId,
    owner_token_hash: hashAccessToken(accessToken),
  }).select().single();
  if (error || !data) throw new Error(error?.message ?? "Unable to create research job.");
  return parseJob(data as DbJob);
}

export async function loadResearchJob(id: string): Promise<ResearchJob> {
  const { data, error } = await serviceClient().from("research_jobs").select("*").eq("id", id).single();
  if (error || !data) throw new Error(error?.message ?? "Research job not found.");
  return parseJob(data as DbJob);
}

export async function loadAuthorizedResearchJob(id: string, accessToken: string): Promise<ResearchJob> {
  const { data, error } = await serviceClient().from("research_jobs").select("*")
    .eq("id", id).eq("owner_token_hash", hashAccessToken(accessToken)).single();
  if (error || !data) throw new Error("Research job not found or access denied.");
  return parseJob(data as DbJob);
}

/**
 * Once the status endpoint has terminally failed a stale job, an old runner
 * must never be able to revive it after an in-flight crawler/model call
 * eventually returns. Every runner write therefore requires an active state.
 */
async function updateActiveResearchJob(id: string, patch: Record<string, unknown>): Promise<ResearchJob> {
  const { data, error } = await serviceClient().from("research_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["queued", "running"])
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Research job is no longer active.");
  return parseJob(data as DbJob);
}

export async function setResearchJobWorkflowRun(id: string, workflowRunId: string): Promise<void> {
  await updateActiveResearchJob(id, { workflow_run_id: workflowRunId });
}

export async function setResearchJobStage(id: string, stage: string, progress: number, message: string): Promise<ResearchJob> {
  return updateActiveResearchJob(id, { status: "running", current_stage: stage, progress, message, error: null });
}

export async function storeResearchCollection(id: string, collection: DualChannelResult): Promise<void> {
  await updateActiveResearchJob(id, { collection });
}

export async function storeSelectedSources(id: string, sources: Source[]): Promise<void> {
  await updateActiveResearchJob(id, { selected_sources: sources });
}

export async function storeSourceFacts(id: string, facts: SourceFactExtractionResult): Promise<void> {
  await updateActiveResearchJob(id, { source_facts: facts });
}

export async function storeResearchReport(id: string, report: SalesReport): Promise<void> {
  const normalized = normalizeSalesReportNarrative(SalesReportSchema.parse(normalizeSalesReportAudit(report)));
  await updateActiveResearchJob(id, { report: SalesReportSchema.parse(normalized) });
}

export async function markResearchJobCompleted(id: string): Promise<ResearchJob> {
  return updateActiveResearchJob(id, { status: "completed", progress: 100, current_stage: "completed", message: "调研报告已生成。", completed_at: new Date().toISOString(), error: null });
}

export async function markResearchJobFailed(id: string, message: string): Promise<ResearchJob> {
  return updateActiveResearchJob(id, { status: "failed", message: "调研未能完成。", error: message.slice(0, 500) });
}

/**
 * Atomically fail a job only while it remains queued. This prevents a status
 * poll from racing with a GitHub runner that has already moved the job to
 * `running`.
 */
export async function expireQueuedResearchJob(id: string, updatedBefore: string, message: string): Promise<ResearchJob | undefined> {
  const { data, error } = await serviceClient().from("research_jobs")
    .update({
      status: "failed",
      message: "调研任务未被后台执行器接收。",
      error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "queued")
    .lte("updated_at", updatedBefore)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? parseJob(data as DbJob) : undefined;
}

/**
 * Atomically fail a runner that has stopped emitting a stage heartbeat. The
 * stage condition makes this safe when a live runner moves forward while the
 * status endpoint is checking its freshness.
 */
export async function expireStalledResearchJob(
  id: string,
  stage: string,
  updatedBefore: string,
  message: string,
): Promise<ResearchJob | undefined> {
  const { data, error } = await serviceClient().from("research_jobs")
    .update({
      status: "failed",
      message: "调研任务已停止等待后台响应。",
      error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "running")
    .eq("current_stage", stage)
    .lte("updated_at", updatedBefore)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? parseJob(data as DbJob) : undefined;
}

export async function settleTrialRunById(runId: string, succeeded: boolean): Promise<void> {
  const { error } = await serviceClient().rpc(succeeded ? "complete_trial_run_by_id" : "release_trial_run_by_id", { p_run_id: runId });
  if (error) throw new Error(error.message);
}
