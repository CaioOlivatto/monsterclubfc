import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listMyCreatures } from "@/lib/creatures.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, BatteryCharging, Star, Clock, Hourglass, HeartPulse } from "lucide-react";
import { ageStatus, seasonsRemaining, type AgeStatus } from "@/lib/age";
import { fatigueState, FATIGUE_LABEL, FATIGUE_CLASS, effectiveOverall, energyMultiplier } from "@/lib/fatigue";
import { moraleState, MORALE_EMOJI, MORALE_LABEL, MORALE_CLASS, moraleMultiplier, moraleReason } from "@/lib/morale";
import { StarRating, halfStarsToStars } from "@/components/StarRating";
import { RetirementDialog } from "@/components/RetirementDialog";

export const Route = createFileRoute("/_authenticated/roster")({
  head: () => ({
    meta: [
      { title: "Elenco — Monster Club Manager" },
      { name: "description", content: "Todas as criaturas da sua academia." },
      { property: "og:title", content: "Elenco — Monster Club Manager" },
      { property: "og:description", content: "Todas as criaturas da sua academia." },
    ],
  }),
  component: RosterPage,
});

const ELEMENT_COLORS: Record<string, string> = {
  fogo: "bg-red-500/15 text-red-300 border-red-500/30",
  agua: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  terra: "bg-amber-700/20 text-amber-300 border-amber-700/40",
  ar: "bg-sky-400/15 text-sky-200 border-sky-400/30",
  gelo: "bg-cyan-300/15 text-cyan-200 border-cyan-300/30",
};

const ELEMENT_LABEL: Record<string, string> = {
  fogo: "Fogo",
  agua: "Água",
  terra: "Terra",
  ar: "Ar",
  gelo: "Gelo",
};

const ELEMENTS = ["fogo", "agua", "terra", "ar", "gelo"] as const;
const POSITIONS = ["Goleiro", "Zagueiro", "Meio-campo", "Atacante"] as const;

type SortKey = "position" | "overall" | "name" | "energy" | "market_value" | "age";

const POSITION_ORDER: Record<string, number> = {
  Goleiro: 0,
  Zagueiro: 1,
  "Meio-campo": 2,
  Atacante: 3,
};
const POSITION_LABEL: Record<string, string> = {
  Goleiro: "GOLEIROS",
  Zagueiro: "ZAGUEIROS",
  "Meio-campo": "MEIO-CAMPO",
  Atacante: "ATACANTES",
};
const POSITION_KEYS = ["Goleiro", "Zagueiro", "Meio-campo", "Atacante"] as const;
type AgeFilter = "all" | "veteran" | "last_season";

