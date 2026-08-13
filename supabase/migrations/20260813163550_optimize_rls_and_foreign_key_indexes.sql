-- Performance only: preserve the existing access rules while evaluating the
-- authenticated user once per statement instead of once per row.

ALTER POLICY "own profile" ON public.profiles
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

ALTER POLICY "own trainer" ON public.trainers
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "own academy" ON public.academies
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own buildings" ON public.buildings
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own seasons" ON public.game_seasons
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own competitions" ON public.competitions
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own finance" ON public.financial_transactions
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own items" ON public.items
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own messages" ON public.messages
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own market" ON public.market_listings
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own market purchases" ON public.market_purchases
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own transfers" ON public.transfers
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own world state" ON public.world_state
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own qualifications" ON public.qualifications
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "Trainers insert their offers" ON public.job_offers
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "Trainers update their offers" ON public.job_offers
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "Trainers view their offers" ON public.job_offers
  USING (EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "trainer can manage own live match" ON public.live_matches
  USING (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = (SELECT auth.uid())));

ALTER POLICY "Trainers manage own lineup" ON public.team_lineups
  USING (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = (SELECT auth.uid())));

ALTER POLICY "Trainers manage their own career" ON public.trainer_career
  USING (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = (SELECT auth.uid())));

ALTER POLICY "own league standings" ON public.standings
  USING (EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = competition_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = competition_id AND t.user_id = (SELECT auth.uid())));

ALTER POLICY "own teams" ON public.teams
  USING (
    (trainer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = teams.trainer_id AND t.user_id = (SELECT auth.uid())))
    OR (competition_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = teams.competition_id AND t.user_id = (SELECT auth.uid())))
  )
  WITH CHECK (
    (trainer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = teams.trainer_id AND t.user_id = (SELECT auth.uid())))
    OR (competition_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = teams.competition_id AND t.user_id = (SELECT auth.uid())))
  );

ALTER POLICY "own creatures" ON public.creatures
  USING (
    (owner_trainer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = creatures.owner_trainer_id AND t.user_id = (SELECT auth.uid())))
    OR (owner_team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams tm JOIN public.competitions c ON c.id = tm.competition_id JOIN public.trainers t ON t.id = c.trainer_id WHERE tm.id = creatures.owner_team_id AND t.user_id = (SELECT auth.uid())))
  )
  WITH CHECK (
    (owner_trainer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = creatures.owner_trainer_id AND t.user_id = (SELECT auth.uid())))
    OR (owner_team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams tm JOIN public.competitions c ON c.id = tm.competition_id JOIN public.trainers t ON t.id = c.trainer_id WHERE tm.id = creatures.owner_team_id AND t.user_id = (SELECT auth.uid())))
  );

ALTER POLICY "own matches" ON public.matches
  USING (
    (competition_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = matches.competition_id AND t.user_id = (SELECT auth.uid())))
    OR EXISTS (SELECT 1 FROM public.teams tm JOIN public.trainers t ON t.id = tm.trainer_id WHERE (tm.id = matches.home_team_id OR tm.id = matches.away_team_id) AND t.user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (competition_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.competitions c JOIN public.trainers t ON t.id = c.trainer_id WHERE c.id = matches.competition_id AND t.user_id = (SELECT auth.uid())))
    OR EXISTS (SELECT 1 FROM public.teams tm JOIN public.trainers t ON t.id = tm.trainer_id WHERE (tm.id = matches.home_team_id OR tm.id = matches.away_team_id) AND t.user_id = (SELECT auth.uid()))
  );

ALTER POLICY "own match events" ON public.match_events
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      LEFT JOIN public.competitions c ON c.id = m.competition_id
      LEFT JOIN public.trainers tc ON tc.id = c.trainer_id
      LEFT JOIN public.teams th ON th.id = m.home_team_id
      LEFT JOIN public.trainers tth ON tth.id = th.trainer_id
      LEFT JOIN public.teams ta ON ta.id = m.away_team_id
      LEFT JOIN public.trainers tta ON tta.id = ta.trainer_id
      WHERE m.id = match_events.match_id
        AND (tc.user_id = (SELECT auth.uid()) OR tth.user_id = (SELECT auth.uid()) OR tta.user_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matches m
      LEFT JOIN public.competitions c ON c.id = m.competition_id
      LEFT JOIN public.trainers tc ON tc.id = c.trainer_id
      LEFT JOIN public.teams th ON th.id = m.home_team_id
      LEFT JOIN public.trainers tth ON tth.id = th.trainer_id
      LEFT JOIN public.teams ta ON ta.id = m.away_team_id
      LEFT JOIN public.trainers tta ON tta.id = ta.trainer_id
      WHERE m.id = match_events.match_id
        AND (tc.user_id = (SELECT auth.uid()) OR tth.user_id = (SELECT auth.uid()) OR tta.user_id = (SELECT auth.uid()))
    )
  );

-- Foreign-key indexes reported by the Supabase performance advisor.
CREATE INDEX IF NOT EXISTS idx_competitions_season_id ON public.competitions (season_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_team_id ON public.job_offers (team_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_season_id ON public.market_listings (season_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_trainer_id ON public.market_listings (trainer_id);
CREATE INDEX IF NOT EXISTS idx_match_events_actor_creature_id ON public.match_events (actor_creature_id);
CREATE INDEX IF NOT EXISTS idx_match_events_actor_team_id ON public.match_events (actor_team_id);
CREATE INDEX IF NOT EXISTS idx_standings_team_id ON public.standings (team_id);
CREATE INDEX IF NOT EXISTS idx_trainers_current_team_id ON public.trainers (current_team_id);
CREATE INDEX IF NOT EXISTS idx_transfers_creature_id ON public.transfers (creature_id);
CREATE INDEX IF NOT EXISTS idx_transfers_trainer_id ON public.transfers (trainer_id);
CREATE INDEX IF NOT EXISTS idx_world_academies_team_id ON public.world_academies (team_id);
CREATE INDEX IF NOT EXISTS idx_world_state_season_id ON public.world_state (season_id);
