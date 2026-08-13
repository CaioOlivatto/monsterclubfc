-- Aplica os efeitos pós-partida de todo o elenco em uma única operação.
-- SECURITY INVOKER preserva as políticas RLS da sessão autenticada.
create or replace function public.apply_creature_match_updates(
  p_trainer_id uuid,
  p_updates jsonb
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.creatures as creature
  set
    xp = patch.xp,
    pending_half_stars = patch.pending_half_stars,
    energy = patch.energy,
    morale = patch.morale,
    injury_matches_remaining = patch.injury_matches_remaining,
    injury_severity = patch.injury_severity
  from jsonb_to_recordset(p_updates) as patch(
    id uuid,
    xp integer,
    pending_half_stars integer,
    energy integer,
    morale integer,
    injury_matches_remaining integer,
    injury_severity text
  )
  where creature.id = patch.id
    and creature.owner_trainer_id = p_trainer_id;
$$;

revoke execute on function public.apply_creature_match_updates(uuid, jsonb) from public, anon;
grant execute on function public.apply_creature_match_updates(uuid, jsonb) to authenticated;
