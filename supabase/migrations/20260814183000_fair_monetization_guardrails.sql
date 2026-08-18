-- Gemas podem ser conquistadas e usadas em conveniência, mas não podem mais
-- ser convertidas diretamente em caixa competitivo. Mantemos a função para
-- preservar o histórico de migrations, removendo seu acesso pela aplicação.
REVOKE EXECUTE ON FUNCTION public.exchange_gems_for_money_atomic(uuid, integer)
  FROM authenticated;
