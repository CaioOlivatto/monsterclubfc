-- A função é SECURITY INVOKER e precisa reservar/fechar apenas a própria
-- operação idempotente. Libera-se o mínimo necessário ao usuário autenticado:
-- INSERT da própria chave e UPDATE somente do campo de resultado.
-- Nenhuma permissão é aberta para anon, nem para saldo, prédios ou transações.
GRANT INSERT (trainer_id, idempotency_key, operation_type), UPDATE (result)
  ON public.economy_operations TO authenticated;

DROP POLICY IF EXISTS "create own economy operations" ON public.economy_operations;
CREATE POLICY "create own economy operations"
  ON public.economy_operations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trainers t
      WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "finalize own economy operations" ON public.economy_operations;
CREATE POLICY "finalize own economy operations"
  ON public.economy_operations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trainers t
      WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trainers t
      WHERE t.id = trainer_id AND t.user_id = (SELECT auth.uid())
    )
  );
