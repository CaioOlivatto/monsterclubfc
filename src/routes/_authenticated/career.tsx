import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Award, Trophy, TrendingUp, TrendingDown, DoorOpen, Building2, Sparkles, Handshake, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getCareer, listOffers, declineOffer, acceptOffer, type CareerEntry, type JobOffer } from "@/lib/career.functions";
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
  const fetchOffers = useServerFn(listOffers);
  const { data, isLoading } = useQuery({ queryKey: ["career"], queryFn: () => fetchCareer() });
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

          <Card className="mb-3">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="h-4 w-4 text-primary" />
                {data.trainer_name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Clube atual</span>
                <span className="font-medium">
                  {data.current_team_name ?? "Sem clube"}
                  {data.current_division ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {DIV_LABEL[data.current_division] ?? data.current_division}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Nível do treinador</span>
                <span className="font-medium">Nv {data.level} · {data.xp.toLocaleString("pt-BR")} XP</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Temporadas no clube atual</span>
                <span className="font-medium">{data.seasons_at_current_club}</span>
              </div>
            </CardContent>
          </Card>

          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MiniStat label="Clubes" value={data.totals.clubs} />
            <MiniStat label="Temporadas" value={data.totals.seasons} />
            <MiniStat label="Títulos" value={data.totals.titles} accent="amber" />
            <MiniStat label="Promoções" value={data.totals.promotions} accent="emerald" />
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Trajetória</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.entries.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Ainda sem histórico registrado.</p>
              ) : (
                <ul className="divide-y">
                  {data.entries.map((e) => {
                    const meta = EVENT_META[e.event];
                    const Icon = meta.Icon;
                    return (
                      <li key={e.id} className="flex items-start gap-3 p-3">
                        <div className="mt-0.5 rounded-md border bg-muted/40 p-1.5">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{e.team_name}</span>
                            <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>
                              {meta.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
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
          <Badge variant="outline" className="text-[10px]">
            {DIV_LABEL[offer.division] ?? offer.division}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
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
    accent === "orange"  ? "text-orange-300"  : "text-foreground";
  return (
    <div className="rounded-md border bg-card p-2 text-center">
      <div className={`text-lg font-semibold leading-none ${tone}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
