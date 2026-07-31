-- Durable research state. The workflow engine persists execution checkpoints;
-- this table persists the user-visible status and finished report.
create table if not exists public.research_jobs (
  id uuid primary key default gen_random_uuid(),
  trial_run_id uuid not null unique references public.trial_runs(id) on delete restrict,
  owner_token_hash text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  current_stage text not null default 'queued',
  message text not null default '已进入调研队列。',
  input jsonb not null,
  collection jsonb,
  selected_sources jsonb,
  source_facts jsonb,
  report jsonb,
  workflow_run_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists research_jobs_owner_updated_idx on public.research_jobs(owner_token_hash, updated_at desc);
create index if not exists research_jobs_status_updated_idx on public.research_jobs(status, updated_at desc);

alter table public.research_jobs enable row level security;
revoke all on public.research_jobs from anon, authenticated;
grant select, insert, update on public.research_jobs to service_role;

-- A function timeout must not permanently consume a trial. Reclaim only jobs
-- that have been reserved for more than 30 minutes and were never settled.
create or replace function public.reclaim_stale_trial_reservations(p_trial_code_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_released integer;
begin
  with released as (
    update public.trial_runs
    set status = 'released', completed_at = now()
    where trial_code_id = p_trial_code_id
      and status = 'reserved'
      and created_at < now() - interval '30 minutes'
    returning id
  )
  select count(*) into v_released from released;

  if v_released > 0 then
    update public.trial_codes
    set reserved_runs = greatest(0, reserved_runs - v_released)
    where id = p_trial_code_id;
  end if;
  return v_released;
end; $$;

create or replace function public.get_trial_status(p_access_token text)
returns table(code text, remaining_runs integer, completed_runs integer, max_runs integer)
language plpgsql security definer set search_path = public as $$
declare v_code public.trial_codes%rowtype;
begin
  select * into v_code from public.trial_codes
  where access_token_hash = encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex')
    and revoked_at is null
  for update;
  if not found then return; end if;
  perform public.reclaim_stale_trial_reservations(v_code.id);
  select * into v_code from public.trial_codes where id = v_code.id;
  return query select v_code.code, v_code.max_runs - v_code.completed_runs - v_code.reserved_runs,
    v_code.completed_runs, v_code.max_runs;
end; $$;

create or replace function public.reserve_trial_run(p_access_token text)
returns table(run_id uuid, code text, remaining_runs integer, completed_runs integer, max_runs integer)
language plpgsql security definer set search_path = public as $$
declare v_code public.trial_codes%rowtype; v_run uuid;
begin
  select * into v_code from public.trial_codes
  where access_token_hash = encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex')
    and revoked_at is null
  for update;
  if not found then raise exception '兑换码会话无效。'; end if;
  perform public.reclaim_stale_trial_reservations(v_code.id);
  select * into v_code from public.trial_codes where id = v_code.id;
  if v_code.completed_runs + v_code.reserved_runs >= v_code.max_runs then
    raise exception '免费次数已用完，请联系我们购买。';
  end if;
  update public.trial_codes set reserved_runs = reserved_runs + 1 where id = v_code.id;
  insert into public.trial_runs(trial_code_id, status) values (v_code.id, 'reserved') returning id into v_run;
  return query select v_run, v_code.code, v_code.max_runs - v_code.completed_runs - v_code.reserved_runs - 1,
    v_code.completed_runs, v_code.max_runs;
end; $$;

-- Workflow runs never receive the browser access token. Settlement by run id is
-- idempotent, which makes step retry safe.
create or replace function public.complete_trial_run_by_id(p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_run public.trial_runs%rowtype; v_code public.trial_codes%rowtype;
begin
  select * into v_run from public.trial_runs where id = p_run_id for update;
  if not found then raise exception '调研次数记录无效。'; end if;
  if v_run.status = 'completed' then return; end if;
  if v_run.status = 'released' then raise exception '调研次数已释放，不能再结算。'; end if;
  select * into v_code from public.trial_codes where id = v_run.trial_code_id for update;
  update public.trial_runs set status = 'completed', completed_at = now() where id = p_run_id;
  update public.trial_codes set reserved_runs = greatest(0, reserved_runs - 1), completed_runs = completed_runs + 1 where id = v_code.id;
end; $$;

create or replace function public.release_trial_run_by_id(p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_run public.trial_runs%rowtype; v_code public.trial_codes%rowtype;
begin
  select * into v_run from public.trial_runs where id = p_run_id for update;
  if not found then return; end if;
  if v_run.status in ('released', 'completed') then return; end if;
  select * into v_code from public.trial_codes where id = v_run.trial_code_id for update;
  update public.trial_runs set status = 'released', completed_at = now() where id = p_run_id;
  update public.trial_codes set reserved_runs = greatest(0, reserved_runs - 1) where id = v_code.id;
end; $$;

grant execute on function public.reclaim_stale_trial_reservations(uuid), public.complete_trial_run_by_id(uuid), public.release_trial_run_by_id(uuid) to service_role;
