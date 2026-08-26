import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BriefcaseBusiness, CheckCheck, ChevronRight, Inbox, MailOpen, Trash2 } from "lucide-react";
import { listMessages, markMessageRead, markAllRead, deleteMessage } from "@/lib/messages.functions";
import { acceptOffer, declineOffer, listOffers, type JobOffer } from "@/lib/career.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { GamePageShell } from "@/components/GamePageShell";
import { GameRecovery } from "@/components/GameRecovery";

const DIV_LABEL: Record<string, string> = { lendaria: "1ª — Lendária", diamante: "2ª — Diamante", ouro: "3ª — Ouro", prata: "4ª — Prata", bronze: "5ª — Bronze" };
const money = (value: number) => `$ ${Math.round(value).toLocaleString("pt-BR")}`;
const structure = (offer: JobOffer) => {
  const b = offer.buildings ?? {};
  return `Estádio ${b.estadio ?? "—"} · CT ${b.ct_treino ?? "—"} · Centro Médico ${b.centro_medico ?? "—"}${b.ct_elemental ? ` · CT Elemental ${b.ct_elemental}` : ""}`;
};

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [{ title: "Caixa de mensagens — Monster Club Manager" }, { name: "description", content: "Novidades, propostas e avisos da sua academia." }] }),
  component: MessagesPage,
  errorComponent: () => <GameRecovery area="a central do clube" />,
});

