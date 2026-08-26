import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Award, Trophy, TrendingUp, TrendingDown, DoorOpen, Building2, Sparkles, Handshake, AlertTriangle, ShieldCheck, Target, CalendarDays, Crown, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getCareer, getConfidence, listOffers, declineOffer, acceptOffer, type CareerEntry, type JobOffer } from "@/lib/career.functions";
import { GamePageShell } from "@/components/GamePageShell";

const DIV_LABEL: Record<string, string> = {
  lendaria: "1ª — Lendária",
  diamante: "2ª — Diamante",
  ouro: "3ª — Ouro",
  prata: "4ª — Prata",
  bronze: "5ª — Bronze",
};

const REASON_LABEL: Record<JobOffer["reason"], string> = {
  top_finish: "Boa campanha",
  higher_division: "Divisão superior",
  after_dismissal: "Após demissão",
};

const OFFER_INFRASTRUCTURE: Record<string, string> = {
  bronze: "Estádio 1 · CT 1 · Centro Médico 1",
  prata: "Estádio 2 · CT 2 · Centro Médico 2",
  ouro: "Estádio 4 · CT 3 · Centro Médico 3",
  diamante: "Estádio 6 · CT 4 · Centro Médico 4",
  lendaria: "Estádio 8 · CT 5 · Centro Médico 5",
};

const EVENT_META: Record<
  CareerEntry["event"],
  { label: string; tone: string; Icon: typeof Trophy }
