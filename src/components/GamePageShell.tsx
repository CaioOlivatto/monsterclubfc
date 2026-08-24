import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Coins, Gem } from "lucide-react";
import { GameLogo } from "@/components/GameLogo";
import { TeamCrest } from "@/components/TeamCrest";
import { Button } from "@/components/ui/button";

type Props = {
  title: string; subtitle: string; children: ReactNode;
  academyName?: string | null; trainerName?: string | null;
  level?: number | null; xp?: number | null; money?: number | null; gems?: number | null;
  maxWidth?: "3xl" | "4xl" | "5xl";
};

const widths = { "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl" };

export function GamePageShell({ title, subtitle, children, academyName, trainerName, level, xp, money, gems, maxWidth = "3xl" }: Props) {
  const width = widths[maxWidth];
  return (
    <div className="game-page-shell relative min-h-screen overflow-x-hidden bg-slate-950 bg-cover bg-fixed bg-[position:center_62%] text-slate-100 sm:bg-center" style={{ backgroundImage: "url('/assets/monster-stadium.webp')" }}>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-slate-950/55 via-slate-950/78 to-slate-950/94" />
      <header className="relative z-10 border-b border-violet-500/35 bg-slate-950/90 shadow-[0_4px_24px_rgba(76,29,149,0.28)] backdrop-blur-md">
        <div className={`mx-auto flex w-full ${width} items-center gap-2.5 px-3 py-3 sm:px-4`}>
          <GameLogo size="xs" className="hidden shrink-0 sm:block" />
          <TeamCrest teamName={academyName || title} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Academia</p>
            <p className="truncate text-base font-bold text-white sm:text-lg">{academyName || title}</p>
            <p className="truncate text-[11px] text-slate-400">{trainerName || subtitle}{level != null ? ` · Nível ${level}` : ""}</p>
            {xp != null && <div className="mt-1 h-1 w-full max-w-48 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-400" style={{ width: `${Math.max(4, Math.min(100, xp % 100))}%` }} /></div>}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {gems != null && <div className="flex h-9 items-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-950/65 px-2.5 text-xs font-bold text-white sm:px-3 sm:text-sm"><Gem className="h-4 w-4 fill-violet-300/30 text-violet-300" />{gems.toLocaleString("pt-BR")}</div>}
            {money != null && <div className="flex h-9 items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-950/35 px-2.5 text-xs font-bold text-white sm:px-3 sm:text-sm"><Coins className="h-4 w-4 text-amber-300" /><span className="hidden min-[390px]:inline">$</span>{Math.round(money).toLocaleString("pt-BR")}</div>}
          </div>
        </div>
      </header>
      <main className={`relative z-10 mx-auto w-full ${width} space-y-4 px-3 py-4 sm:px-4 sm:py-5`}>
        <section className="flex min-h-20 items-center gap-3 rounded-2xl border border-violet-500/35 bg-slate-950/78 p-3.5 shadow-[0_12px_32px_rgba(2,6,23,0.42)] backdrop-blur-md sm:p-4">
          <Button asChild variant="outline" size="icon" className="shrink-0 border-slate-600 bg-slate-900/80 text-white hover:bg-violet-950 hover:text-white"><Link to="/dashboard"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">Academia</p><h1 className="truncate text-xl font-black text-white sm:text-2xl">{title}</h1><p className="text-xs text-slate-400 sm:text-sm">{subtitle}</p></div>
        </section>
        <div className="game-page-content space-y-4">{children}</div>
      </main>
    </div>
  );
}