function RosterPage() {
  const fetchList = useServerFn(listMyCreatures);
  const { data, isLoading } = useQuery({
    queryKey: ["my-creatures"],
    queryFn: () => fetchList(),
  });

  const [q, setQ] = useState("");
  const [elem, setElem] = useState<string | null>(null);
  const [pos, setPos] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("position");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");

  const lastSeasonCount = useMemo(
    () => (data ?? []).filter((c) => ageStatus((c as any).age) === "last_season").length,
    [data],
  );

  const filtered = useMemo(() => {
    let list = (data ?? []).slice();
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(t));
    }
    if (elem) list = list.filter((c) => c.element === elem);
    if (pos) list = list.filter((c) => c.suggested_position === pos);
    if (ageFilter !== "all") {
      list = list.filter((c) => ageStatus((c as any).age) === ageFilter);
    }
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "energy") return (b.energy ?? 0) - (a.energy ?? 0);
      if (sort === "age") return ((b as any).age ?? 0) - ((a as any).age ?? 0);
      if (sort === "market_value")
        return (b.market_value ?? 0) - (a.market_value ?? 0);
      if (sort === "position") {
        const pa = POSITION_ORDER[a.suggested_position ?? ""] ?? 99;
        const pb = POSITION_ORDER[b.suggested_position ?? ""] ?? 99;
        if (pa !== pb) return pa - pb;
        return (b.overall ?? 0) - (a.overall ?? 0);
      }
      return (b.overall ?? 0) - (a.overall ?? 0);
    });
    return list;
  }, [data, q, elem, pos, sort, ageFilter]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
          </Link>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Academia
            </p>
            <h1 className="truncate text-xl font-bold sm:text-2xl">Elenco</h1>
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            {isLoading ? "..." : `${filtered.length} / 26`}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome..."
              className="pl-9"
            />
          </div>
          <select
            value={elem ?? ""}
            onChange={(e) => setElem(e.target.value || null)}
            className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm"
          >
            <option value="">Todos os elementos</option>
            {ELEMENTS.map((el) => (
              <option key={el} value={el}>
                {ELEMENT_LABEL[el]}
              </option>
            ))}
          </select>
          <select
            value={pos ?? ""}
            onChange={(e) => setPos(e.target.value || null)}
            className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm"
          >
            <option value="">Todas as posições</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm"
          >
            <option value="position">Ordenar: Posição (GOL→ATA)</option>
            <option value="overall">Ordenar: Overall</option>
            <option value="name">Ordenar: Nome</option>
            <option value="energy">Ordenar: Energia</option>
            <option value="market_value">Ordenar: Valor</option>
            <option value="age">Ordenar: Idade (+ velhas)</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: "all", label: "Todas" },
              { key: "veteran", label: "Veteranas" },
              { key: "last_season", label: "Última temporada" },
            ] as { key: AgeFilter; label: string }[]
          ).map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={ageFilter === t.key ? "default" : "outline"}
              onClick={() => setAgeFilter(t.key)}
            >
              {t.label}
            </Button>
          ))}
          {lastSeasonCount > 0 && ageFilter !== "last_season" && (
            <button
              type="button"
              onClick={() => setAgeFilter("last_season")}
              className="ml-auto rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-500/20"
            >
              <Hourglass className="mr-1 inline h-3 w-3" />
              {lastSeasonCount} na última temporada — ver
            </button>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma criatura encontrada.
          </p>
        ) : sort === "position" ? (
          <div className="space-y-6">
            {POSITION_KEYS.map((posKey) => {
              const group = filtered.filter((c) => c.suggested_position === posKey);
              if (group.length === 0) return null;
              return (
                <section key={posKey}>
                  <div className="mb-2 flex items-baseline gap-2 border-b border-border/40 pb-1">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      {POSITION_LABEL[posKey]}
                    </h2>
                    <span className="text-xs text-muted-foreground">({group.length})</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {group.map((c) => renderCard(c))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => renderCard(c))}
          </div>
        )}
      </main>
    </div>
  );
}

function renderCard(c: any) {
  const status = ageStatus(c.age);
  const seasons = seasonsRemaining(c.age);
  const cardBorder =
    status === "last_season"
      ? "border-orange-500/60 bg-orange-500/5 hover:border-orange-400/80"
      : status === "veteran"
      ? "border-amber-500/40 hover:border-amber-400/60"
      : "hover:border-primary/40 hover:bg-card/70";
  return (
    <Link key={c.id} to="/creatures/$id" params={{ id: c.id }} className="block">
      <Card className={"transition-colors " + cardBorder}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {c.suggested_position} · {c.age ?? 18} anos
              </p>
            </div>
            <Badge variant="outline" className={ELEMENT_COLORS[c.element] ?? ""}>
              {ELEMENT_LABEL[c.element] ?? c.element}
            </Badge>
          </div>

          {status === "veteran" && (
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
              <Clock className="h-3 w-3" />
              <span className="font-medium">Veterano</span>
              <span className="text-amber-300/80">· {seasons} temporadas restantes</span>
            </div>
          )}
          {status === "last_season" && (
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-orange-400 bg-orange-500 px-2 py-1 text-[11px] font-bold text-white shadow-sm">
              <Hourglass className="h-3 w-3" />
              <span>Última temporada</span>
            </div>
          )}

          {(c.injury_matches_remaining ?? 0) > 0 && (
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-red-500/60 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-300">
              <HeartPulse className="h-3 w-3" />
              <span>Lesão {c.injury_severity === "grave" ? "GRAVE" : c.injury_severity === "moderada" ? "moderada" : "leve"}</span>
              <span className="opacity-80">· {c.injury_matches_remaining} {c.injury_matches_remaining === 1 ? "partida" : "partidas"}</span>
            </div>
          )}

          {(() => {
            const fs = fatigueState(c.energy ?? 100);
            const eMul = energyMultiplier(c.energy ?? 100);
            const mMul = moraleMultiplier(c.morale);
            const eff = effectiveOverall(c.overall ?? 0, c.energy ?? 100, c.morale);
            const ePen = Math.round((1 - eMul) * 100);
            const mPen = Math.round((mMul - 1) * 100);
            const ms = moraleState(c.morale);
            return (
              <>
                <div className={"mt-2 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] " + FATIGUE_CLASS[fs]}>
                  <BatteryCharging className="h-3 w-3" />
                  <span className="font-medium">{FATIGUE_LABEL[fs]}</span>
                  <span className="opacity-80">· {c.energy}%</span>
                  {ePen > 0 && (
                    <span className="ml-auto font-semibold">Ovr {c.overall}→{eff} (fadiga -{ePen}%{mPen !== 0 ? `, moral ${mPen > 0 ? "+" : ""}${mPen}%` : ""})</span>
                  )}
                </div>
                <div
                  className={"mt-1 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] " + MORALE_CLASS[ms]}
                  title={moraleReason(c)}
                >
                  <span className="text-sm leading-none">{MORALE_EMOJI[ms]}</span>
                  <span className="font-medium">Moral: {MORALE_LABEL[ms]}</span>
                  <span className="opacity-80">· {c.morale ?? 50}</span>
                  {mPen !== 0 && ePen === 0 && (
                    <span className="ml-auto font-semibold">Ovr {c.overall}→{eff} ({mPen > 0 ? "+" : ""}{mPen}%)</span>
                  )}
                </div>
              </>
            );
          })()}

          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold leading-none">{c.overall}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">overall</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div className="flex items-center justify-end">
                <StarRating value={halfStarsToStars(c.half_stars_earned ?? 0)} size={0.8} />
              </div>
              <p className="mt-1">$ {c.market_value.toLocaleString("pt-BR")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
