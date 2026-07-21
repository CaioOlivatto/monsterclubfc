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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Star, Shield, Swords, Scale } from "lucide-react";

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

  const { data: teams, isLoading: loadingTeams } = useQuery({
    queryKey: ["starterTeams"],
    queryFn: () => fetchTeams(),
  });

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Inputs de nome — aparecem no diálogo se o treinador ainda não existe
  // Nome do treinador — aparece no diálogo se ele ainda não existe.
  // O nome da "academia" passa a ser o nome do time escolhido.
  const [trainerName, setTrainerName] = useState("");


  useEffect(() => {
    if (trainer?.has_roster) nav({ to: "/dashboard", replace: true });
  }, [trainer, nav]);

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

    // Se ainda não há treinador, cria com os nomes informados
    if (!trainer) {
      if (trainerName.trim().length < 2 || academyName.trim().length < 2) {
        toast.error("Informe nome do treinador e da academia (mín. 2 letras).");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!trainer) {
        await createFn({
          data: {
            trainer_name: trainerName.trim(),
            academy_name: academyName.trim(),
          },
        });
      }
      await choose({ data: { key: openKey } });
      toast.success("Time escolhido! Liga Bronze iniciada.");
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
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Início de jogo
          </p>
          <h1 className="text-2xl font-bold sm:text-3xl">Escolha seu time</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            São 6 times pré-montados, força equivalente e personalidades distintas.
            Você começa na <strong>5ª Divisão – Liga Bronze</strong>, e os outros
            5 viram seus adversários.
          </p>
        </header>

        {loadingTeams || !teams ? (
          <div className="py-12 text-center text-muted-foreground">
            Carregando times...
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t: any) => (
              <button
                key={t.key}
                type="button"
                onClick={() => openTeam(t.key)}
                className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 text-left text-white transition-all hover:scale-[1.02] hover:shadow-lg ${t.colorClass}`}
              >
                <div className="flex items-start justify-between">
                  <div className="text-5xl">{t.emblem}</div>
                  <Badge
                    variant="outline"
                    className="gap-1 border-white/30 bg-black/30 text-xs text-white"
                  >
                    {STYLE_ICON[t.style]}
                    {STYLE_LABEL[t.style]}
                  </Badge>
                </div>
                <h3 className="mt-3 text-lg font-bold">{t.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-white/80">
                  {t.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">
                    {ELEMENT_LABEL[t.dominant] ?? t.dominant}
                  </Badge>
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    {t.totalStars.toFixed(1)}★
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-wider text-white/70">
                  <span>
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
      </div>

      <Dialog open={!!openKey} onOpenChange={(o) => !o && setOpenKey(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-3xl">{detail?.team?.emblem}</span>
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
                    Antes de começar, escolha seus nomes:
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
                      <Label htmlFor="academy">Academia</Label>
                      <Input
                        id="academy"
                        value={academyName}
                        onChange={(e) => setAcademyName(e.target.value)}
                        placeholder="Ex.: Academia Vulcânica"
                        maxLength={40}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

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
