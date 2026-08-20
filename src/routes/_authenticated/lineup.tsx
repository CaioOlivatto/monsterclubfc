import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getMyLineupWithSession, saveClubLineupPreset, saveLineup } from "@/lib/lineup.functions";
import { getDashboardWithSession } from "@/lib/creatures.functions";
import { supabase } from "@/integrations/supabase/client";
import { getLineupPrognostic } from "@/lib/odds.functions";
import { playNextLeagueMatch, advanceLeagueRoundBackground } from "@/lib/league.functions";
import { playNextCupMatch, advanceCupRoundBackground } from "@/lib/cup.functions";
import { simulateWorldCupRound, simulateWorldLeagueRound, advanceWorldLeagueRoundBackground, advanceWorldCupRoundBackground } from "@/lib/world-competitions.functions";
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
import { MatchLoadingOverlay } from "@/components/match/MatchLoadingOverlay";
import { GameLogo } from "@/components/GameLogo";
import { TeamCrest } from "@/components/TeamCrest";


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

const STRATEGY_EFFECTS = {
  ofensiva: {
    title: "Ataque total",
    summary: "+8 no ataque, -8 na defesa e cerca de 18% mais lances.",
    energy: "Gasta +2 de energia por jogador que entrar em campo.",
    injury: "Risco de lesão 15% maior.",
    className: "border-orange-500/40 bg-orange-500/10 text-orange-100",
  },
  equilibrada: {
    title: "Jogo equilibrado",
    summary: "Sem bônus ou penalidade: ataque, defesa e ritmo balanceados.",
    energy: "Desgaste normal de energia.",
    injury: "Risco normal de lesão.",
    className: "border-blue-500/35 bg-blue-500/10 text-blue-100",
  },
  defensiva: {
    title: "Proteção e controle",
    summary: "+8 na defesa, -8 no ataque e cerca de 22% menos lances.",
    energy: "Poupa 1 de energia por jogador que entrar em campo.",
    injury: "Risco de lesão 10% menor.",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  },
} as const;

function LineupPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchLineup = useServerFn(getMyLineupWithSession);
  const fetchDashboard = useServerFn(getDashboardWithSession);
  const save = useServerFn(saveLineup);
  const saveClubPreset = useServerFn(saveClubLineupPreset);
  const fetchProg = useServerFn(getLineupPrognostic);
  const fetchUpcoming = useServerFn(getUpcomingOfficialMatch);
  const playLeague = useServerFn(playNextLeagueMatch);
  const advanceLeagueBg = useServerFn(advanceLeagueRoundBackground);
  const playCup = useServerFn(playNextCupMatch);
  const advanceCupBg = useServerFn(advanceCupRoundBackground);
  const playWorldLeague = useServerFn(simulateWorldLeagueRound);
  const advanceWorldLeagueBg = useServerFn(advanceWorldLeagueRoundBackground);
  const playWorldCup = useServerFn(simulateWorldCupRound);
  const advanceWorldCupBg = useServerFn(advanceWorldCupRoundBackground);

  const { data, isLoading } = useQuery({
    queryKey: ["lineup"],
    queryFn: async () => {
      const { data: current, error } = await supabase.auth.getSession();
      if (error || !current.session?.access_token) throw error ?? new Error("Sessão não encontrada.");
      return fetchLineup({ data: { access_token: current.session.access_token } });
    },
    staleTime: 2 * 60_000,
  });
  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: current, error } = await supabase.auth.getSession();
      if (error || !current.session?.access_token) throw error ?? new Error("Sessão não encontrada.");
      return fetchDashboard({ data: { access_token: current.session.access_token } });
    },
    staleTime: 20_000,
  });
  const { data: upcomingMatch } = useQuery<OfficialMatchContext | null>({
    queryKey: ["upcoming-official-match", search.competition ?? "auto"],
    queryFn: () => fetchUpcoming({ data: search.competition ? { competition: search.competition } : {} }),
    staleTime: 30_000,
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

  // Só recalcula depois que o treinador termina a alteração. O prognóstico
  // executa 120 simulações no servidor; 600ms preserva a sensação de resposta
  // sem enviar uma nova simulação para cada clique consecutivo.
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
    placeholderData: keepPreviousData,
    // Desabilita durante a confirmação para não competir com a criação da partida.
    // Gate pelo MESMO draft que a query envia (debounced). Usar `starters`
    // aqui liberava a chamada com o draft antigo ainda incompleto → erro
    // "Preencha os 11 titulares".
    enabled:
      !!data &&
      (debouncedDraft?.starters ?? []).filter((s: any) => s?.creature_id).length === 11 &&
      !isConfirming,
    staleTime: 60_000,
  });

  const slots = useMemo(() => buildSlots(formation), [formation]);


  // "Ponto de referência" do que já está salvo no servidor. Enquanto o draft
  // atual bater com este key, o save no clique "Confirmar e jogar" é pulado
  // (economiza ~500ms na hot path).
  const [lastSavedKey, setLastSavedKey] = useState<string | null>(null);

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
    const nextStarters = newSlots.map((s) => {
      const found = savedStarters.find((x) => x.slot === s.index);
      return { slot: s.index, role: s.role, creature_id: found?.creature_id ?? null };
    });
    const nextBench = Array.isArray(data.lineup.bench) ? (data.lineup.bench as unknown as string[]) : [];
    setStarters(nextStarters);
    setBench(nextBench);
    setLastSavedKey(JSON.stringify({
      formation: savedFormation,
      strategy: (data.lineup.strategy as any) ?? "equilibrada",
      starters: nextStarters,
      bench: nextBench,
    }));
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
  const FULL_ROLE_LABEL: Record<SlotRole, string> = {
    GOL: "Goleiro",
    DEF: "Defensor",
    MEI: "Meio-campista",
    ATA: "Atacante",
  };
  const ROLE_PLURAL_LABEL: Record<SlotRole, string> = {
    GOL: "Goleiros",
    DEF: "Defensores",
    MEI: "Meio-campistas",
    ATA: "Atacantes",
  };

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
      const payload = { formation, strategy, starters, bench };
      await save({ data: payload });
      return JSON.stringify(payload);
    },
    onSuccess: (key) => {
      setLastSavedKey(key);
      toast.success("Escalação salva!");
      qc.invalidateQueries({ queryKey: ["lineup"] });
      qc.invalidateQueries({ queryKey: ["prognostic"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar."),
  });

  const clubPresetMutation = useMutation({
    mutationFn: () => saveClubPreset({ data: { formation, strategy, starters, bench } }),
    onSuccess: () => { toast.success("Plano 2 do Clube salvo!"); qc.invalidateQueries({ queryKey: ["lineup"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar o plano 2."),
  });

  const loadClubPreset = () => {
    const preset = data?.club_preset;
    if (!preset) return;
    setFormation(preset.formation as Formation);
    setStrategy(preset.strategy as typeof strategy);
    setStarters(preset.starters as StarterSlot[]);
    setBench(preset.bench as string[]);
    toast.success("Plano 2 carregado. Salve para torná-lo a escalação atual.");
  };

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

      // Só salva se o draft tiver mudado desde o último save/carga (economiza ~500ms).
      const payload = { formation, strategy, starters, bench };
      const currentKey = JSON.stringify(payload);
      if (currentKey !== lastSavedKey) {
        await withTimeout(save({ data: payload }), 20_000, "salvar a escalação");
        setLastSavedKey(currentKey);
      }

      const match = upcomingMatch ?? await withTimeout(
        fetchUpcoming({ data: search.competition ? { competition: search.competition } : {} }),
        15_000,
        "buscar a próxima partida",
      );
      if (!match) throw new Error("Nenhuma partida oficial pronta para jogar.");

      if (match.competition === "league") {
        const res = await withTimeout(playLeague(), 60_000, "iniciar a partida");
        // Avança o resto da rodada (outras partidas da divisão + 4 divisões) em background,
        // sem bloquear a navegação para a tela de partida ao vivo.
        if (res.background_advance) {
          advanceLeagueBg({ data: res.background_advance }).catch((e: any) => {
            console.warn("advanceLeagueRoundBackground failed", e);
          });
        }
        return res.match_id as string;
      }
      if (match.competition === "cup") {
        const res = await withTimeout(playCup(), 60_000, "iniciar a partida");
        if ((res as any).background_advance) {
          advanceCupBg({ data: (res as any).background_advance }).catch((e: any) => {
            console.warn("advanceCupRoundBackground failed", e);
          });
        }
        return res.match_id as string;
      }
      if (match.competition === "world_league") {
        const res = await withTimeout(playWorldLeague(), 60_000, "iniciar a partida");
        if (!res.playerMatchId) throw new Error("A rodada da Liga Mundial não tem partida do seu time.");
        if ((res as any).background_advance) {
          advanceWorldLeagueBg({ data: (res as any).background_advance }).catch((e: any) => {
            console.warn("advanceWorldLeagueRoundBackground failed", e);
          });
        }
        return res.playerMatchId as string;
      }
      const res = await withTimeout(playWorldCup(), 60_000, "iniciar a partida");
      if (!res.playerMatchId) throw new Error("A rodada da Copa Mundial não tem partida do seu time.");
      if ((res as any).background_advance) {
        advanceWorldCupBg({ data: (res as any).background_advance }).catch((e: any) => {
          console.warn("advanceWorldCupRoundBackground failed", e);
        });
      }
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

  const COMP_LABELS: Record<string, string> = {
    league: "Campeonato",
    cup: "Copa",
    world_league: "Liga Mundial",
    world_cup: "Copa Mundial",
  };

  return (
    <div
      className="dark relative min-h-screen overflow-x-hidden bg-slate-950 bg-cover bg-[position:center_62%] text-slate-100 sm:bg-center"
      style={{ backgroundImage: "url('/assets/monster-stadium.webp')" }}
    >
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-slate-950/50 via-slate-950/82 to-slate-950/96" />
      {confirmPlayMut.isPending ? (
        <MatchLoadingOverlay
          homeName={upcomingMatch?.homeTeam}
          awayName={upcomingMatch?.awayTeam}
          homeTeamKey={upcomingMatch?.homeStarterKey}
          awayTeamKey={upcomingMatch?.awayStarterKey}
          homeElement={upcomingMatch?.homeElement}
          awayElement={upcomingMatch?.awayElement}
          competitionLabel={upcomingMatch ? COMP_LABELS[upcomingMatch.competition] : null}
        />
      ) : null}
      <header className="relative z-10 border-b border-violet-500/35 bg-slate-950/90 shadow-[0_4px_24px_rgba(76,29,149,0.28)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:px-4">
          <GameLogo size="xs" className="shrink-0" />
          <TeamCrest teamName={dashboardData?.academy ? dashboardData.trainer.academy_name : null} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Preparação da partida</p>
            <h1 className="truncate text-base font-bold sm:text-lg">Escalação</h1>
            <p className="truncate text-[11px] text-slate-400">{dashboardData?.trainer?.academy_name ?? "Meu clube"} · Nível {dashboardData?.trainer?.level ?? 0}</p>
          </div>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-violet-400/25 bg-slate-900/80 px-3 text-sm font-bold">💎 {(dashboardData?.academy?.gems ?? 0).toLocaleString("pt-BR")}</div>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-amber-400/25 bg-slate-900/80 px-3 text-sm font-bold">🪙 {(dashboardData?.academy?.money ?? 0).toLocaleString("pt-BR")}</div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl space-y-3 p-2.5 text-slate-100 [&_.text-muted-foreground]:text-slate-400 sm:space-y-4 sm:p-4">
        <div className="flex flex-col gap-3 rounded-xl border border-violet-500/30 bg-slate-950/78 p-3 shadow-[0_12px_32px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:flex-row sm:items-center">
          <Button variant="outline" size="icon" className="shrink-0 border-slate-700 bg-slate-900/80" onClick={() => navigate({ to: "/dashboard" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.16em] text-violet-300">Monte seu time</p>
            <p className="font-bold text-white">Escolha a tática e confira o prognóstico antes de jogar</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button
              onClick={autoFill}
              disabled={creatures.length === 0}
              size="sm"
              variant="secondary"
            >
              <Wand2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden md:inline">Auto definir</span>
              <span className="md:hidden">Auto</span>
            </Button>
            {data?.club_active && <Button onClick={() => clubPresetMutation.mutate()} disabled={clubPresetMutation.isPending || filledStarters !== 11} size="sm" variant="outline"><Save className="h-4 w-4 sm:mr-2"/><span className="hidden sm:inline">Salvar plano 2</span></Button>}
            {data?.club_active && data.club_preset && <Button onClick={loadClubPreset} size="sm" variant="outline"><span className="hidden sm:inline">Carregar plano 2</span><span className="sm:hidden">Plano 2</span></Button>}
            <Button
              onClick={openPoupar}
              disabled={creatures.length < 16 || poupPending}
              size="sm"
              variant="outline"
              title="Escala os reservas e mantém seus 5 melhores descansados para a próxima partida"
            >
              <BedDouble className="h-4 w-4 sm:mr-2" />
              <span className="hidden md:inline">{poupPending ? "Calculando…" : "Poupar titulares"}</span>
              <span className="md:hidden">Poupar</span>
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

        <MatchContextCard
          match={upcomingMatch ?? null}
          filledStarters={filledStarters}
          pending={confirmPlayMut.isPending}
          onConfirm={() => confirmPlayMut.mutate()}
        />

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <section className="space-y-4">
        <Card className="border-violet-500/40 bg-slate-950/90 text-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.3)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-600 text-xs">1</span>Tática</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Formação</label>
              <Select value={formation} onValueChange={(v) => setFormation(v as Formation)}>
                <SelectTrigger className="border-slate-700 bg-slate-900/90 text-slate-100"><SelectValue /></SelectTrigger>
                <SelectContent className="dark border-slate-700 bg-slate-950 text-slate-100 shadow-2xl [&_[role=option]]:text-slate-100 [&_[role=option][data-highlighted]]:bg-violet-900/70">
                  {FORMATIONS.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Estratégia</label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as any)}>
                <SelectTrigger className="border-slate-700 bg-slate-900/90 text-slate-100"><SelectValue /></SelectTrigger>
                <SelectContent className="dark border-slate-700 bg-slate-950 text-slate-100 shadow-2xl [&_[role=option]]:text-slate-100 [&_[role=option][data-highlighted]]:bg-violet-900/70">
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
            <div className={`sm:col-span-2 rounded-lg border px-3 py-2.5 text-xs ${STRATEGY_EFFECTS[strategy].className}`}>
              <p className="font-semibold">{STRATEGY_EFFECTS[strategy].title}</p>
              <p className="mt-1">{STRATEGY_EFFECTS[strategy].summary}</p>
              <div className="mt-2 grid gap-1 text-[11px] opacity-80 sm:grid-cols-2">
                <span>Energia: {STRATEGY_EFFECTS[strategy].energy}</span>
                <span>Lesões: {STRATEGY_EFFECTS[strategy].injury}</span>
              </div>
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
          </section>
          <section className="space-y-4">
        <FormationBoard slots={slots} starters={starters} creatures={allCreatures} strategy={strategy} />
        <Card className="border-violet-500/40 bg-slate-950/90 text-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.3)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-600 text-xs">4</span>Titulares</CardTitle>
            <p className="text-[11px] text-slate-400">Posição, estrelas, energia e moral antes da partida.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {slots.map((s) => {
              const current = starters.find((x) => x.slot === s.index)?.creature_id ?? null;
              const options = availableFor(current);
              const currentCreature = current ? allCreatures.find((x: any) => x.id === current) : null;
              const currFs = currentCreature ? fatigueState(currentCreature.energy ?? 100) : null;
              const currMult = currentCreature ? energyMultiplier(currentCreature.energy ?? 100) : 1;
              const currEff = currentCreature ? effectiveOverall(currentCreature.overall ?? 0, currentCreature.energy ?? 100, currentCreature.morale) : 0;
              const warn = currFs === "muito_cansado" || currFs === "exausto";

              // Só criaturas da posição natural correspondente ao slot (inclusive lesionadas/em uso).
              const inPos = options
                .filter((c: any) => naturalRoleOf(c.suggested_position) === s.role)
                .sort(sortByEff);

              const renderItem = (c: any) => {
                const eff = effectiveOverall(c.overall ?? 0, c.energy ?? 100, c.morale);
                const ms = moraleState(c.morale);
                const isInjured = (c.injury_matches_remaining ?? 0) > 0;
                const usedElsewhere = !isInjured && c.id !== current && usedIds.has(c.id);
                const disabled = isInjured;
                const nameClass =
                  (isInjured ? "line-through " : "") + (disabled ? "opacity-60" : "font-medium");
                return (
                  <SelectItem key={c.id} value={c.id} disabled={disabled}>
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="shrink-0 border-violet-400/50 bg-violet-500/15 text-[9px] text-violet-100">
                        {FULL_ROLE_LABEL[naturalRoleOf(c.suggested_position)]}
                      </Badge>
                      <span className={nameClass}>{c.name}</span>
                      <span className={"text-muted-foreground" + (disabled ? " opacity-70" : "")}>
                        · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall}{eff !== c.overall ? `→${eff}` : ""}
                      </span>
                      <StarRating value={overallToStars(c.overall ?? 0)} size={0.75} />
                      <span title={`Moral: ${MORALE_LABEL[ms]}`}>{MORALE_EMOJI[ms]}</span>
                      <span className="text-muted-foreground">· {c.energy ?? 100}%</span>
                      {isInjured && (
                        <span className="rounded border border-red-500/60 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
                          Lesionada · {c.injury_matches_remaining} {c.injury_matches_remaining === 1 ? "partida" : "partidas"}
                        </span>
                      )}
                      {usedElsewhere && (
                        <span className="rounded border border-amber-500/60 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          Em {usedLabelById.get(c.id)} · toque para mover aqui
                        </span>
                      )}
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
                      <SelectTrigger className="h-auto min-h-14 min-w-0 flex-1 border-slate-700 bg-slate-900/90 py-2 text-slate-100 [&>span]:w-full [&>span]:line-clamp-none">
                        <SelectValue placeholder="Vazio">
                          {currentCreature ? (
                            <span className="block min-w-0 pr-1 text-left">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-xs font-bold text-slate-100 sm:text-sm">{currentCreature.name}</span>
                                <span className="shrink-0 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300">
                                  {FULL_ROLE_LABEL[naturalRoleOf(currentCreature.suggested_position)]}
                                </span>
                              </span>
                              <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:text-[11px]">
                                <span className="font-semibold text-cyan-300">OVR {currentCreature.overall}{currEff !== currentCreature.overall ? `→${currEff}` : ""}</span>
                                <StarRating value={overallToStars(currentCreature.overall ?? 0)} size={0.78} />
                                <span className="font-semibold text-emerald-300" title="Energia disponível">⚡ Energia {currentCreature.energy ?? 100}%</span>
                                <span className="font-semibold text-amber-200" title={`Moral: ${MORALE_LABEL[moraleState(currentCreature.morale)]}`}>
                                  {MORALE_EMOJI[moraleState(currentCreature.morale)]} Moral {MORALE_LABEL[moraleState(currentCreature.morale)]}
                                </span>
                              </span>
                            </span>
                          ) : null}
                        </SelectValue>
                      </SelectTrigger>

                      <SelectContent className="dark border-slate-700 bg-slate-950 text-slate-100 shadow-2xl [&_[role=option]]:text-slate-100 [&_[role=option][data-highlighted]]:bg-violet-900/70">
                        <div className="border-b border-slate-800 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                          Apenas {ROLE_PLURAL_LABEL[s.role]}
                        </div>
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
          </section>
        </div>

        <Card className="border-violet-500/40 bg-slate-950/90 text-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.3)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-600 text-xs">5</span>Reservas ({bench.length}/{MAX_BENCH})</CardTitle>
            <p className="text-[11px] text-slate-400">Acompanhe posição, estrelas, energia e moral do banco.</p>
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
                    <div key={id} className="flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900/65 p-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge variant="outline" className="w-12 shrink-0 justify-center border-violet-400/45 bg-violet-500/10 text-[10px] text-violet-100">{role}</Badge>
                          <span className="truncate text-xs font-bold text-slate-100 sm:text-sm">{c.name}</span>
                          <span className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">{ELEMENT_LABEL[c.element] ?? c.element}</span>
                        </div>
                        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-14 text-[10px] sm:text-[11px]">
                          <span className="font-semibold text-cyan-300">OVR {c.overall}{eff !== c.overall ? `→${eff}` : ""}</span>
                          <StarRating value={overallToStars(c.overall ?? 0)} size={0.78} />
                          <span className="font-semibold text-emerald-300" title="Energia disponível">⚡ Energia {c.energy ?? 100}%</span>
                          <span className="font-semibold text-amber-200" title={`Moral: ${MORALE_LABEL[ms]}`}>
                            {MORALE_EMOJI[ms]} Moral {MORALE_LABEL[ms]}
                          </span>
                          {fs !== "pleno" && <span className={"rounded border px-1.5 py-0.5 text-[9px] " + FATIGUE_CLASS[fs]}>{FATIGUE_LABEL[fs]}</span>}
                        </div>
                      </div>
                      <Button className="shrink-0 text-[11px] text-slate-300 hover:text-white" size="sm" variant="ghost" onClick={() => removeFromBench(id)}>
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
                  <SelectTrigger className="border-slate-700 bg-slate-900/90 text-slate-100"><SelectValue placeholder="Escolher criatura…" /></SelectTrigger>
                  <SelectContent className="dark border-slate-700 bg-slate-950 text-slate-100 shadow-2xl [&_[role=option]]:text-slate-100 [&_[role=option][data-highlighted]]:bg-violet-900/70">
                    {allCreatures
                      .filter((c: any) => !bench.includes(c.id))
                      .sort(sortByEff)
                      .map((c: any) => {
                        const eff = effectiveOverall(c.overall ?? 0, c.energy ?? 100, c.morale);
                        const ms = moraleState(c.morale);
                        const isInjured = (c.injury_matches_remaining ?? 0) > 0;
                        const usedElsewhere = !isInjured && usedIds.has(c.id);
                        const disabled = isInjured;
                        const nameClass =
                          (isInjured ? "line-through " : "") + (disabled ? "opacity-60" : "font-medium");
                        return (
                          <SelectItem key={c.id} value={c.id} disabled={disabled}>
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="w-12 shrink-0 justify-center text-[10px]">
                                {ROLE_LABEL[naturalRoleOf(c.suggested_position)]}
                              </Badge>
                              <span className={nameClass}>{c.name}</span>
                              <span className={"text-muted-foreground" + (disabled ? " opacity-70" : "")}>
                                · {ELEMENT_LABEL[c.element] ?? c.element} · OVR {c.overall}{eff !== c.overall ? `→${eff}` : ""}
                              </span>
                              <StarRating value={overallToStars(c.overall ?? 0)} size={0.75} />
                              <span>{MORALE_EMOJI[ms]}</span>
                              <span className="text-muted-foreground">· {c.energy ?? 100}%</span>
                              {isInjured && (
                                <span className="rounded border border-red-500/60 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
                                  Lesionada · {c.injury_matches_remaining} {c.injury_matches_remaining === 1 ? "partida" : "partidas"}
                                </span>
                              )}
                              {usedElsewhere && (
                                <span className="rounded border border-amber-500/60 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                                  Em {usedLabelById.get(c.id)} · toque para mover ao banco
                                </span>
                              )}
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

function FormationBoard({
  slots,
  starters,
  creatures,
  strategy,
}: {
  slots: ReturnType<typeof buildSlots>;
  starters: StarterSlot[];
  creatures: any[];
  strategy: keyof typeof STRATEGY_EFFECTS;
}) {
  const roleStyle: Record<SlotRole, { dot: string; badge: string; label: string }> = {
    ATA: { dot: "border-red-300 bg-red-500", badge: "bg-red-500/15 text-red-200", label: "Ataque" },
    MEI: { dot: "border-amber-200 bg-amber-400", badge: "bg-amber-500/15 text-amber-100", label: "Meio" },
    DEF: { dot: "border-blue-200 bg-blue-500", badge: "bg-blue-500/15 text-blue-100", label: "Defesa" },
    GOL: { dot: "border-emerald-200 bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-100", label: "Goleiro" },
  };
  const roleRows: SlotRole[] = ["ATA", "MEI", "DEF", "GOL"];

  return (
    <Card className="overflow-hidden border-violet-500/40 bg-slate-950/90 text-slate-100 shadow-[0_14px_35px_rgba(0,0,0,0.32)]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-600 text-xs">2</span>
          Estratégia em campo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[520px] overflow-hidden rounded-xl border-2 border-emerald-300/40 bg-[linear-gradient(90deg,rgba(255,255,255,.035)_50%,transparent_50%),linear-gradient(180deg,#205d27,#16491d)] bg-[length:16.666%_100%,100%_100%] shadow-[inset_0_0_45px_rgba(0,0,0,.45)] sm:aspect-[5/4]">
          <div className="pointer-events-none absolute inset-3 rounded border border-white/45" />
          <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t border-white/45" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/45" />
          <div className="pointer-events-none absolute left-1/2 top-3 h-[18%] w-[42%] -translate-x-1/2 border border-t-0 border-white/45" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 h-[18%] w-[42%] -translate-x-1/2 border border-b-0 border-white/45" />
          <div className="relative z-10 flex h-full flex-col justify-around px-4 py-5 sm:px-7">
            {roleRows.map((role) => {
              const rowSlots = slots.filter((slot) => slot.role === role);
              return (
                <div key={role} className="flex items-start justify-evenly gap-1.5">
                  {rowSlots.map((slot) => {
                    const id = starters.find((item) => item.slot === slot.index)?.creature_id;
                    const creature = creatures.find((item: any) => item.id === id);
                    const shortName = creature?.name?.split(" ").slice(0, 2).join(" ") ?? slot.label;
                    return (
                      <div key={slot.index} className="flex min-w-0 max-w-[88px] flex-1 flex-col items-center">
                        <span className={`h-7 w-7 rounded-full border-2 shadow-[0_3px_10px_rgba(0,0,0,.5)] sm:h-9 sm:w-9 ${roleStyle[role].dot}`} />
                        <span className="mt-1 max-w-full truncate rounded bg-slate-950/75 px-1.5 py-0.5 text-[9px] font-semibold text-white sm:text-[10px]">
                          {shortName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <div className={`rounded-lg border px-3 py-2.5 text-xs ${STRATEGY_EFFECTS[strategy].className}`}>
          <div className="flex items-center justify-between gap-2">
            <strong>{STRATEGY_EFFECTS[strategy].title}</strong>
            <div className="flex flex-wrap justify-end gap-1">
              {roleRows.map((role) => (
                <span key={role} className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${roleStyle[role].badge}`}>
                  {roleStyle[role].label}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-1 opacity-85">{STRATEGY_EFFECTS[strategy].summary}</p>
        </div>
      </CardContent>
    </Card>
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
      <Card className="border-dashed border-violet-500/40 bg-slate-950/90 text-slate-100">
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
    <Card className="overflow-hidden border-violet-400/50 bg-gradient-to-br from-slate-950 via-indigo-950/95 to-violet-950/90 text-slate-100 shadow-[0_16px_38px_rgba(0,0,0,.32)]">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <Badge className="w-fit bg-violet-600 text-white hover:bg-violet-600">{match.competitionLabel}</Badge>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Rodada {match.round}{match.phaseLabel ? ` · ${match.phaseLabel}` : ""}
              </p>
              <div className="mt-2 flex items-center gap-2 sm:gap-3">
                <TeamCrest teamName={match.playerTeam} size="sm" />
                <h2 className="min-w-0 text-base font-bold leading-tight sm:text-xl">
                  <span className="break-words">{match.playerTeam}</span>
                  <span className="mx-2 text-violet-300">vs</span>
                  <span className="break-words">{match.opponent}</span>
                </h2>
                <TeamCrest teamName={match.opponent} size="sm" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {match.isHome ? "Em casa" : "Fora"} · adversário: {match.opponent}
              </p>
            </div>
          </div>
          <Button
            className="w-full bg-gradient-to-r from-violet-700 to-purple-600 text-white shadow-[0_0_18px_rgba(124,58,237,.38)] hover:from-violet-600 hover:to-purple-500 sm:w-auto"
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
