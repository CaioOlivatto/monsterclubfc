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

export function EventsPanel({ events }: Props) {
  const [tab, setTab] = useState<"current" | "important">("current");

  const important = events.filter((e) =>
    ["goal", "yellow_card", "red_card", "injury", "substitution"].includes(e.event_type),
  );

  const list = tab === "current" ? [...events].reverse() : [...important].reverse();

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex border-b">
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
                const icon = e.element ? ELEMENT_ICON[e.element] : "•";
                const goalHighlight = e.event_type === "goal";
                return (
                  <li
                    key={i}
                    className={cn(
                      "flex gap-2 rounded-md border-l-4 py-1.5 pl-2 pr-2 text-sm",
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
                        e.event_type === "yellow_card" && "text-yellow-600 dark:text-yellow-500",
                        e.event_type === "red_card" && "text-destructive font-semibold",
                        e.event_type === "injury" && "text-destructive",
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
