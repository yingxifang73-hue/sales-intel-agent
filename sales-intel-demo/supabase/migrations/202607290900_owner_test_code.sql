alter table public.trial_codes drop constraint if exists trial_codes_max_runs_check;
alter table public.trial_codes add constraint trial_codes_max_runs_check check (max_runs > 0 and max_runs <= 1000000);

insert into public.trial_codes(code, max_runs)
values ('SIA-OWNER-2026-PERM', 1000000)
on conflict (code) do update set max_runs = excluded.max_runs, revoked_at = null;
