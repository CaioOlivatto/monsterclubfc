-- Balanceamento seguro dos elencos CPU persistidos.
-- Não remove registros e pode ser reaplicado sem duplicar índices/funções.

create index if not exists creatures_owner_team_availability_idx
  on public.creatures (owner_team_id, injury_matches_remaining)
  where owner_team_id is not null and retired is not true;

create or replace function public.evolve_cpu_rosters_after_transition(
  p_promoted_team_ids uuid[] default '{}'::uuid[],
  p_relegated_team_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Evolução deliberadamente pequena: subir de divisão melhora o elenco em um
  -- ponto; cair retira um ponto. Assim há continuidade sem inflação sazonal.
  if coalesce(cardinality(p_promoted_team_ids), 0) > 0 then
    update public.creatures
       set overall = least(100, greatest(1, coalesce(overall, 1) + 1))
     where owner_team_id = any(p_promoted_team_ids)
       and owner_trainer_id is null
       and retired is not true;
  end if;

  if coalesce(cardinality(p_relegated_team_ids), 0) > 0 then
    update public.creatures
       set overall = least(100, greatest(1, coalesce(overall, 1) - 1))
     where owner_team_id = any(p_relegated_team_ids)
       and owner_trainer_id is null
       and retired is not true;
  end if;
end;
$$;

revoke all on function public.evolve_cpu_rosters_after_transition(uuid[], uuid[]) from public;
grant execute on function public.evolve_cpu_rosters_after_transition(uuid[], uuid[]) to authenticated;
