import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Clock, Gem, Gift, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import { activateMonthlyClubWithGems, claimClubCalendarDay, claimClubTask, getMonthlyClubState } from "@/lib/club.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { GamePageShell } from "@/components/GamePageShell";

export const Route = createFileRoute("/_authenticated/club")({ component: MonthlyClubPage });

function MonthlyClubPage() {
  const qc = useQueryClient();
  const load = useServerFn(getMonthlyClubState);
  const activate = useServerFn(activateMonthlyClubWithGems);
  const claim = useServerFn(claimClubTask);
  const claimCalendar = useServerFn(claimClubCalendarDay);
  const { data, isLoading } = useQuery({ queryKey: ["monthly-club"], queryFn: () => load() });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["monthly-club"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["shop"] });
  };
  const activateMutation = useMutation({
    mutationFn: () => activate(),
    onSuccess: () => { toast.success("Clube Mensal ativado por 30 dias!"); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const claimMutation = useMutation({
    mutationFn: (task_key: "check_in" | "play_1" | "play_3" | "win_1" | "weekly_bonus") => claim({ data: { task_key } }),
    onSuccess: (result) => { toast.success(`Você recebeu ${result.reward} gemas.`); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const calendarMutation = useMutation({
    mutationFn: () => claimCalendar(),
    onSuccess: (result) => { toast.success(result.monthly_bonus ? "Recompensa diária e meta mensal resgatadas!" : "Recompensa diária resgatada!"); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !data) return <div className="grid min-h-screen place-items-center text-muted-foreground">Carregando Clube Mensal...</div>;
  const daysLeft = data.active_until ? Math.max(0, Math.ceil((new Date(data.active_until).getTime() - Date.now()) / 86400000)) : 0;

  return <GamePageShell title="Clube Mensal" subtitle="Assiduidade também vale benefícios" gems={data.gems}>
      <Card className="overflow-hidden border-violet-400/40 bg-gradient-to-br from-violet-500/15 via-card to-cyan-500/10"><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="text-violet-400" />Clube Monster</CardTitle></CardHeader><CardContent className="space-y-4">
        {data.active ? <div className="flex flex-wrap items-center justify-between gap-3"><div><Badge className="bg-emerald-600">Ativo</Badge><p className="mt-2 text-sm text-muted-foreground"><Clock className="mr-1 inline h-4 w-4" />{daysLeft} dias restantes</p></div><Button disabled>{data.real_price} · renovação automática em breve</Button></div> : <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2"><Button disabled>{data.real_price} · 30 dias · em breve</Button><Button variant="secondary" disabled={data.gems < data.gem_price || activateMutation.isPending} onClick={() => activateMutation.mutate()}><Gem className="mr-2 h-4 w-4" />Ativar por {data.gem_price}</Button></div>
          {data.gem_deficit > 0 && data.recommended_package && <div className="rounded-lg border border-violet-400/30 bg-violet-500/10 p-3 text-sm"><p className="font-medium">Faltam {data.gem_deficit} gemas para renovar seu Clube.</p><p className="mt-1 text-muted-foreground">Menor opção suficiente: {data.recommended_package.name} · {data.recommended_package.total_gems} gemas · {data.recommended_package.price}.</p><Button asChild className="mt-2" size="sm" variant="outline"><Link to="/shop">Ver pacote</Link></Button></div>}
        </div>}
        <div className="grid gap-2 text-sm sm:grid-cols-2">{["+50% de gemas nas tarefas", "6 Duelos de Risco por janela", "5 poções individuais e 2 coletivas", "Acelerações de treino e 2º espaço de estratégia", "Escudo semanal e 10% menos em reparos", "Calendário e estatísticas avançadas", "Mesmos benefícios com gemas ou dinheiro"].map((benefit) => <div key={benefit} className="flex items-center gap-2 rounded-md border bg-background/40 p-2"><Check className="h-4 w-4 text-emerald-500" />{benefit}</div>)}</div>
      </CardContent></Card>

      {data.active && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Gift className="h-4 w-4" />Calendário do Clube</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">{Array.from({ length: 30 }, (_, index) => index + 1).map((day) => { const claimed = data.calendar.claimed_days.includes(day); const current = day === data.calendar.current_day; return <div key={day} className={`grid aspect-square place-items-center rounded-md border text-xs font-medium ${claimed ? "border-emerald-500 bg-emerald-500/15 text-emerald-600" : current ? "border-violet-500 bg-violet-500/15" : "text-muted-foreground"}`}>{claimed ? <Check className="h-4 w-4" /> : day}</div>; })}</div>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Dia {data.calendar.current_day} de 30</p><p className="text-xs text-muted-foreground">O prêmio diário precisa ser resgatado no próprio dia.</p></div><Button disabled={data.calendar.claimed_today || calendarMutation.isPending} onClick={() => calendarMutation.mutate()}>{data.calendar.claimed_today ? "Resgatado hoje" : "Resgatar recompensa"}</Button></div>
        <div className="rounded-md border p-3"><div className="flex justify-between text-sm"><span>Meta mensal</span><b>{data.calendar.claimed_count}/20 dias</b></div><Progress className="mt-2" value={Math.min(100, data.calendar.claimed_count / 20 * 100)} /><p className="mt-2 text-xs text-muted-foreground">20 dias: 50 gemas, 2 recuperações coletivas, 1 olheiro e 1 escudo.</p></div>
        <div className="grid gap-2 text-xs sm:grid-cols-3"><Badge variant="outline">{data.entitlements.scout_credits} olheiros</Badge><Badge variant="outline">{data.entitlements.shield_12h_credits} escudos de 12h</Badge><Badge variant="outline">{data.entitlements.training_rush_credits} acelerações</Badge></div>
      </CardContent></Card>}

      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" />Missões semanais</CardTitle></CardHeader><CardContent className="space-y-3">{data.tasks.map((task) => <div key={task.key} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-sm"><span className="font-medium">{task.label}</span><span>{task.current}/{task.target}</span></div><Progress className="mt-2 h-1.5" value={(task.current / task.target) * 100} /></div><Button size="sm" className="w-full sm:w-auto" disabled={!task.complete || task.claimed || claimMutation.isPending} onClick={() => claimMutation.mutate(task.key)}>{task.claimed ? "Resgatado" : `+${task.reward} 💎`}</Button></div>)}</CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4" />Conclusão semanal</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Conclua todas as missões para receber o bônus. Nenhuma missão exige gasto de gemas ou dinheiro real.</p><Progress value={(data.weekly.current / data.weekly.target) * 100} /><div className="flex items-center justify-between"><span className="text-sm">{data.weekly.current}/{data.weekly.target} missões</span><Button disabled={!data.weekly.complete || data.weekly.claimed || claimMutation.isPending} onClick={() => claimMutation.mutate("weekly_bonus")}>{data.weekly.claimed ? "Resgatado" : `+${data.weekly.reward} 💎`}</Button></div></CardContent></Card>
  </GamePageShell>;
}
