import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Award, Trophy, TrendingUp, TrendingDown, DoorOpen, Building2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCareer, type CareerEntry } from "@/lib/career.functions";

const DIV_LABEL: Record<string, string> = {
  lendaria: "1ª — Lendária",
  diamante: "2ª — Diamante",
  ouro: "3ª — Ouro",
  prata: "4ª — Prata",
  bronze: "5ª — Bronze",
};

const EVENT_META: Record<
  CareerEntry["event"],
  { label: string; tone: string; Icon: typeof Trophy }
> = {
  arrived:    { label: "Chegou ao clube", tone: "bg-muted text-muted-foreground border-border", Icon: Building2 },
  hired:      { label: "Contratado", tone: "bg-blue-500/15 text-blue-200 border-blue-500/40", Icon: Sparkles },
  promoted:   { label: "Promovido", tone: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40", Icon: TrendingUp },
  relegated:  { label: "Rebaixado", tone: "bg-red-500/15 text-red-200 border-red-500/40", Icon: TrendingDown },
  champion:   { label: "Campeão", tone: "bg-amber-500/15 text-amber-200 border-amber-500/40", Icon: Trophy },
  fired:      { label: "Demitido", tone: "bg-orange-600/15 text-orange-200 border-orange-500/40", Icon: DoorOpen },
  left:       { label: "Deixou o clube", tone: "bg-slate-500/15 text-slate-200 border-slate-400/40", Icon: DoorOpen },
};

export const Route = createFileRoute("/_authenticated/career")({
  head: () => ({
    meta: [
      { title: "Carreira do Treinador — Monster Club Manager" },
      { name: "description", content: "Currículo do treinador: clubes dirigidos, títulos, promoções e rebaixamentos ao longo das temporadas." },
      { property: "og:title", content: "Carreira do Treinador — Monster Club Manager" },
      { property: "og:description", content: "Sua trajetória entre clubes, títulos e temporadas." },
    ],
  }),
  component: CareerPage,
});

function CareerPage() {
  const fetchCareer = useServerFn(getCareer);
  const { data, isLoading } = useQuery({
    queryKey: ["career"],
    queryFn: () => fetchCareer(),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <div className="flex items-center gap-2 pb-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/dashboard"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold leading-none">Carreira</h1>
          <p className="text-xs text-muted-foreground">Seu currículo como treinador</p>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <Card className="mb-3">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="h-4 w-4 text-primary" />
                {data.trainer_name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Clube atual</span>
                <span className="font-medium">
                  {data.current_team_name ?? "Sem clube"}
                  {data.current_division ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {DIV_LABEL[data.current_division] ?? data.current_division}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Nível do treinador</span>
                <span className="font-medium">Nv {data.level} · {data.xp.toLocaleString("pt-BR")} XP</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Temporadas no clube atual</span>
                <span className="font-medium">{data.seasons_at_current_club}</span>
              </div>
            </CardContent>
          </Card>

          <div className="mb-3 grid grid-cols-3 gap-2">
            <MiniStat label="Clubes" value={data.totals.clubs} />
            <MiniStat label="Temporadas" value={data.totals.seasons} />
            <MiniStat label="Títulos" value={data.totals.titles} accent="amber" />
            <MiniStat label="Promoções" value={data.totals.promotions} accent="emerald" />
            <MiniStat label="Rebaixamentos" value={data.totals.relegations} accent="red" />
            <MiniStat label="Demissões" value={data.totals.dismissals} accent="orange" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Trajetória</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.entries.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Ainda sem histórico registrado.</p>
              ) : (
                <ul className="divide-y">
                  {data.entries.map((e) => {
                    const meta = EVENT_META[e.event];
                    const Icon = meta.Icon;
                    return (
                      <li key={e.id} className="flex items-start gap-3 p-3">
                        <div className="mt-0.5 rounded-md border bg-muted/40 p-1.5">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{e.team_name}</span>
                            <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>
                              {meta.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {DIV_LABEL[e.division] ?? e.division}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Temporada {e.season_start}
                            {e.season_end && e.season_end !== e.season_start ? `–${e.season_end}` : ""}
                            {e.final_position ? ` · ${e.final_position}º lugar` : ""}
                            {e.title ? ` · ${e.title}` : ""}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber" | "emerald" | "red" | "orange";
}) {
  const tone =
    accent === "amber"   ? "text-amber-300"   :
    accent === "emerald" ? "text-emerald-300" :
    accent === "red"     ? "text-red-300"     :
    accent === "orange"  ? "text-orange-300"  : "text-foreground";
  return (
    <div className="rounded-md border bg-card p-2 text-center">
      <div className={`text-lg font-semibold leading-none ${tone}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
