import { createClient } from "@supabase/supabase-js";

/** The 20 original public trial codes. The owner code is deliberately absent. */
const RETIRED_TRIAL_CODES = [
  "SIA-7M2K-9Q4R", "SIA-3V8N-6L5P", "SIA-8H4D-2X7W", "SIA-5T9C-7J3F",
  "SIA-2R6Y-8K4M", "SIA-9P3L-5V7D", "SIA-4W8F-2N6Q", "SIA-6J2M-9T5H",
  "SIA-7X5R-3K8P", "SIA-2D9V-6W4L", "SIA-8Q3H-7M2C", "SIA-5N6P-4Y9T",
  "SIA-3K7W-8D2R", "SIA-9M4C-5X6J", "SIA-6T8L-3Q7V", "SIA-2H5P-9N4F",
  "SIA-7D3R-6M8K", "SIA-4V9T-2W5Q", "SIA-8L6C-7H3P", "SIA-5Q2J-4X9N",
] as const;

/** New two-use codes. Avoid visually ambiguous letters and digits. */
export const NEW_TRIAL_CODES = [
  "SIA-7K9M-W4RX", "SIA-3V8T-H6QP", "SIA-9F2K-M7WD", "SIA-6R4X-T9HP",
  "SIA-8W7M-K3QF", "SIA-2H9R-V6XD", "SIA-5Q4T-W8MK", "SIA-7X3F-H9RP",
  "SIA-4M8K-Q7WD", "SIA-9T6R-X3HF", "SIA-3W7Q-M8KP", "SIA-6H4X-T9RF",
  "SIA-8K2M-V7QD", "SIA-5R9T-H4WX", "SIA-7Q3F-K8MP", "SIA-2X6R-W9HD",
  "SIA-4T8K-Q3MF", "SIA-9W5H-R7XP", "SIA-6M4Q-T8KD", "SIA-3R7X-H9WF",
] as const;

function requiredEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function refreshTrialCodes() {
  const client = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: oldCodes, error: oldCodesError } = await client
    .from("trial_codes")
    .select("id, code")
    .in("code", [...RETIRED_TRIAL_CODES]);
  if (oldCodesError) throw oldCodesError;

  const oldIds = (oldCodes ?? []).map((row) => row.id);
  let activeIds = new Set<string>();
  let historicIds = new Set<string>();
  if (oldIds.length > 0) {
    const { data: runs, error: runsError } = await client
      .from("trial_runs")
      .select("trial_code_id, status")
      .in("trial_code_id", oldIds);
    if (runsError) throw runsError;
    for (const run of runs ?? []) {
      historicIds.add(run.trial_code_id);
      if (run.status === "reserved") activeIds.add(run.trial_code_id);
    }
  }

  // Removing a code that has a research job would cascade into trial_runs and
  // break report history. Such codes are revoked instead; to users they are
  // indistinguishable from deleted codes and cannot be redeemed or reused.
  const deletableIds = oldIds.filter((id) => !historicIds.has(id) && !activeIds.has(id));
  const revocableIds = oldIds.filter((id) => historicIds.has(id) && !activeIds.has(id));
  if (deletableIds.length > 0) {
    const { error } = await client.from("trial_codes").delete().in("id", deletableIds);
    if (error) throw error;
  }
  if (revocableIds.length > 0) {
    const { error } = await client.from("trial_codes")
      .update({ revoked_at: new Date().toISOString() })
      .in("id", revocableIds);
    if (error) throw error;
  }

  const { error: insertError } = await client.from("trial_codes").upsert(
    NEW_TRIAL_CODES.map((code) => ({ code, max_runs: 2 })),
    { onConflict: "code", ignoreDuplicates: true },
  );
  if (insertError) throw insertError;

  console.log(JSON.stringify({
    newCodesSeeded: NEW_TRIAL_CODES.length,
    oldCodesDeleted: deletableIds.length,
    oldCodesRevoked: revocableIds.length,
    oldCodesSkippedBecauseRunning: activeIds.size,
  }));
}

refreshTrialCodes().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
