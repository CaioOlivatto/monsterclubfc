create table if not exists public.season_transition_runs (
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  season_id uuid not null references public.game_seasons(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'completed')),
  result jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (trainer_id, season_id)
);

alter table public.season_transition_runs enable row level security;

drop policy if exists "season transition owner read" on public.season_transition_runs;
create policy "season transition owner read"
on public.season_transition_runs for select
using (exists (
  select 1 from public.trainers t
  where t.id = trainer_id and t.user_id = auth.uid()
));

create or replace function public.claim_season_transition(p_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trainer_id uuid;
  v_run public.season_transition_runs%rowtype;
begin
  select id into v_trainer_id
  from public.trainers
  where user_id = auth.uid();
  if v_trainer_id is null then raise exception 'Unauthorized'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_trainer_id::text || ':' || p_season_id::text, 0));
  select * into v_run
  from public.season_transition_runs
  where trainer_id = v_trainer_id and season_id = p_season_id
  for update;

  if found and v_run.status = 'completed' then
    return jsonb_build_object('claimed', false, 'completed', true, 'result', v_run.result);
  end if;
  if found and v_run.started_at > now() - interval '15 minutes' then
    return jsonb_build_object('claimed', false, 'completed', false);
  end if;

  insert into public.season_transition_runs (trainer_id, season_id, status, result, started_at, completed_at)
  values (v_trainer_id, p_season_id, 'processing', null, now(), null)
  on conflict (trainer_id, season_id) do update
  set status = 'processing', result = null, started_at = now(), completed_at = null;

  return jsonb_build_object('claimed', true, 'completed', false);
end;
$$;

create or replace function public.complete_season_transition(p_season_id uuid, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.season_transition_runs
  set status = 'completed', result = p_result, completed_at = now()
  where trainer_id = (
    select id from public.trainers where user_id = auth.uid()
  ) and season_id = p_season_id;
end;
$$;

revoke all on function public.claim_season_transition(uuid) from public;
revoke all on function public.complete_season_transition(uuid, jsonb) from public;
grant execute on function public.claim_season_transition(uuid) to authenticated;
grant execute on function public.complete_season_transition(uuid, jsonb) to authenticated;
