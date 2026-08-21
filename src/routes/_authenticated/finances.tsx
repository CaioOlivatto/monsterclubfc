import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getFinancesWithSession } from "@/lib/finances.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Gem, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { GameRecovery } from "@/components/GameRecovery";

export const Route = createFileRoute("/_authenticated/finances")({
  head: () => ({
    meta: [
      { title: "Finanças — Monster Club Manager" },
      { name: "description", content: "Extrato financeiro completo da sua academia." },
      { property: "og:title", content: "Finanças — Monster Club Manager" },
      { property: "og:description", content: "Extrato financeiro completo da sua academia." },
    ],
  }),
  component: FinancesPage,
  errorComponent: () => <GameRecovery area="as finanças" />,
  notFoundComponent: () => (
    <div className="p-8 text-center text-muted-foreground">Não encontrada.</div>
  ),
});

function money(n: number) {
  return "$ " + Math.round(n).toLocaleString("pt-BR");
}

function FinancesPage() {
  const fetchFn = useServerFn(getFinancesWithSession);
  const { data, isLoading } = useQuery({
    queryKey: ["finances"],
    queryFn: async () => {
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error || !sessionData.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
      return fetchFn({ data: { access_token: sessionData.session.access_token } });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Wallet className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Finanças</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard icon={<Coins className="h-4 w-4" />} label="Caixa" value={money(data.money)} />
          <StatCard
            icon={<Gem className="h-4 w-4" />}
            label="Gemas"
            value={String(data.gems)}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Saldo (últimos)"
            value={money(data.totals.net)}
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 rounded-md border border-border/60 p-3">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-[11px] uppercase text-muted-foreground">Receitas</p>
                <p className="font-semibold">{money(data.totals.income)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/60 p-3">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <div>
                <p className="text-[11px] uppercase text-muted-foreground">Despesas</p>
                <p className="font-semibold">{money(data.totals.expense)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Extrato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.transactions.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sem movimentações ainda.
              </p>
            )}
            {data.transactions.map((t: any) => {
              const amount = Number(t.amount);
              const isIncome = t.transaction_type === "income";
              const isGemReward = amount === 0 && /💎|gema/i.test(t.description ?? "");
              const gemMatch = (t.description ?? "").match(/\+?(\d+)\s*💎/);
              const gemQty = gemMatch ? Number(gemMatch[1]) : 30;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/40 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  {isGemReward ? (
                    <Badge
                      variant="outline"
                      className="border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300"
                    >
                      <Gem className="mr-1 h-3 w-3" />+{gemQty} 💎
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className={
                        isIncome
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border-red-500/40 bg-red-500/10 text-red-300"
                      }
                    >
                      {isIncome ? "+" : "-"} {money(amount)}
                    </Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 p-3">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
