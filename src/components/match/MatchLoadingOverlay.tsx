import { useEffect, useState } from "react";
import { Shield, Loader2 } from "lucide-react";

const MESSAGES = [
  "Times entrando no túnel…",
  "Aquecendo…",
  "Conferindo escalação…",
  "Juiz revisando a bola…",
  "Bola rolando em instantes…",
];

type Props = {
  homeName?: string | null;
  awayName?: string | null;
  competitionLabel?: string | null;
};

export function MatchLoadingOverlay({ homeName, awayName, competitionLabel }: Props) {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-background via-background to-primary/10 px-6 animate-in fade-in">
      {competitionLabel ? (
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {competitionLabel}
        </span>
      ) : null}

      <div className="flex w-full max-w-md items-center justify-between gap-4">
        <TeamCrest name={homeName ?? "Casa"} side="left" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl font-black tracking-wider text-muted-foreground">VS</span>
          <div className="h-1 w-8 rounded-full bg-primary/40" />
        </div>
        <TeamCrest name={awayName ?? "Visitante"} side="right" />
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span key={msgIdx} className="animate-in fade-in slide-in-from-bottom-1">
            {MESSAGES[msgIdx]}
          </span>
        </div>
        <div className="h-1 w-56 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-[loading_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      </div>

      <style>{`
        @keyframes loading {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(150%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}

function TeamCrest({ name, side }: { name: string; side: "left" | "right" }) {
  return (
    <div className={`flex flex-1 flex-col items-center gap-2 ${side === "left" ? "animate-in slide-in-from-left-8" : "animate-in slide-in-from-right-8"}`}>
      <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 shadow-lg ring-1 ring-primary/20">
        <Shield className="h-10 w-10 text-primary" strokeWidth={1.5} />
      </div>
      <span className="max-w-[8rem] truncate text-center text-sm font-semibold">{name}</span>
    </div>
  );
}