function MessagesPage() {
  const fetchList = useServerFn(listMessages);
  const fetchOffers = useServerFn(listOffers);
  const readOne = useServerFn(markMessageRead);
  const readAll = useServerFn(markAllRead);
  const delOne = useServerFn(deleteMessage);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<JobOffer | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["messages"], queryFn: () => fetchList({}) });
  const { data: offersData } = useQuery({ queryKey: ["career", "offers"], queryFn: () => fetchOffers() });
  const offers = offersData?.offers ?? [];
  const expiredOffers = offersData?.expired_offers ?? [];
  const visibleMessages = (data?.messages ?? []).filter((m: any) => !(offers.length > 0 && m.kind === "career" && /proposta/i.test(m.title)));
  const invalidate = () => qc.invalidateQueries({ queryKey: ["messages"] });
  const readMut = useMutation({ mutationFn: (id: string) => readOne({ data: { id } }), onSuccess: invalidate });
  const readAllMut = useMutation({ mutationFn: () => readAll({}), onSuccess: () => { toast.success("Todas marcadas como lidas"); invalidate(); } });
  const delMut = useMutation({ mutationFn: (id: string) => delOne({ data: { id } }), onSuccess: invalidate });

  function openMessage(message: any) { setSelected(message); if (!message.read) readMut.mutate(message.id); }
  function openOffer(offer: JobOffer) {
    setSelectedOffer(offer);
    const notice = data?.messages.find((m: any) => m.kind === "career" && /proposta/i.test(m.title));
    if (notice && !notice.read) readMut.mutate(notice.id);
  }

  return (
    <GamePageShell title="Caixa de mensagens" subtitle="Novidades e decisões importantes do clube" maxWidth="4xl">
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-violet-400/25 bg-slate-950/75 p-3 text-white shadow-lg backdrop-blur-md sm:p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-400/10 text-cyan-200"><Inbox className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><p className="font-semibold">Central do clube</p><p className="text-xs text-slate-400">{data ? `${data.unread} não lida(s)` : "Carregando..."}</p></div>
        <Button size="sm" variant="outline" className="shrink-0 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={!data?.unread || readAllMut.isPending} onClick={() => readAllMut.mutate()}><CheckCheck className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Marcar todas</span><span className="sm:hidden">Ler todas</span></Button>
      </div>
      <div className="space-y-3">
        {isLoading && <Skeleton className="h-28 w-full" />}
        {offers.map((offer) => (
          <button key={offer.id} type="button" onClick={() => openOffer(offer)} className="group flex w-full items-center gap-3 rounded-xl border border-violet-400/35 bg-gradient-to-r from-slate-950/95 via-slate-900/95 to-indigo-950/90 p-4 text-left text-white shadow-lg transition hover:border-violet-300/65">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-300/35 bg-violet-400/10 text-violet-200"><BriefcaseBusiness className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Proposta do {offer.team_name}</span><Badge className="border-violet-300/30 bg-violet-400/15 text-violet-100">{DIV_LABEL[offer.division] ?? offer.division}</Badge></div><p className="mt-1 line-clamp-2 text-sm text-slate-300">{offer.message || "O clube quer conversar sobre a próxima temporada."}</p><p className="mt-1 text-xs text-emerald-300">Bônus: $ {Math.round(offer.signing_bonus).toLocaleString("pt-BR")}</p></div>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-500 group-hover:text-violet-200" />
          </button>
        ))}
        {expiredOffers.map((offer) => <div key={offer.id} className="flex w-full items-center gap-3 rounded-xl border border-red-400/25 bg-slate-950/80 p-4 text-white opacity-80"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-300/25 bg-red-400/10 text-red-300"><BriefcaseBusiness className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Proposta do {offer.team_name}</span><Badge className="border-red-300/30 bg-red-400/15 text-red-100">Rejeitada por tempo</Badge></div><p className="mt-1 text-sm text-slate-400">O prazo terminou após 2 partidas oficiais.</p></div></div>)}
        {visibleMessages.map((m: any) => (
          <div key={m.id} className={`group flex items-center gap-3 rounded-xl border bg-slate-950/85 p-4 text-white shadow-lg backdrop-blur-md ${m.read ? "border-white/10" : "border-cyan-300/40"}`}>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openMessage(m)}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${m.read ? "border-white/10 bg-white/5 text-slate-400" : "border-cyan-300/35 bg-cyan-400/10 text-cyan-200"}`}><MailOpen className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate font-semibold">{m.title}</span>{!m.read && <Badge className="bg-cyan-500 text-slate-950">Nova</Badge>}</div><p className="mt-1 truncate text-sm text-slate-400">{m.body}</p><p className="mt-1 text-[11px] text-slate-500">{new Date(m.created_at).toLocaleString("pt-BR")}</p></div><ChevronRight className="h-5 w-5 shrink-0 text-slate-500" />
            </button>
            <Button size="icon" variant="ghost" aria-label="Excluir mensagem" className="shrink-0 text-slate-500 hover:bg-red-500/10 hover:text-red-300" disabled={delMut.isPending} onClick={() => delMut.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {!isLoading && offers.length === 0 && expiredOffers.length === 0 && visibleMessages.length === 0 && <div className="rounded-xl border border-white/10 bg-slate-950/75 px-4 py-14 text-center text-sm text-slate-400"><Inbox className="mx-auto mb-3 h-8 w-8 opacity-60" />Nenhuma novidade no momento.</div>}
      </div>
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg border-violet-400/35 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white"><DialogHeader className="text-left"><Badge className="mb-2 w-fit border-cyan-300/30 bg-cyan-400/10 text-cyan-100">{selected?.kind}</Badge><DialogTitle className="pr-6 text-white">{selected?.title}</DialogTitle><DialogDescription className="text-slate-400">{selected && new Date(selected.created_at).toLocaleString("pt-BR")}</DialogDescription></DialogHeader><div className="whitespace-pre-line rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-relaxed text-slate-200">{selected?.body}</div><DialogFooter><Button onClick={() => setSelected(null)}>Fechar</Button></DialogFooter></DialogContent>
      </Dialog>
      {selectedOffer && <OfferDialog offer={selectedOffer} onClose={() => setSelectedOffer(null)} />}
    </GamePageShell>
  );
}

function OfferDialog({ offer, onClose }: { offer: JobOffer; onClose: () => void }) {
  const qc = useQueryClient();
  const acceptFn = useServerFn(acceptOffer);
  const declineFn = useServerFn(declineOffer);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["career", "offers"] }); qc.invalidateQueries({ queryKey: ["messages"] }); };
  const acceptMut = useMutation({ mutationFn: () => acceptFn({ data: { offerId: offer.id } }), onSuccess: (res: any) => { toast.success(`Bem-vindo ao ${res.new_team_name}!`); qc.invalidateQueries(); onClose(); }, onError: (e: any) => toast.error(e?.message ?? "Falha ao aceitar proposta") });
  const declineMut = useMutation({ mutationFn: () => declineFn({ data: { offerId: offer.id } }), onSuccess: () => { toast.success(`Proposta do ${offer.team_name} recusada`); refresh(); onClose(); }, onError: (e: any) => toast.error(e?.message ?? "Falha ao recusar proposta") });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto border-violet-400/35 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
        <DialogHeader className="text-left"><Badge className="mb-2 w-fit bg-violet-500/20 text-violet-100">Proposta · {DIV_LABEL[offer.division] ?? offer.division}</Badge><DialogTitle className="pr-6 text-white">{offer.team_name} quer contratar você</DialogTitle><DialogDescription className="text-slate-300">{offer.message || "Analise as condições para comandar o novo clube."}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3 text-sm"><p className="text-xs uppercase tracking-wide text-emerald-300">Bônus para assinar</p><p className="mt-1 font-bold text-white">{money(offer.signing_bonus)}</p></div><div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3 text-sm"><p className="text-xs uppercase tracking-wide text-amber-300">Caixa do clube</p><p className="mt-1 font-bold text-white">{money(offer.club_cash)}</p></div></div>
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.07] p-3 text-sm"><p className="font-semibold text-cyan-200">Situação do clube</p><p className="mt-1 text-slate-300">Construções: {structure(offer)}</p><p className="mt-1 text-slate-300">Campeonato: {offer.league_position ? `${offer.league_position}º de ${offer.league_size}` : "ainda sem classificação"}</p></div>
        <p className="rounded-lg border border-violet-300/20 bg-violet-400/[0.06] p-3 text-xs text-violet-100">O elenco pertence ao clube. Ao mudar, você deixa todas as criaturas atuais e assume o elenco completo do {offer.team_name}. Prazo: {offer.matches_until_expiry} partida(s) oficial(is).</p>
        <DialogFooter className="grid gap-2 sm:grid-cols-3"><Button variant="ghost" className="text-red-300 hover:bg-red-500/10 hover:text-red-200" disabled={declineMut.isPending} onClick={() => declineMut.mutate()}>Recusar</Button><Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={onClose}>Decidir depois</Button><Button disabled={acceptMut.isPending} onClick={() => acceptMut.mutate()}>{acceptMut.isPending ? "Assinando..." : "Aceitar proposta"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
