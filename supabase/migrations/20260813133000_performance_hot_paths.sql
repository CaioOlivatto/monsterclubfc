-- Read-path indexes for the most frequent game screens.
-- They do not change data, permissions, or RLS behavior.

CREATE INDEX IF NOT EXISTS idx_standings_competition_points
  ON public.standings (competition_id, points DESC);

CREATE INDEX IF NOT EXISTS idx_matches_home_status_played
  ON public.matches (home_team_id, status, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_matches_away_status_played
  ON public.matches (away_team_id, status, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_creatures_owner_overall
  ON public.creatures (owner_trainer_id, overall DESC);

CREATE INDEX IF NOT EXISTS idx_teams_trainer_player_competition
  ON public.teams (trainer_id, is_player, competition_id)
  WHERE is_player = true;
