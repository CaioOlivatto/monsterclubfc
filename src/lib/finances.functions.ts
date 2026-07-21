import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getFinances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, academies(money, gems, builders, roster_slots)")
      .eq("user_id", userId)
      .maybeSingle();
    if (!trainer) throw new Error("Treinador não encontrado.");
    const academy = Array.isArray(trainer.academies) ? trainer.academies[0] : trainer.academies;

    const { data: transactions } = await supabase
      .from("financial_transactions")
      .select("id, transaction_type, amount, description, created_at")
      .eq("trainer_id", trainer.id)
      .order("created_at", { ascending: false })
      .limit(60);

    const list = transactions ?? [];
    const income = list
      .filter((t: any) => t.transaction_type === "income")
      .reduce((a: number, t: any) => a + Number(t.amount), 0);
    const expense = list
      .filter((t: any) => t.transaction_type === "expense")
      .reduce((a: number, t: any) => a + Number(t.amount), 0);

    return {
      money: Number(academy?.money ?? 0),
      gems: academy?.gems ?? 0,
      builders: academy?.builders ?? 0,
      transactions: list,
      totals: { income, expense, net: income - expense },
    };
  });
