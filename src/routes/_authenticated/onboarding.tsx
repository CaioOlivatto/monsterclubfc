import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  createInitialTrainer,
  getMyTrainer,
  listStarterTeams,
  getStarterTeamDetail,
  chooseStarterTeam,
} from "@/lib/creatures.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Star, Shield, Swords, Scale, Trophy } from "lucide-react";
import { TeamCrest } from "@/components/TeamCrest";
import { GameLogo } from "@/components/GameLogo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Escolha seu time — Monster Club Manager" },
      {
        name: "description",
        content: "Escolha 1 entre 6 times iniciais e comece sua jornada na 5ª Divisão – Liga Bronze.",
      },
    ],
  }),
  component: Onboarding,
});

const ELEMENT_LABEL: Record<string, string> = {
  fogo: "Fogo",
  agua: "Água",
  terra: "Terra",
  ar: "Ar",
  gelo: "Gelo",
  mesclado: "Mesclado",
};

const STYLE_LABEL: Record<string, string> = {
  defensivo: "Defensivo",
  ofensivo: "Ofensivo",
  equilibrado: "Equilibrado",
};

const STYLE_ICON: Record<string, React.ReactNode> = {
  defensivo: <Shield className="h-3.5 w-3.5" />,
  ofensivo: <Swords className="h-3.5 w-3.5" />,
  equilibrado: <Scale className="h-3.5 w-3.5" />,
};

const TEAM_CARD_STYLES: Record<string, string> = {
  titas_pedra: "border-amber-400/80 from-amber-950/95 via-stone-950/95 to-orange-950/90 shadow-amber-950/40 hover:shadow-amber-500/25",
  furacoes_vento: "border-fuchsia-400/80 from-violet-950/95 via-purple-950/95 to-slate-950 shadow-violet-950/40 hover:shadow-fuchsia-500/25",
  chamas_rubras: "border-red-400/80 from-red-950/95 via-orange-950/90 to-slate-950 shadow-red-950/40 hover:shadow-red-500/25",
  mares_profundas: "border-sky-400/80 from-blue-950/95 via-cyan-950/90 to-slate-950 shadow-blue-950/40 hover:shadow-sky-500/25",
  laminas_gelo: "border-cyan-300/80 from-cyan-950/95 via-sky-950/90 to-slate-950 shadow-cyan-950/40 hover:shadow-cyan-400/25",
  guardioes_mistos: "border-emerald-400/80 from-emerald-950/95 via-green-950/90 to-slate-950 shadow-emerald-950/40 hover:shadow-emerald-500/25",
};

