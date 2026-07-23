-- Add missing INSERT policy for job_offers.
-- Offers are created at end-of-season by a server function that runs under the trainer's own auth context (requireSupabaseAuth), so RLS applies. Trainers may only insert offers scoped to their own trainer_id.
CREATE POLICY "Trainers insert their offers"
ON public.job_offers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trainers t
    WHERE t.id = job_offers.trainer_id AND t.user_id = auth.uid()
  )
);
