import type { UseQueryResult } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Info, Zap } from "lucide-react";
import type { PrognosticAnalysis } from "@/lib/match-engine.server";
import type { AttendanceInfo } from "@/lib/attendance";

interface PrognosticResponse {
  analysis: PrognosticAnalysis;
  opponent: { name: string; is_next_official: boolean; round?: number | null; is_home: boolean };
  stadium_preview?: AttendanceInfo | null;
}

const ELEMENT_LABEL: Record<string, string> = {
  fogo: "Fogo", agua: "Água", terra: "Terra", ar: "Ar", gelo: "Gelo",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function PrognosticCard({ state }: { state: UseQueryResult<PrognosticResponse, unknown> }) {
  if (state.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Prognóstico</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">Calculando odds…</CardContent>
      </Card>
    );
  }
  if (state.error || !state.data) {
    const msg = (state.error as any)?.message ?? "Salve a escalação para ver o prognóstico.";
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Prognóstico</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">{msg}</CardContent>
      </Card>
    );
  }

  const { analysis, opponent } = state.data;
  const o = analysis.odds;
  const home = o.home_win, draw = o.draw, away = o.away_win;
  const gapMsg = home >= 0.6 ? "Favoritismo claro seu" : away >= 0.6 ? "Adversário é favorito claro" : home >= 0.45 ? "Leve favoritismo seu" : away >= 0.45 ? "Leve favoritismo do adversário" : "Partida equilibrada";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Prognóstico
        </CardTitle>
        <div className="text-xs text-muted-foreground">
          {opponent.is_next_official
            ? <>Próxima partida oficial · <b>Rodada {opponent.round}</b> {opponent.is_home ? "em casa" : "fora"} vs <b>{opponent.name}</b></>
            : <>Simulação amistoso vs <b>{opponent.name}</b></>}
          {" · "}{o.samples} simulações · média {o.avg_home_goals.toFixed(1)}×{o.avg_away_goals.toFixed(1)} gols
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Barra de odds */}
        <div>
          <div className="flex w-full text-[11px] mb-1 font-semibold">
            <div style={{ width: `${home * 100}%` }} className="text-center text-emerald-400 truncate">{pct(home)}</div>
            <div style={{ width: `${draw * 100}%` }} className="text-center text-amber-400 truncate">{pct(draw)}</div>
            <div style={{ width: `${away * 100}%` }} className="text-center text-red-400 truncate">{pct(away)}</div>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full border">
            <div className="bg-emerald-600" style={{ width: `${home * 100}%` }} />
            <div className="bg-amber-500" style={{ width: `${draw * 100}%` }} />
            <div className="bg-red-600" style={{ width: `${away * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>Você</span>
            <span>Empate</span>
            <span className="truncate max-w-[40%] text-right">{opponent.name}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{gapMsg}</div>
        </div>

        {/* Preview de público (só em jogos EM CASA) */}
        {opponent.is_home && state.data.stadium_preview ? (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-2 py-1.5 text-[11px]">
            <span className="text-muted-foreground">Público esperado</span>
            <span className="font-medium">
              {state.data.stadium_preview.attendance.toLocaleString("pt-BR")}
              {" / "}
              {state.data.stadium_preview.capacity.toLocaleString("pt-BR")}
              {" · "}
              {state.data.stadium_preview.label.label} {state.data.stadium_preview.label.icon}
            </span>
          </div>
        ) : !opponent.is_home && opponent.is_next_official ? (
          <div className="flex items-center justify-between rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground">
            <span>Público</span><span>Fora de casa — sem público pagante</span>
          </div>
        ) : null}

        {/* Pontos de atenção */}
        {analysis.alerts.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1">Pontos de atenção</div>
            <div className="space-y-1">
              {analysis.alerts.map((a, i) => (
                <div key={i} className={"flex items-start gap-1.5 text-[11px] rounded-md border px-2 py-1 " + (a.positive ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-200" : "border-amber-500/40 bg-amber-500/5 text-amber-200")}>
                  {a.positive ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                  <span>{a.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confrontos-chave */}
        {analysis.key_duels.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1 flex items-center gap-1"><Info className="h-3 w-3" /> Confrontos-chave</div>
            <div className="space-y-1.5">
              {analysis.key_duels.map((d, i) => {
                const favorLabel = d.favor === "attacker" ? (d.side === "home" ? "VANTAGEM SUA" : "VANTAGEM DELES") : d.favor === "defender" ? (d.side === "home" ? "VANTAGEM DELES" : "VANTAGEM SUA") : "EQUILIBRADO";
                const favorClass = d.favor === "even" ? "text-muted-foreground" : ((d.favor === "attacker" && d.side === "home") || (d.favor === "defender" && d.side === "away")) ? "text-emerald-400" : "text-red-400";
                const roleLabel = d.role_defender === "GOL" ? "Goleiro" : "Zagueiro";
                return (
                  <div key={i} className="rounded-md border p-2 text-[11px]">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0 break-words"><b>{d.attacker.name}</b> · {d.attacker.overall} ({d.attacker.energy}%) · {ELEMENT_LABEL[d.attacker.element]}</span>
                      <span className="hidden text-muted-foreground sm:inline">→</span>
                      <span className="min-w-0 break-words sm:text-right"><b>{d.defender.name}</b> · {d.defender.overall} ({d.defender.energy}%) · {ELEMENT_LABEL[d.defender.element]} <Badge variant="outline" className="ml-1 text-[9px]">{roleLabel}</Badge></span>
                    </div>
                    <div className={"mt-1 text-center font-semibold " + favorClass}>{favorLabel} · finaliza {pct(d.p_attacker)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