function Onboarding() {
  const nav = useNavigate();
  const fetchTrainer = useServerFn(getMyTrainer);
  const fetchTeams = useServerFn(listStarterTeams);
  const fetchDetail = useServerFn(getStarterTeamDetail);
  const createFn = useServerFn(createInitialTrainer);
  const choose = useServerFn(chooseStarterTeam);

  const { data: trainer, isLoading: loadingTrainer } = useQuery({
    queryKey: ["myTrainer"],
    queryFn: () => fetchTrainer(),
  });

  const { data: teams, isLoading: loadingTeams, isError: teamsUnavailable, refetch: refetchTeams } = useQuery({
    queryKey: ["starterTeams"],
    queryFn: () => fetchTeams(),
    retry: 1,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [setupProgress, setSetupProgress] = useState(0);
  const [setupStep, setSetupStep] = useState("Preparando sua jornada...");

  // Inputs de nome — aparecem no diálogo se o treinador ainda não existe
  // Nome do treinador — aparece no diálogo se ele ainda não existe.
  // O nome da "academia" passa a ser o nome do time escolhido.
  const [trainerName, setTrainerName] = useState("");


  useEffect(() => {
    if (trainer?.has_roster) nav({ to: "/dashboard", replace: true });
  }, [trainer, nav]);

  useEffect(() => {
    if (!submitting) return;

    const phases = [
      { progress: 12, label: "Criando seu treinador..." },
      { progress: 28, label: "Organizando a academia..." },
      { progress: 46, label: "Formando seu elenco..." },
      { progress: 64, label: "Criando as cinco ligas..." },
      { progress: 80, label: "Montando os calendários..." },
      { progress: 92, label: "Acertando a nova temporada..." },
    ];
    let phaseIndex = 0;
    setSetupProgress(phases[0].progress);
    setSetupStep(phases[0].label);

    const timer = window.setInterval(() => {
      phaseIndex = Math.min(phaseIndex + 1, phases.length - 1);
      setSetupProgress(phases[phaseIndex].progress);
      setSetupStep(phases[phaseIndex].label);
    }, 1100);

    return () => window.clearInterval(timer);
  }, [submitting]);

  async function openTeam(key: string) {
    setOpenKey(key);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const d = await fetchDetail({ data: { key } });
      setDetail(d);
    } catch {
      toast.error("Erro ao carregar detalhes.");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function confirmChoice() {
    if (!openKey) return;

    // Se ainda não há treinador, cria usando o nome do time como "academia"
    const teamName: string = detail?.team?.name ?? "";
    if (!trainer) {
      if (trainerName.trim().length < 2) {
        toast.error("Informe o nome do treinador (mín. 2 letras).");
        return;
      }
    }

    setSubmitting(true);
    try {
      // Lovable executa as Server Functions atrás de um proxy. Enviamos a
      // sessão explicitamente nesta ação crítica para a confirmação do time
      // não depender apenas do middleware global do navegador.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Sua sessão expirou. Entre novamente para iniciar sua carreira.");
      }
      const authHeaders = {
        Authorization: `Bearer ${accessToken}`,
        "x-supabase-access-token": accessToken,
      };

      if (!trainer) {
        await createFn({
          data: {
            trainer_name: trainerName.trim(),
            academy_name: teamName,
          },
          headers: authHeaders,
        });
      }

      await choose({ data: { key: openKey }, headers: authHeaders });
      setSetupProgress(100);
      setSetupStep("Tudo pronto! Entrando no clube...");
      toast.success("Time escolhido! Liga Bronze iniciada.");
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      nav({ to: "/dashboard", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingTrainer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-slate-950 bg-cover bg-fixed bg-center p-3 pb-24 text-white sm:p-5 sm:pb-24"
      style={{ backgroundImage: "url('/assets/monster-stadium.webp')" }}
    >
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-gradient-to-b from-slate-950/55 via-slate-950/72 to-slate-950/88" />
      <div className="relative mx-auto max-w-6xl space-y-5">
        <header className="text-center">
          <GameLogo size="lg" className="mx-auto mb-1" />
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-300 sm:text-xs">
            Início de jogo
          </p>
          <div className="mt-1 flex items-center justify-center gap-3">
            <Star className="h-5 w-5 fill-violet-500 text-violet-500 sm:h-8 sm:w-8" />
            <h1 className="text-3xl font-black uppercase italic tracking-tight text-white drop-shadow-[0_3px_6px_rgba(0,0,0,0.9)] sm:text-5xl">Escolha seu time</h1>
            <Star className="h-5 w-5 fill-violet-500 text-violet-500 sm:h-8 sm:w-8" />
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-xs text-slate-200 sm:text-base">
            São 6 times pré-montados, força equivalente e personalidades distintas.
            <br className="hidden sm:block" /> Você começa na <strong className="text-amber-400">5ª Divisão – Liga Bronze</strong>, e os outros
            5 viram seus adversários.
          </p>
        </header>

        {loadingTeams ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Preparando times">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-12" />
                </div>
              </div>
            ))}
            <p className="col-span-full text-center text-xs text-muted-foreground">
              Preparando os clubes da Liga Bronze...
            </p>
          </div>
        ) : teamsUnavailable || !teams ? (
          <div className="rounded-xl border bg-card px-4 py-8 text-center">
            <p className="font-medium">Reorganizando os clubes da Liga Bronze...</p>
            <p className="mt-1 text-xs text-muted-foreground">Sua jornada está preservada. Tente continuar em instantes.</p>
            <Button variant="outline" className="mt-4" onClick={() => refetchTeams()}>
              Continuar preparação
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t: any) => (
              <button
                key={t.key}
                type="button"
                onClick={() => openTeam(t.key)}
                className={`group relative min-h-72 overflow-hidden rounded-2xl border bg-gradient-to-br p-4 text-left text-white shadow-xl transition duration-200 hover:-translate-y-1 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:p-5 ${TEAM_CARD_STYLES[t.key] ?? t.colorClass}`}
              >
                <div aria-hidden="true" className="absolute -bottom-20 -right-16 h-48 w-48 rounded-full bg-white/10 blur-3xl transition-transform group-hover:scale-125" />
                <div className="flex items-start justify-between">
                  <TeamCrest teamKey={t.key} size="lg" />
                  <Badge
                    variant="outline"
                    className="gap-1 border-white/30 bg-black/30 text-xs text-white"
                  >
                    {STYLE_ICON[t.style]}
                    {STYLE_LABEL[t.style]}
                  </Badge>
                </div>
                <h3 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">{t.name}</h3>
                <p className="mt-1 min-h-10 text-xs leading-relaxed text-white/80 sm:text-sm">
                  {t.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  <Badge className="border border-white/30 bg-white/90 font-bold text-slate-950 hover:bg-white">
                    {ELEMENT_LABEL[t.dominant] ?? t.dominant}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-base font-black text-yellow-300">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {t.totalStars.toFixed(1)}★
                  </span>
                </div>
                <div className="absolute inset-x-4 bottom-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[10px] uppercase tracking-wider text-white/70 sm:inset-x-5 sm:text-xs">
                  <span className="text-right">
                    ATK méd. <strong className="text-white">{t.avgAttack}</strong>
                  </span>
                  <span>
                    DEF méd. <strong className="text-white">{t.avgDefense}</strong>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="grid overflow-hidden rounded-2xl border border-violet-400/40 bg-slate-950/85 shadow-xl backdrop-blur-md sm:grid-cols-[1fr_1fr_1.35fr]">
          <div className="flex items-center gap-3 border-b border-white/10 p-4 sm:border-b-0 sm:border-r">
            <Star className="h-9 w-9 shrink-0 fill-violet-500 text-violet-400" />
            <div><p className="text-xs font-bold uppercase text-violet-300">Força equivalente</p><p className="mt-1 text-xs text-slate-300">Todos os times podem chegar ao topo.</p></div>
          </div>
          <div className="flex items-center gap-3 border-b border-white/10 p-4 sm:border-b-0 sm:border-r">
            <Trophy className="h-9 w-9 shrink-0 text-amber-400" />
            <div><p className="text-xs font-bold uppercase text-violet-300">Seu objetivo</p><p className="mt-1 text-xs text-slate-300">Leve seu time à glória e vire uma lenda.</p></div>
          </div>
          <div className="flex items-center justify-center gap-3 bg-gradient-to-r from-violet-950/80 to-purple-700/70 p-4 text-center">
            <TeamCrest teamKey="furacoes_vento" size="md" />
            <p className="text-lg font-black uppercase italic sm:text-xl">Escolha um time<br/><span className="text-sm text-violet-200">e comece sua carreira</span></p>
          </div>
        </div>
      </div>

      <Dialog open={!!openKey} onOpenChange={(o) => !o && setOpenKey(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TeamCrest teamKey={detail?.team?.key ?? openKey} size="md" />
              {detail?.team?.name ?? "..."}
            </DialogTitle>
            <DialogDescription>{detail?.team?.description}</DialogDescription>
          </DialogHeader>

          {loadingDetail || !detail ? (
            <p className="py-8 text-center text-muted-foreground">
              Carregando elenco...
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">
                  Elemento:{" "}
                  {ELEMENT_LABEL[detail.team.dominant] ?? detail.team.dominant}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  {STYLE_ICON[detail.team.style]}
                  {STYLE_LABEL[detail.team.style]}
                </Badge>
                <Badge variant="outline">Cor: {detail.team.color}</Badge>
              </div>

              <div className="overflow-hidden rounded-lg border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left">Criatura</th>
                      <th className="px-2 py-2 text-left">Elem.</th>
                      <th className="px-2 py-2 text-left">Pos.</th>
                      <th className="px-2 py-2 text-right">★</th>
                      <th className="px-2 py-2 text-right">OV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.roster.map((c: any, i: number) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1.5 font-medium">{c.name}</td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">
                          {ELEMENT_LABEL[c.element]}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">
                          {c.position}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {(c.stars / 2).toFixed(1)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold">
                          {c.overall}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!trainer && (
                <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-3">
                  <p className="text-sm font-medium">
                    Antes de começar, informe seu nome de treinador:
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="trainer">Treinador</Label>
                      <Input
                        id="trainer"
                        value={trainerName}
                        onChange={(e) => setTrainerName(e.target.value)}
                        placeholder="Ex.: Iris"
                        maxLength={40}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Time</Label>
                      <div className="flex h-10 items-center rounded-md border border-border/60 bg-muted/30 px-3 text-sm">
                        <TeamCrest teamKey={detail?.team?.key ?? openKey} size="sm" />
                        <span className="ml-2 font-medium">
                          {detail?.team?.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {submitting ? (
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{setupStep}</span>
                <span className="tabular-nums text-muted-foreground">{setupProgress}%</span>
              </div>
              <Progress value={setupProgress} className="h-2.5" />
              <p className="text-xs text-muted-foreground">
                Estamos preparando times, criaturas e partidas. Você pode aguardar nesta tela.
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpenKey(null)}
              disabled={submitting}
            >
              Voltar
            </Button>
            <Button
              onClick={confirmChoice}
              disabled={submitting || !detail}
            >
              {submitting ? "Iniciando..." : "Escolher este time"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
