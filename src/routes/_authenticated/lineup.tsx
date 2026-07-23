import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getMyLineup, saveLineup } from "@/lib/lineup.functions";
import { getLineupPrognostic } from "@/lib/odds.functions";
import { playNextLeagueMatch } from "@/lib/league.functions";
import { playNextCupMatch } from "@/lib/cup.functions";
import { simulateWorldCupRound, simulateWorldLeagueRound } from "@/lib/world-competitions.functions";
import { getUpcomingOfficialMatch, type OfficialCompetition, type OfficialMatchContext } from "@/lib/official-match.functions";
import { PrognosticCard } from "@/components/PrognosticCard";
import { buildSlots, FORMATIONS, MAX_BENCH, type Formation, type SlotRole } from "@/lib/lineup.server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Save, Shield, Swords, Scale, Wand2, AlertTriangle, HeartPulse, BedDouble, Play } from "lucide-react";
import { fatigueState, FATIGUE_LABEL, FATIGUE_CLASS, effectiveOverall, energyMultiplier } from "@/lib/fatigue";
import { moraleState, MORALE_EMOJI, MORALE_LABEL, moraleMultiplier } from "@/lib/morale";
import { StarRating, overallToStars } from "@/components/StarRating";


const OFFICIAL_COMPETITIONS: OfficialCompetition[] = ["league", "cup", "world_league", "world_cup"];

function isOfficialCompetition(value: unknown): value is OfficialCompetition {
  return typeof value === "string" && OFFICIAL_COMPETITIONS.includes(value as OfficialCompetition);
}

export const Route = createFileRoute("/_authenticated/lineup")({
  validateSearch: (search) => ({
    competition: isOfficialCompetition(search.competition) ? search.competition : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Escalação — Monster Club Manager" },
      {
        name: "description",
        content: "Monte a formação e estratégia do seu time de criaturas.",
      },
      { property: "og:title", content: "Escalação — Monster Club Manager" },
      {
        property: "og:description",
        content: "Escolha formação, titulares e reservas.",
      },
    ],
  }),
  component: LineupPage,
});

const ELEMENT_LABEL: Record<string, string> = {
  fogo: "Fogo",
  agua: "Água",
  terra: "Terra",
  ar: "Ar",
  gelo: "Gelo",
};

const ROLE_HINT: Record<SlotRole, string[]> = {
  GOL: ["Goleiro"],
  DEF: ["Zagueiro"],
  MEI: ["Meio-campo"],
  ATA: ["Atacante"],
};

interface StarterSlot {
  slot: number;
  role: SlotRole;
  creature_id: string | null;
}

function LineupPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchLineup = useServerFn(getMyLineup);
  const save = useServerFn(saveLineup);
  const fetchProg = useServerFn(getLineupPrognostic);
  const fetchUpcoming = useServerFn(getUpcomingOfficialMatch);
  const playLeague = useServerFn(playNextLeagueMatch);
  const playCup = useServerFn(playNextCupMatch);
  const playWorldLeague = useServerFn(simulateWorldLeagueRound);
  const playWorldCup = useServerFn(simulateWorldCupRound);

  const { data, isLoading } = useQuery({
    queryKey: ["lineup"],
    queryFn: () => fetchLineup(),
  });
  const { data: upcomingMatch } = useQuery<OfficialMatchContext | null>({
    queryKey: ["upcoming-official-match", search.competition ?? "auto"],
    queryFn: () => fetchUpcoming({ data: search.competition ? { competition: search.competition } : {} }),
  });

  const [formation, setFormation] = useState<Formation>("4-4-2");
  const [strategy, setStrategy] = useState<"ofensiva" | "equilibrada" | "defensiva">("equilibrada");
  const [starters, setStarters] = useState<StarterSlot[]>([]);
  const [bench, setBench] = useState<string[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);

  // Draft enviado ao servidor para recalcular odds ao vivo (sem precisar salvar).
  const draft = useMemo(() => ({
    formation, strategy, starters, bench,
  }), [formation, strategy, starters, bench]);

  // Debounce: só refaz o prognóstico 600ms depois da última mudança,
  // evitando disparar 400 simulações a cada clique/keystroke.
  const [debouncedDraft, setDebouncedDraft] = useState(draft);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedDraft(draft), 600);
    return () => window.clearTimeout(t);
  }, [draft]);

  // Chave estável: string do draft evita mismatch de referência causando refetch.
  const draftKey = useMemo(() => JSON.stringify(debouncedDraft), [debouncedDraft]);

  const prog = useQuery({
    queryKey: ["prognostic", draftKey],
    queryFn: () => fetchProg({ data: { draft: debouncedDraft } }),
    retry: false,
    // Desabilita durante a confirmação para não competir com a criação da partida.
    enabled:
      !!data &&
      starters.filter((s) => s.creature_id).length === 11 &&
      !isConfirming,
    staleTime: 60_000,
  });

  const slots = useMemo(() => buildSlots(formation), [formation]);


  // Sincroniza estado quando dados carregam
  useEffect(() => {
    if (!data) return;
    const savedFormation = (data.lineup.formation as Formation) ?? "4-4-2";
    setFormation(savedFormation);
    setStrategy((data.lineup.strategy as any) ?? "equilibrada");
    const savedStarters = Array.isArray(data.lineup.starters)
      ? (data.lineup.starters as unknown as StarterSlot[])
      : [];
    const newSlots = buildSlots(savedFormation);
    setStarters(
      newSlots.map((s) => {
        const found = savedStarters.find((x) => x.slot === s.index);
        return { slot: s.index, role: s.role, creature_id: found?.creature_id ?? null };
      }),
    );
    setBench(Array.isArray(data.lineup.bench) ? (data.lineup.bench as unknown as string[]) : []);
  }, [data]);

  // Se o usuário mudar a formação depois, refaz os slots preservando IDs por índice quando possível
  useEffect(() => {
    setStarters((prev) => {
      const map = new Map(prev.map((p) => [p.slot, p.creature_id]));
      return slots.map((s) => ({ slot: s.index, role: s.role, creature_id: map.get(s.index) ?? null }));
    });
  }, [slots]);

  const allCreatures = data?.creatures ?? [];
  const creatures = allCreatures.filter((c: any) => (c.injury_matches_remaining ?? 0) === 0);
  const injuredList = allCreatures.filter((c: any) => (c.injury_matches_remaining ?? 0) > 0);
  const usedIds = new Set<string>([
    ...starters.map((s) => s.creature_id).filter(Boolean) as string[],
    ...bench,
  ]);

  const naturalRoleOf = (pos: string | null | undefined): SlotRole => {
    if (pos === "Goleiro") return "GOL";
    if (pos === "Zagueiro") return "DEF";
    if (pos === "Atacante") return "ATA";
    return "MEI";
  };
  const ROLE_LABEL: Record<SlotRole, string> = { GOL: "GOL", DEF: "DEF", MEI: "MEI", ATA: "ATA" };

  // Onde cada criatura já está escalada (para badge "Já escalado em X").
  const usedLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const st of starters) {
      if (!st.creature_id) continue;
      const slotDef = slots.find((sl) => sl.index === st.slot);
      m.set(st.creature_id, slotDef?.label ?? `Slot ${st.slot}`);
    }
    for (const id of bench) m.set(id, "Reservas");
    return m;
  }, [starters, bench, slots]);

  const sortByEff = (a: any, b: any) =>
    effectiveOverall(b.overall ?? 0, b.energy ?? 100, b.morale) -
    effectiveOverall(a.overall ?? 0, a.energy ?? 100, a.morale);

  // Mostra TODAS as criaturas (incluindo lesionadas e já escaladas em outros slots).
  // Estado visual/bloqueio de seleção é aplicado no render item.
  const availableFor = (_currentId: string | null) => allCreatures;


  const setSlotCreature = (slotIdx: number, creatureId: string | null) => {
    if (!creatureId) {
      setStarters((prev) =>
        prev.map((s) => (s.slot === slotIdx ? { ...s, creature_id: null } : s)),
      );
      return;
    }
    // Swap semântico: preserva o total de 11 titulares ao trocar por outro titular.
    let displaced: string | null = null;
    let cameFromStarter = false;
    setStarters((prev) => {
      const target = prev.find((s) => s.slot === slotIdx);
      displaced = target?.creature_id ?? null;
      const source = prev.find((s) => s.creature_id === creatureId);
      cameFromStarter = !!source;
      const sourceSlot = source?.slot ?? null;
      return prev.map((s) => {
        if (s.slot === slotIdx) return { ...s, creature_id: creatureId };
        if (sourceSlot != null && s.slot === sourceSlot) {
          // A criatura deslocada assume o slot de origem (swap real entre titulares).
          return { ...s, creature_id: displaced };
        }
        return s;
      });
    });
    setBench((b) => {
      const cameFromBench = b.includes(creatureId);
      let next = b.filter((x) => x !== creatureId);
      // Veio do banco e havia titular no slot alvo → deslocado vai para o banco.
      if (cameFromBench && !cameFromStarter && displaced && !next.includes(displaced) && next.length < MAX_BENCH) {
        next = [...next, displaced];
      }
      return next;
    });
  };

  const addToBench = (id: string) => {
    if (bench.length >= MAX_BENCH) return;
    // Se estava em algum slot titular, libera esse slot.
    setStarters((prev) => prev.map((s) => (s.creature_id === id ? { ...s, creature_id: null } : s)));
    setBench((b) => (b.includes(id) ? b : [...b, id]));
  };
  const removeFromBench = (id: string) => setBench((b) => b.filter((x) => x !== id));

  // Sempre ordena por OVERALL EFETIVO (overall × multiplicador de fadiga)
  // e por energia como desempate. `excludeIds` permite reservar criaturas.
  const buildBestXI = (excludeIds: Set<string> = new Set()): { starters: StarterSlot[]; bench: string[] } => {
    const pool = creatures
      .filter((c: any) => !excludeIds.has(c.id))
      .sort((a: any, b: any) => {
        const ea = a.energy ?? 100, eb = b.energy ?? 100;
        return (
          effectiveOverall(b.overall, eb, b.morale) - effectiveOverall(a.overall, ea, a.morale) ||
          eb - ea
        );
      });

    const used = new Set<string>();
    const newStarters: StarterSlot[] = slots.map((s) => ({ slot: s.index, role: s.role, creature_id: null }));

    for (const s of newStarters) {
      const hint = ROLE_HINT[s.role];
      const pick = pool.find((c) => !used.has(c.id) && hint.includes(c.suggested_position ?? ""));
      if (pick) { s.creature_id = pick.id; used.add(pick.id); }
    }
    for (const s of newStarters) {
      if (s.creature_id) continue;
      const pick = pool.find((c) => !used.has(c.id));
      if (pick) { s.creature_id = pick.id; used.add(pick.id); }
    }
    const newBench: string[] = [];
    for (const c of pool) {
      if (newBench.length >= MAX_BENCH) break;
      if (!used.has(c.id)) { newBench.push(c.id); used.add(c.id); }
    }
    return { starters: newStarters, bench: newBench };
  };

  const autoFill = () => {
    const { starters: st, bench: bn } = buildBestXI();
    setStarters(st);
    setBench(bn);
    toast.success("Escalação automática aplicada — lembre de salvar!");
  };

  // "Poupar titulares": escala o melhor XI EXCLUINDO as 5 criaturas de maior overall efetivo.
  const topFiveIds = useMemo(() => {
    return [...creatures]
      .sort((a: any, b: any) => effectiveOverall(b.overall, b.energy ?? 100, b.morale) - effectiveOverall(a.overall, a.energy ?? 100, a.morale))
      .slice(0, 5)
      .map((c: any) => c.id);
  }, [creatures]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    starters: StarterSlot[];
    bench: string[];
    currentWin: number | null;
    pouparWin: number | null;
    savedNames: string[];
  } | null>(null);
  const [poupPending, setPoupPending] = useState(false);

  const openPoupar = async () => {
    if (creatures.length < 16) {
      toast.error("Você precisa de pelo menos 16 criaturas saudáveis para poupar titulares.");
      return;
    }
    const exclude = new Set(topFiveIds);
    const built = buildBestXI(exclude);
    const filled = built.starters.filter((s) => s.creature_id).length;
    if (filled < 11) {
      toast.error("Sem criaturas suficientes para escalar 11 titulares poupando o topo do elenco.");
      return;
    }
    setPoupPending(true);
    try {
      const pouparDraft = { formation, strategy, starters: built.starters, bench: built.bench };
      const [pouparProg] = await Promise.all([
        fetchProg({ data: { draft: pouparDraft } }).catch(() => null),
      ]);
      const currentWin = prog.data?.analysis.odds.home_win ?? null;
      const pouparWin = pouparProg?.analysis.odds.home_win ?? null;
      const savedNames = topFiveIds
        .map((id) => creatures.find((c: any) => c.id === id)?.name)
        .filter(Boolean) as string[];
      setConfirmData({ starters: built.starters, bench: built.bench, currentWin, pouparWin, savedNames });
      setConfirmOpen(true);
    } finally {
      setPoupPending(false);
    }
  };

  const confirmPoupar = () => {
    if (!confirmData) return;
    setStarters(confirmData.starters);
    setBench(confirmData.bench);
    setConfirmOpen(false);
    toast.success("Titulares poupados — lembre de salvar!");
  };


  const mut = useMutation({
    mutationFn: async () => {
      await save({
        data: { formation, strategy, starters, bench },
      });
    },
    onSuccess: () => {
      toast.success("Escalação salva!");
      qc.invalidateQueries({ queryKey: ["lineup"] });
      qc.invalidateQueries({ queryKey: ["prognostic"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar."),
  });

  const confirmPlayMut = useMutation({
    mutationFn: async () => {
      setIsConfirming(true);
      // Cancela qualquer prognóstico em voo para liberar o worker.
      qc.cancelQueries({ queryKey: ["prognostic"] });

      // Timeout de segurança: se o servidor não responder em 60s, aborta com erro amigável.
      const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          const t = setTimeout(
            () => reject(new Error(`Tempo esgotado ao ${label}. Tente novamente.`)),
            ms,
          );
          p.then((v) => { clearTimeout(t); resolve(v); })
           .catch((e) => { clearTimeout(t); reject(e); });
        });

      await withTimeout(
        save({ data: { formation, strategy, starters, bench } }),
        20_000,
        "salvar a escalação",
      );
      const match = upcomingMatch ?? await withTimeout(
        fetchUpcoming({ data: search.competition ? { competition: search.competition } : {} }),
        15_000,
        "buscar a próxima partida",
      );
      if (!match) throw new Error("Nenhuma partida oficial pronta para jogar.");

      if (match.competition === "league") {
        const res = await withTimeout(playLeague(), 60_000, "iniciar a partida");
        return res.match_id as string;
      }
      if (match.competition === "cup") {
        const res = await withTimeout(playCup(), 60_000, "iniciar a partida");
        return res.match_id as string;
      }
      if (match.competition === "world_league") {
        const res = await withTimeout(playWorldLeague(), 60_000, "iniciar a partida");
        if (!res.playerMatchId) throw new Error("A rodada da Liga Mundial não tem partida do seu time.");
        return res.playerMatchId as string;
      }
      const res = await withTimeout(playWorldCup(), 60_000, "iniciar a partida");
      if (!res.playerMatchId) throw new Error("A rodada da Copa Mundial não tem partida do seu time.");
      return res.playerMatchId as string;
    },
    onSuccess: (matchId) => {
      qc.invalidateQueries({ queryKey: ["lineup"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      navigate({ to: "/match/$id", params: { id: matchId } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível iniciar a partida."),
    onSettled: () => setIsConfirming(false),
  });


  const filledStarters = starters.filter((s) => s.creature_id).length;

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/dashboard" })}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="truncate text-base font-semibold sm:text-lg">Escalação</h1>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <Button
              onClick={autoFill}
              disabled={creatures.length === 0}
              size="sm"
              variant="secondary"
            >
              <Wand2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Auto definir</span>
              <span className="sr-only sm:hidden">Auto definir</span>
            </Button>
            <Button
              onClick={openPoupar}
              disabled={creatures.length < 16 || poupPending}
              size="sm"
              variant="outline"
              title="Escala os reservas e mantém seus 5 melhores descansados para a próxima partida"
            >
              <BedDouble className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{poupPending ? "Calculando…" : "Poupar titulares"}</span>
              <span className="sr-only sm:hidden">Poupar titulares</span>
            </Button>


            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || filledStarters !== 11}
              size="sm"
            >
              <Save className="h-4 w-4 sm:mr-2" />
              <span>Salvar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-3 py-4 sm:px-4">

        <MatchContextCard
          match={upcomingMatch ?? null}
          filledStarters={filledStarters}
          pending={confirmPlayMut.isPending}
          onConfirm={() => confirmPlayMut.mutate()}
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tática</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Formação</label>
              <Select value={formation} onValueChange={(v) => setFormation(v as Formation)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATIONS.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Estratégia</label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ofensiva">
                    <span className="flex items-center gap-2"><Swords className="h-4 w-4" />Ofensiva</span>
                  </SelectItem>
                  <SelectItem value="equilibrada">
                    <span className="flex items-center gap-2"><Scale className="h-4 w-4" />Equilibrada</span>
                  </SelectItem>
                  <SelectItem value="defensiva">
                    <span className="flex items-center gap-2"><Shield className="h-4 w-4" />Defensiva</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              Titulares preenchidos: <b>{filledStarters}/11</b> · Reservas: <b>{bench.length}/{MAX_BENCH}</b>
            </div>
            {injuredList.length > 0 && (
              <div className="sm:col-span-2 flex items-start gap-2 rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                <HeartPulse className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {injuredList.length} {injuredList.length === 1 ? "criatura lesionada" : "criaturas lesionadas"} não estão disponíveis: {injuredList.map((c: any) => c.name).join(", ")}.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <PrognosticCard state={prog} />



        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Titulares</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {slots.map((s) => {
              const current = starters.find((x) => x.slot === s.index)?.creature_id ?? null;
              const options = availableFor(current);
              const currentCreature = current ? creatures.find((x) => x.id === current) : null;
              const currFs = currentCreature ? fatigueState(currentCreature.energy ?? 100) : null;
              const currMult = currentCreature ? energyMultiplier(currentCreature.energy ?? 100) : 1;
              const currEff = currentCreature ? effectiveOverall(currentCreature.overall ?? 0, currentCreature.energy ?? 100, currentCreature.morale) : 0;
              const warn = currFs === "muito_cansado" || currFs === "exausto";

              // Só criaturas da posição natural correspondente ao slot.
              const inPos = options
                .filter((c: any) => naturalRoleOf(c.suggested_position) === s.role)
                .sort(sortByEff);

              const renderItem = (c: any) => {
                const eff = effectiveOverall(c.overall ?? 0, c.energy ?? 100, c.morale);
                const ms = moraleState(c.morale);
                return (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">
                        · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall}{eff !== c.overall ? `→${eff}` : ""}
                      </span>
                      <StarRating value={overallToStars(c.overall ?? 0)} size={0.75} />
                      <span title={`Moral: ${MORALE_LABEL[ms]}`}>{MORALE_EMOJI[ms]}</span>
                      <span className="text-muted-foreground">· {c.energy ?? 100}%</span>
                    </span>
                  </SelectItem>
                );
              };

              return (
                <div key={s.index} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="w-16 shrink-0 justify-center">
                      {s.label}
                    </Badge>
                    <Select
                      value={current ?? "__none"}
                      onValueChange={(v) => setSlotCreature(s.index, v === "__none" ? null : v)}
                    >
                      <SelectTrigger className="min-w-0 flex-1">
                        <SelectValue placeholder="Vazio">
                          {currentCreature ? (
                            <span className="flex min-w-0 items-center gap-1.5 truncate text-xs sm:text-sm">
                              <span className="truncate font-medium">{currentCreature.name}</span>
                              <span className="hidden truncate text-muted-foreground sm:inline">
                                · {ELEMENT_LABEL[currentCreature.element] ?? currentCreature.element}
                              </span>
                              <span className="shrink-0 text-muted-foreground">· OVR {currentCreature.overall}{currEff !== currentCreature.overall ? `→${currEff}` : ""}</span>
                              <span className="hidden sm:inline"><StarRating value={overallToStars(currentCreature.overall ?? 0)} size={0.75} /></span>
                              <span className="shrink-0">{MORALE_EMOJI[moraleState(currentCreature.morale)]}</span>
                              <span className="shrink-0 text-muted-foreground">· {currentCreature.energy ?? 100}%</span>
                            </span>
                          ) : null}
                        </SelectValue>
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value="__none">— Vazio —</SelectItem>
                        {inPos.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            Nenhuma criatura de {s.role} disponível.
                          </div>
                        ) : (
                          inPos.map((c) => renderItem(c))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {currentCreature && currFs && currFs !== "pleno" && (
                    <div className={"ml-[4.5rem] inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] " + FATIGUE_CLASS[currFs] + (warn ? " font-semibold" : "")}>
                      {warn && <AlertTriangle className="h-3 w-3" />}
                      <span>{FATIGUE_LABEL[currFs]} · {currentCreature.energy}%</span>
                      <span className="opacity-80">Ovr {currentCreature.overall}→{currEff} (fadiga -{Math.round((1 - currMult) * 100)}%{(() => {
                        const mm = moraleMultiplier(currentCreature.morale);
                        const mp = Math.round((mm - 1) * 100);
                        return mp !== 0 ? `, moral ${mp > 0 ? "+" : ""}${mp}%` : "";
                      })()})</span>
                    </div>
                  )}
                </div>
              );
            })}

          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reservas ({bench.length}/{MAX_BENCH})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bench.length > 0 && (
              <div className="space-y-2">
                {bench.map((id) => {
                  const c = creatures.find((x) => x.id === id);
                  if (!c) return null;
                  const fs = fatigueState(c.energy ?? 100);
                  const eff = effectiveOverall(c.overall ?? 0, c.energy ?? 100, c.morale);
                  const ms = moraleState(c.morale);
                  const role = ROLE_LABEL[naturalRoleOf(c.suggested_position)];
                  return (
                    <div key={id} className="flex items-center justify-between rounded-md border p-2">
                      <div className="text-sm min-w-0 flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="w-12 shrink-0 justify-center text-[10px]">{role}</Badge>
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">
                          · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall}{eff !== c.overall ? `→${eff}` : ""}
                        </span>
                        <StarRating value={overallToStars(c.overall ?? 0)} size={0.8} />
                        <span title={`Moral: ${MORALE_LABEL[ms]}`}>{MORALE_EMOJI[ms]}</span>
                        <span className={"inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] " + FATIGUE_CLASS[fs]}>
                          {c.energy}%
                        </span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeFromBench(id)}>
                        Remover
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {bench.length < MAX_BENCH && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Adicionar reserva</label>
                <Select value="" onValueChange={(v) => v && addToBench(v)}>
                  <SelectTrigger><SelectValue placeholder="Escolher criatura…" /></SelectTrigger>
                  <SelectContent>
                    {creatures
                      .filter((c) => !bench.includes(c.id))
                      .sort(sortByEff)
                      .map((c) => {
                        const eff = effectiveOverall(c.overall ?? 0, c.energy ?? 100, c.morale);
                        const ms = moraleState(c.morale);
                        return (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="inline-flex items-center gap-1.5">
                              <Badge variant="outline" className="w-12 shrink-0 justify-center text-[10px]">
                                {ROLE_LABEL[naturalRoleOf(c.suggested_position)]}
                              </Badge>
                              <span className="font-medium">{c.name}</span>
                              <span className="text-muted-foreground">
                                · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall}{eff !== c.overall ? `→${eff}` : ""}
                              </span>
                              <StarRating value={overallToStars(c.overall ?? 0)} size={0.75} />
                              <span>{MORALE_EMOJI[ms]}</span>
                              <span className="text-muted-foreground">· {c.energy ?? 100}%</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                  </SelectContent>

                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          <Link to="/roster" className="underline">Ver elenco completo</Link>
        </p>
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Poupar titulares?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {confirmData?.currentWin != null && confirmData?.pouparWin != null ? (
                  <p>
                    Poupar titulares vai alterar sua chance de vitória de{" "}
                    <b className="text-foreground">{Math.round(confirmData.currentWin * 100)}%</b> para{" "}
                    <b className="text-foreground">{Math.round(confirmData.pouparWin * 100)}%</b>.
                  </p>
                ) : (
                  <p>Calculando o impacto…</p>
                )}
                <p>
                  Em compensação, {confirmData?.savedNames.length ?? 5} titulares chegam descansados na próxima rodada
                  {confirmData?.savedNames.length
                    ? `: ${confirmData.savedNames.join(", ")}.`
                    : "."}
                </p>
                <p className="text-xs text-muted-foreground">
                  Útil quando o adversário é fraco ou antes de um jogo decisivo.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPoupar}>Poupar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

}

function MatchContextCard({
  match,
  filledStarters,
  pending,
  onConfirm,
}: {
  match: OfficialMatchContext | null;
  filledStarters: number;
  pending: boolean;
  onConfirm: () => void;
}) {
  if (!match) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-2 p-4 sm:p-5">
          <Badge variant="outline" className="w-fit">Sem partida oficial</Badge>
          <div>
            <p className="font-semibold">Nenhuma partida oficial pronta agora</p>
            <p className="text-sm text-muted-foreground">Use esta tela para preparar sua escalação padrão.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <Badge className="w-fit">{match.competitionLabel}</Badge>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Rodada {match.round}{match.phaseLabel ? ` · ${match.phaseLabel}` : ""}
              </p>
              <h2 className="mt-1 text-lg font-bold leading-tight sm:text-xl">
                {match.playerTeam} <span className="text-muted-foreground">vs</span> {match.opponent}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {match.isHome ? "Em casa" : "Fora"} · adversário: {match.opponent}
              </p>
            </div>
          </div>
          <Button
            className="w-full sm:w-auto"
            size="lg"
            onClick={onConfirm}
            disabled={pending || filledStarters !== 11}
          >
            <Play className="mr-2 h-4 w-4" />
            {pending ? "Iniciando..." : "Confirmar e jogar"}
          </Button>
        </div>
        {filledStarters !== 11 && (
          <p className="text-xs text-muted-foreground">Preencha 11 titulares para liberar a confirmação.</p>
        )}
      </CardContent>
    </Card>
  );
}
