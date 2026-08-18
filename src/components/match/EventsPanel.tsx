import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface RevealedEvent {
  minute: number;
  event_type: string;
  description: string;
  narration?: string;
  element?: string | null;
  is_goal?: boolean;
  team_color?: string;
  raw_team_id?: string | null;
  injury_severity?: "leve" | "moderada" | "grave" | null;
  injury_matches?: number | null;
}

const ELEMENT_ICON: Record<string, string> = {
  fogo: "🔥",
  agua: "🌊",
  terra: "⛰️",
  ar: "🌪️",
  gelo: "❄️",
};

const ELEMENT_COLOR: Record<string, string> = {
  fogo: "hsl(12 90% 55%)",
  agua: "hsl(210 85% 55%)",
  terra: "hsl(30 55% 40%)",
  ar: "hsl(180 60% 55%)",
  gelo: "hsl(200 90% 70%)",
};

interface Props {
  events: RevealedEvent[];
}

// Remove entradas idênticas (mesmo minuto/tipo/texto) que possam ter sido
// reveladas duas vezes — típico dos eventos do minuto 90 (fim de jogo/cartão).
function dedupe(events: RevealedEvent[]): RevealedEvent[] {
  const seen = new Set<string>();
  const out: RevealedEvent[] = [];
  for (const e of events) {
    const key = `${e.minute}|${e.event_type}|${e.description ?? ""}|${e.narration ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function EventsPanel({ events }: Props) {
  const [tab, setTab] = useState<"current" | "important">("current");

  const unique = dedupe(events);
  const important = unique.filter((e) =>
    ["goal", "yellow_card", "red_card", "injury", "substitution"].includes(e.event_type),
  );

  const list = tab === "current" ? [...unique].reverse() : [...important].reverse();

  return (
    <Card className="border-violet-500/40 bg-slate-950/90 text-slate-100 shadow-[0_12px_30px_rgba(0,0,0,.3)] [&_.text-muted-foreground]:text-slate-400">
      <CardContent className="p-0">
        <div className="flex border-b border-slate-800 bg-slate-900/55">
          <button
            type="button"
            onClick={() => setTab("current")}
            className={cn(
              "flex-1 py-2 text-sm font-medium transition-colors",
              tab === "current" ? "border-b-2 border-primary text-primary" : "text-muted-foreground",
            )}
          >
            Lances atuais
          </button>
          <button
            type="button"
            onClick={() => setTab("important")}
            className={cn(
              "flex-1 py-2 text-sm font-medium transition-colors",
              tab === "important"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground",
            )}
          >
            Lances importantes
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-3">
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {tab === "current" ? "Aguardando o apito inicial…" : "Nenhum momento-chave ainda."}
            </p>
          ) : (
            <ul className="space-y-2">
              {list.map((e, i) => {
                const color = e.element ? ELEMENT_COLOR[e.element] : "hsl(var(--muted-foreground))";
                const isSevereInjury = e.event_type === "injury" && (e.injury_severity === "grave" || (e.injury_matches ?? 0) >= 4);
                const eventIcon = e.event_type === "red_card"
                  ? "🟥"
                  : e.event_type === "yellow_card"
                    ? "🟨"
                    : e.event_type === "injury"
                      ? (isSevereInjury ? "🚑" : "🏥")
                      : e.event_type === "substitution"
                        ? "🔄"
                        : null;
                const icon = eventIcon ?? (e.element ? ELEMENT_ICON[e.element] : "•");
                const goalHighlight = e.event_type === "goal";
                return (
                  <li
                    key={i}
                    className={cn(
                      "flex gap-2 rounded-md border border-slate-800 border-l-4 bg-slate-900/55 py-2 pl-2 pr-2 text-sm text-slate-200",
                      goalHighlight && "bg-yellow-500/10 dark:bg-yellow-500/15",
                    )}
                    style={{ borderLeftColor: color }}
                  >
                    <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                      {e.minute}'
                    </span>
                    <span className="w-5 shrink-0 text-center text-sm">{icon}</span>
                    <span
                      className={cn(
                        "flex-1",
                        goalHighlight && "font-semibold",
                        e.event_type === "yellow_card" && "font-semibold text-yellow-300",
                        e.event_type === "red_card" && "font-bold text-red-400",
                        e.event_type === "injury" && (isSevereInjury ? "font-bold text-red-300" : "font-semibold text-rose-200"),
                        e.event_type === "substitution" && "text-cyan-200",
                      )}
                    >
                      {e.narration ?? e.description}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