> = {
  arrived:    { label: "Chegou ao clube", tone: "bg-muted text-muted-foreground border-border", Icon: Building2 },
  hired:      { label: "Contratado", tone: "bg-blue-500/15 text-blue-200 border-blue-500/40", Icon: Sparkles },
  promoted:   { label: "Promovido", tone: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40", Icon: TrendingUp },
  relegated:  { label: "Rebaixado", tone: "bg-red-500/15 text-red-200 border-red-500/40", Icon: TrendingDown },
  champion:   { label: "Campeão", tone: "bg-amber-500/15 text-amber-200 border-amber-500/40", Icon: Trophy },
  fired:      { label: "Demitido", tone: "bg-orange-600/15 text-orange-200 border-orange-500/40", Icon: DoorOpen },
  left:       { label: "Deixou o clube", tone: "bg-slate-500/15 text-slate-200 border-slate-400/40", Icon: DoorOpen },
};

export const Route = createFileRoute("/_authenticated/career")({
  head: () => ({
    meta: [
      { title: "Carreira do Treinador — Monster Club Manager" },
      { name: "description", content: "Currículo do treinador: clubes dirigidos, títulos, promoções, rebaixamentos e propostas recebidas." },
      { property: "og:title", content: "Carreira do Treinador — Monster Club Manager" },
      { property: "og:description", content: "Sua trajetória entre clubes, títulos, temporadas e negociações." },
    ],
  }),
  component: CareerPage,
});

function CareerPage() {
  const fetchCareer = useServerFn(getCareer);
  const fetchConfidence = useServerFn(getConfidence);
  const fetchOffers = useServerFn(listOffers);
  const { data, isLoading } = useQuery({ queryKey: ["career"], queryFn: () => fetchCareer() });
  const { data: confidence } = useQuery({ queryKey: ["career", "confidence"], queryFn: () => fetchConfidence(), enabled: !!data });
  const { data: offersData } = useQuery({ queryKey: ["career", "offers"], queryFn: () => fetchOffers() });

  return (
    <GamePageShell title="Carreira" subtitle="Seu currículo, conquistas e propostas" academyName={data?.academy_name} trainerName={data?.trainer_name} level={data?.level} xp={data?.xp} maxWidth="4xl">
      {isLoading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          {offersData?.status === "dismissed" && (
            <Card className="mb-3 border-orange-500/40 bg-orange-500/10">
              <CardContent className="flex items-start gap-2 py-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-orange-300" />
                <div>
                  <p className="font-medium text-orange-200">Você está sem clube</p>
                  <p className="text-xs text-orange-300/80">
                    Escolha uma das propostas abaixo para retomar sua carreira.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <section className="mb-4 overflow-hidden rounded-2xl border border-violet-400/35 bg-gradient-to-br from-violet-950/75 via-slate-950/90 to-cyan-950/35 shadow-[0_14px_36px_rgba(2,6,23,0.5)]">
            <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:p-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-400/10 shadow-[0_0_22px_rgba(251,191,36,0.14)]"><Award className="h-7 w-7 text-amber-300" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Perfil do treinador</p>
                <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">{data.trainer_name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge className="border-cyan-400/35 bg-cyan-400/10 text-cyan-100"><Building2 className="mr-1 h-3 w-3" />{data.current_team_name ?? "Sem clube"}</Badge>
                  {data.current_division && <Badge variant="outline" className="border-violet-400/40 text-violet-100">{DIV_LABEL[data.current_division] ?? data.current_division}</Badge>}
                  <span className="text-slate-400">Nv {data.level} · {data.xp.toLocaleString("pt-BR")} XP</span>
                </div>
              </div>
              <div className="min-w-44 rounded-xl border border-white/10 bg-slate-950/65 p-3 sm:text-right">
                <div className="flex items-center gap-2 text-xs text-slate-400 sm:justify-end"><ShieldCheck className="h-4 w-4 text-emerald-300" />Confiança da diretoria</div>
                <p className={`mt-1 text-lg font-black ${confidence?.tone === "danger" ? "text-red-300" : confidence?.tone === "warn" ? "text-orange-300" : "text-emerald-300"}`}>{confidence?.label ?? "Calculando..."}</p>
                {confidence && <><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400" style={{ width: `${confidence.score}%` }} /></div><p className="mt-1 text-[11px] text-slate-400">{confidence.score}/100</p></>}
              </div>
            </div>
            <div className="grid border-t border-white/10 bg-slate-950/35 sm:grid-cols-3">
              <CareerHighlight icon={<CalendarDays className="h-4 w-4" />} label="Vínculo atual" value={`${data.seasons_at_current_club} temporada${data.seasons_at_current_club === 1 ? "" : "s"}`} />
              <CareerHighlight icon={<Target className="h-4 w-4" />} label="Posição atual" value={confidence?.position && confidence.totalTeams ? `${confidence.position}º de ${confidence.totalTeams}` : "Em preparação"} />
              <CareerHighlight icon={<Crown className="h-4 w-4" />} label="Última temporada" value={data.last_final_position ? `${data.last_final_position}º lugar` : "Primeira jornada"} />
            </div>
          </section>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MiniStat label="Clubes dirigidos" value={data.totals.clubs} />
            <MiniStat label="Temporadas" value={data.totals.seasons} />
            <MiniStat label="Títulos" value={data.totals.titles} accent="amber" />
            <MiniStat label="Acessos" value={data.totals.promotions} accent="emerald" />
            <MiniStat label="Rebaixamentos" value={data.totals.relegations} accent="red" />
            <MiniStat label="Demissões" value={data.totals.dismissals} accent="orange" />
          </div>

          {offersData && offersData.offers.length > 0 && (
            <Card className="mb-3 border-primary/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Handshake className="h-4 w-4 text-primary" />
                  Propostas recebidas ({offersData.offers.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3">
                {offersData.offers.map((o) => (
                  <OfferCard key={o.id} offer={o} />
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden border-violet-400/30 bg-slate-950/85">
            <CardHeader className="border-b border-white/10 pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Medal className="h-4 w-4 text-amber-300" />Linha do tempo</CardTitle>
              <p className="text-xs text-slate-400">Marcos que construíram sua reputação no futebol das criaturas.</p>
            </CardHeader>
            <CardContent className="p-0">
              {data.entries.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Ainda sem histórico registrado.</p>
              ) : (
                <ul className="divide-y divide-violet-300/15">
                  {data.entries.map((e) => {
                    const meta = EVENT_META[e.event];
                    const Icon = meta.Icon;
                    return (
                      <li key={e.id} className="relative flex items-start gap-3 p-4 transition-colors hover:bg-violet-400/[0.04]">
                        <div className="mt-0.5 rounded-lg border border-violet-300/25 bg-violet-400/[0.08] p-2">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-bold text-white">{e.team_name}</span>
                            <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>
                              {meta.label}
                            </Badge>
                            <Badge variant="outline" className="border-slate-400/60 bg-slate-900/80 text-[10px] text-slate-100">
                              {DIV_LABEL[e.division] ?? e.division}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Temporada {e.season_start}
                            {e.season_end && e.season_end !== e.season_start ? `–${e.season_end}` : ""}
                            {e.final_position ? ` · ${e.final_position}º lugar` : ""}
                            {e.title ? ` · ${e.title}` : ""}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </GamePageShell>
  );
}

function OfferCard({ offer }: { offer: JobOffer }) {
  const qc = useQueryClient();
  const declineFn = useServerFn(declineOffer);
  const [open, setOpen] = useState(false);

  const declineMut = useMutation({
    mutationFn: () => declineFn({ data: { offerId: offer.id } }),
    onSuccess: () => {
      toast.success(`Proposta do ${offer.team_name} recusada`);
      qc.invalidateQueries({ queryKey: ["career", "offers"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao recusar"),
  });

  return (
    <>
      <div className="rounded-md border bg-card p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{offer.team_name}</span>
          <Badge variant="outline" className="border-slate-400/60 bg-slate-900/80 text-[10px] text-slate-100">
            {DIV_LABEL[offer.division] ?? offer.division}
          </Badge>
          <Badge variant="outline" className="border-slate-400/60 bg-slate-900/80 text-[10px] text-slate-100">
            {REASON_LABEL[offer.reason]}
          </Badge>
        </div>
        {offer.message && (
          <p className="mt-1 text-xs text-muted-foreground">{offer.message}</p>
        )}
        <p className="mt-1 text-xs">
          Bônus de contratação: <span className="font-semibold text-emerald-300">
            R$ {Math.round(offer.signing_bonus).toLocaleString("pt-BR")}
          </span>
        </p>
        <p className="mt-1 text-xs text-cyan-300">
          Estrutura oferecida: {OFFER_INFRASTRUCTURE[offer.division] ?? "Estrutura do clube"}
        </p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => setOpen(true)}>
            Aceitar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => declineMut.mutate()}
            disabled={declineMut.isPending}
          >
            Recusar
          </Button>
        </div>
      </div>
      {open && <AcceptDialog offer={offer} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function AcceptDialog({
  offer,
  open,
  onOpenChange,
}: {
  offer: JobOffer;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const acceptFn = useServerFn(acceptOffer);

  const acceptMut = useMutation({
    mutationFn: () => acceptFn({ data: { offerId: offer.id } }),
    onSuccess: (res: any) => {
      toast.success(`Bem-vindo ao ${res.new_team_name}!`, {
        description: `Bônus de R$ ${Math.round(res.signing_bonus).toLocaleString("pt-BR")} recebido. O elenco permanece vinculado a cada clube.`,
      });
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aceitar proposta"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>Aceitar proposta do {offer.team_name}</DialogTitle>
          <DialogDescription>
            As criaturas e a infraestrutura permanecem vinculadas aos clubes. Você assumirá o elenco completo do novo time.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs">
          <p className="font-semibold text-cyan-200">O novo clube oferece</p>
          <p className="mt-1 text-muted-foreground">{OFFER_INFRASTRUCTURE[offer.division] ?? "Infraestrutura compatível com a divisão"}</p>
          <p className="mt-2 text-amber-200">Estádio, CT e Centro Médico não acompanham o treinador na transferência.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => acceptMut.mutate()}
            disabled={acceptMut.isPending}
          >
            {acceptMut.isPending ? "Assinando..." : "Confirmar transferência"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber" | "emerald" | "red" | "orange";
}) {
  const tone =
    accent === "amber"   ? "text-amber-300"   :
    accent === "emerald" ? "text-emerald-300" :
    accent === "red"     ? "text-red-300"     :
    accent === "orange"  ? "text-orange-300"  : "text-slate-100";
  return (
    <div className="rounded-md border border-violet-400/35 bg-slate-950/85 p-2 text-center shadow-[0_8px_18px_rgba(2,6,23,0.25)]">
      <div className={`text-lg font-semibold leading-none ${tone}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function CareerHighlight({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 border-white/10 px-4 py-3 sm:border-r last:border-r-0">
      <div className="text-violet-300">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="truncate text-sm font-bold text-slate-100">{value}</p>
      </div>
    </div>
  );
}
