create extension if not exists pgcrypto;

create table if not exists public.trial_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and char_length(code) between 8 and 40),
  max_runs integer not null default 2 check (max_runs > 0 and max_runs <= 10),
  completed_runs integer not null default 0 check (completed_runs >= 0),
  reserved_runs integer not null default 0 check (reserved_runs >= 0),
  access_token_hash text unique,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (completed_runs + reserved_runs <= max_runs)
);

create table if not exists public.trial_runs (
  id uuid primary key default gen_random_uuid(),
  trial_code_id uuid not null references public.trial_codes(id) on delete cascade,
  status text not null check (status in ('reserved', 'completed', 'released')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists trial_runs_code_status_idx on public.trial_runs(trial_code_id, status);

alter table public.trial_codes enable row level security;
alter table public.trial_runs enable row level security;

create or replace function public.redeem_trial_code(p_code text)
returns table(access_token text, code text, remaining_runs integer, completed_runs integer, max_runs integer)
language plpgsql security definer set search_path = public as $$
declare
  v_code public.trial_codes%rowtype;
  v_token text;
begin
  select * into v_code from public.trial_codes where trial_codes.code = upper(trim(p_code)) for update;
  if not found or v_code.revoked_at is not null or v_code.access_token_hash is not null then
    raise exception '兑换码不可用或已被使用。';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.trial_codes set access_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'), claimed_at = now() where id = v_code.id;
  return query select v_token, v_code.code, v_code.max_runs, v_code.completed_runs, v_code.max_runs;
end; $$;

create or replace function public.get_trial_status(p_access_token text)
returns table(code text, remaining_runs integer, completed_runs integer, max_runs integer)
language sql security definer set search_path = public as $$
  select c.code, c.max_runs - c.completed_runs - c.reserved_runs, c.completed_runs, c.max_runs
  from public.trial_codes c
  where c.access_token_hash = encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex') and c.revoked_at is null;
$$;

create or replace function public.reserve_trial_run(p_access_token text)
returns table(run_id uuid, code text, remaining_runs integer, completed_runs integer, max_runs integer)
language plpgsql security definer set search_path = public as $$
declare v_code public.trial_codes%rowtype; v_run uuid;
begin
  select * into v_code from public.trial_codes where access_token_hash = encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex') and revoked_at is null for update;
  if not found then raise exception '兑换码会话无效。'; end if;
  if v_code.completed_runs + v_code.reserved_runs >= v_code.max_runs then raise exception '免费次数已用完，请联系我们购买。'; end if;
  update public.trial_codes set reserved_runs = reserved_runs + 1 where id = v_code.id;
  insert into public.trial_runs(trial_code_id, status) values (v_code.id, 'reserved') returning id into v_run;
  return query select v_run, v_code.code, v_code.max_runs - v_code.completed_runs - v_code.reserved_runs - 1, v_code.completed_runs, v_code.max_runs;
end; $$;

create or replace function public.complete_trial_run(p_access_token text, p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_code_id uuid;
begin
  select c.id into v_code_id from public.trial_codes c where c.access_token_hash = encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex') for update;
  if not found then raise exception '兑换码会话无效。'; end if;
  update public.trial_runs set status = 'completed', completed_at = now() where id = p_run_id and trial_code_id = v_code_id and status = 'reserved';
  if not found then raise exception '调研次数记录无效。'; end if;
  update public.trial_codes set reserved_runs = reserved_runs - 1, completed_runs = completed_runs + 1 where id = v_code_id;
end; $$;

create or replace function public.release_trial_run(p_access_token text, p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_code_id uuid;
begin
  select c.id into v_code_id from public.trial_codes c where c.access_token_hash = encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex') for update;
  if not found then raise exception '兑换码会话无效。'; end if;
  update public.trial_runs set status = 'released', completed_at = now() where id = p_run_id and trial_code_id = v_code_id and status = 'reserved';
  if found then update public.trial_codes set reserved_runs = reserved_runs - 1 where id = v_code_id; end if;
end; $$;

revoke all on public.trial_codes, public.trial_runs from anon, authenticated;
grant execute on function public.redeem_trial_code(text), public.get_trial_status(text), public.reserve_trial_run(text), public.complete_trial_run(text, uuid), public.release_trial_run(text, uuid) to service_role;

insert into public.trial_codes(code) values
  ('SIA-7M2K-9Q4R'), ('SIA-3V8N-6L5P'), ('SIA-8H4D-2X7W'), ('SIA-5T9C-7J3F'),
  ('SIA-2R6Y-8K4M'), ('SIA-9P3L-5V7D'), ('SIA-4W8F-2N6Q'), ('SIA-6J2M-9T5H'),
  ('SIA-7X5R-3K8P'), ('SIA-2D9V-6W4L'), ('SIA-8Q3H-7M2C'), ('SIA-5N6P-4Y9T'),
  ('SIA-3K7W-8D2R'), ('SIA-9M4C-5X6J'), ('SIA-6T8L-3Q7V'), ('SIA-2H5P-9N4F'),
  ('SIA-7D3R-6M8K'), ('SIA-4V9T-2W5Q'), ('SIA-8L6C-7H3P'), ('SIA-5Q2J-4X9N')
on conflict (code) do nothing;
