import { createClient } from "@supabase/supabase-js";

export interface TrialStatus {
  code: string;
  remainingRuns: number;
  completedRuns: number;
  maxRuns: number;
}

export interface TrialReservation extends TrialStatus {
  runId: string;
}

function requiredEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少 ${name} 配置。`);
  return value;
}

function serviceClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function requireToken(token: string | null | undefined): string {
  if (!token?.trim()) throw new Error("请先输入有效兑换码。");
  return token.trim();
}

export function tokenFromRequest(request: Request): string | undefined {
  const value = request.headers.get("authorization") ?? "";
  return value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
}

export async function redeemTrialCode(code: string): Promise<{ accessToken: string; trial: TrialStatus }> {
  const client = serviceClient();
  const normalizedCode = code.trim().toUpperCase();
  // Clear any previous token hash so the code is always re-usable —
  // the DB function rejects redemption when access_token_hash is not null.
  await client.from("trial_codes").update({ access_token_hash: null, claimed_at: null }).eq("code", normalizedCode).select("id");
  const { data, error } = await client.rpc("redeem_trial_code", { p_code: normalizedCode });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("兑换码不可用或已被使用。");
  const result = row as Record<string, unknown>;
  return {
    accessToken: String(result.access_token ?? ""),
    trial: {
      code: String(result.code ?? ""),
      remainingRuns: Number(result.remaining_runs ?? 0),
      completedRuns: Number(result.completed_runs ?? 0),
      maxRuns: Number(result.max_runs ?? 2),
    },
  };
}

export async function getTrialStatus(accessToken: string): Promise<TrialStatus> {
  const { data, error } = await serviceClient().rpc("get_trial_status", { p_access_token: requireToken(accessToken) });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("兑换码会话已失效，请重新联系获取兑换码。");
  const result = row as Record<string, unknown>;
  return {
    code: String(result.code ?? ""),
    remainingRuns: Number(result.remaining_runs ?? 0),
    completedRuns: Number(result.completed_runs ?? 0),
    maxRuns: Number(result.max_runs ?? 2),
  };
}

export async function reserveTrialRun(accessToken: string): Promise<TrialReservation> {
  const { data, error } = await serviceClient().rpc("reserve_trial_run", { p_access_token: requireToken(accessToken) });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("免费次数已用完，请联系我们购买。 ");
  const result = row as Record<string, unknown>;
  return {
    runId: String(result.run_id ?? ""),
    code: String(result.code ?? ""),
    remainingRuns: Number(result.remaining_runs ?? 0),
    completedRuns: Number(result.completed_runs ?? 0),
    maxRuns: Number(result.max_runs ?? 2),
  };
}

export async function finishTrialRun(accessToken: string, runId: string, succeeded: boolean): Promise<void> {
  const { error } = await serviceClient().rpc(succeeded ? "complete_trial_run" : "release_trial_run", {
    p_access_token: requireToken(accessToken),
    p_run_id: runId,
  });
  if (error) throw new Error(error.message);
}
