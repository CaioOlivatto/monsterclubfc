import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getMarketWithSession, buyCreatureWithSession, buyPremiumCreatureWithSession, sellCreatureWithSession, refreshMarketWithSession, useMarketScoutWithSession } from "@/lib/market.functions";
import { supabase } from "@/integrations/supabase/client";
import { GameLogo } from "@/components/GameLogo";
import { TeamCrest } from "@/components/TeamCrest";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Coins, Store, Users, Star, Sparkles, Gem, RefreshCw, Search } from "lucide-react";
import { StarRating, overallToStars, halfStarsToStars } from "@/components/StarRating";

export const Route = createFileRoute("/_authenticated/market")({
  head: () => ({
    meta: [
      { title: "Mercado — Monster Club Manager" },
      {
        name: "description",
        content: "Compre e venda criaturas para reforçar seu elenco.",
      },
      { property: "og:title", content: "Mercado — Monster Club Manager" },
      {
        property: "og:description",
        content: "Ofertas rotativas de criaturas de outras academias.",
      },
    ],
  }),
  component: MarketPage,
});

const ELEMENT_COLORS: Record<string, string> = {
  fogo: "bg-red-500/15 text-red-300 border-red-500/30",
  agua: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  terra: "bg-amber-700/20 text-amber-300 border-amber-700/40",
  ar: "bg-sky-400/15 text-sky-200 border-sky-400/30",
  gelo: "bg-cyan-300/15 text-cyan-100 border-cyan-300/30",
};

const POSITION_BADGE_CLASS =
  "border-violet-400/60 bg-violet-500/20 text-violet-100";
const AGE_BADGE_CLASS =
  "border-slate-500/80 bg-slate-800/90 text-slate-100";

const ELEMENT_LABEL: Record<string, string> = {
  fogo: "Fogo",
  agua: "Água",
  terra: "Terra",
  ar: "Ar",
  gelo: "Gelo",
};

function formatMoney(n: number) {
  return `$${n.toLocaleString("pt-BR")}`;
}

function Stars({ overall }: { overall: number }) {
  return <StarRating value={overallToStars(overall)} size={0.75} />;
}

function MarketPage() {
  const qc = useQueryClient();
  const fetchMarket = useServerFn(getMarketWithSession);
  const buyFn = useServerFn(buyCreatureWithSession);
  const buyPremiumFn = useServerFn(buyPremiumCreatureWithSession);
  const sellFn = useServerFn(sellCreatureWithSession);
  const refreshFn = useServerFn(refreshMarketWithSession);
  const scoutFn = useServerFn(useMarketScoutWithSession);

  const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
    return data.session.access_token;
  };

  const { data, isLoading, error: marketError, refetch } = useQuery({
    queryKey: ["market"],
    queryFn: async () => fetchMarket({ data: { access_token: await getAccessToken() } }),
    staleTime: 30_000,
  });

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [elementFilter, setElementFilter] = useState<string>("all");
  const [posFilter, setPosFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("price");
  const [search, setSearch] = useState("");

  const [counter, setCounter] = useState<any | null>(null);

  const premiumBuyMut = useMutation({
    mutationFn: async (offer_id: string) => buyPremiumFn({ data: { offer_id, access_token: await getAccessToken() } }),
    onSuccess: async (res: any) => {
      toast.success(`${res.name} foi contratado por ${res.price.toLocaleString("pt-BR")} gemas.`);
      await qc.invalidateQueries({ queryKey: ["market"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível concluir a contratação premium."),
  });

  const buyMut = useMutation({
    mutationFn: async (vars: { listing_id: string; accept_counter?: boolean; currency?: "money" | "gems" }) =>
      buyFn({ data: { ...vars, access_token: await getAccessToken() } }),
    onSuccess: (res: any) => {
      if (res.refused) {
        if (res.counter_offer) {
          setCounter({ ...res.counter_offer, name: res.name, message: res.message });
        } else {
          toast.error(res.message);
        }
        return;
      }
      setCounter(null);
      // Remoção otimista imediata da oferta
      qc.setQueryData(["market"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          listings: (old.listings ?? []).filter((l: any) => l.name !== res.name || l.price !== res.price),
          payroll: res.payroll_after,
          money: res.currency === "gems" ? old.money : (old.money ?? 0) - res.price,
          gems: res.currency === "gems" ? (old.gems ?? 0) - res.price : old.gems,
          roster_count: res.roster_count_after,
        };
      });
      const ELEMENT_LABEL: Record<string, string> = {
        fogo: "Fogo", agua: "Água", terra: "Terra", ar: "Ar", gelo: "Gelo",
      };
      const remainingCap = Math.max(0, res.salary_cap - res.payroll_after);
      const vagas = Math.max(0, res.roster_slots - res.roster_count_after);
      toast.success(`🎉 Parabéns! ${res.name} agora faz parte do seu elenco!`, {
        duration: 8000,
        description: (
          <div className="mt-1 space-y-0.5 text-xs">
            <p>
              <span className="font-medium">{ELEMENT_LABEL[res.element] ?? res.element}</span>
              {" · "}{res.position}{" · "}
              <span className="inline-flex items-center gap-1"><StarRating value={res.stars} size={0.75} /></span>
            </p>
            <p>Salário: <span className="font-medium">{formatMoney((res as any).salary_per_match ?? Math.round(res.salary / 26))}/partida</span> <span className="text-muted-foreground">({formatMoney(res.salary)}/temporada)</span></p>
            <p>
              Folha: {formatMoney(res.payroll_after)} / {formatMoney(res.salary_cap)}
              {" "}<span className="text-muted-foreground">(resta {formatMoney(remainingCap)})</span>
            </p>
            <p>Elenco: {res.roster_count_after}/{res.roster_slots} <span className="text-muted-foreground">({vagas} vagas livres)</span></p>
          </div>
        ) as any,
      });
      qc.invalidateQueries({ queryKey: ["market"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMut = useMutation({
    mutationFn: async () => refreshFn({ data: { access_token: await getAccessToken(), idempotency_key: crypto.randomUUID() } }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["market"] }); toast.success("Novas ofertas chegaram ao Mercado."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const scoutMut = useMutation({
    mutationFn: async (position: "GOL" | "DEF" | "MEI" | "ATA") => scoutFn({ data: { access_token: await getAccessToken(), position, idempotency_key: crypto.randomUUID() } }),
    onSuccess: async (_, position) => { await qc.invalidateQueries({ queryKey: ["market"] }); toast.success(`Olheiro focado em ${position} aplicado.`); },
    onError: (error: Error) => toast.error(error.message),
  });

  const sellMut = useMutation({
    mutationFn: async (creature_id: string) => sellFn({ data: { creature_id, access_token: await getAccessToken() } }),
    onSuccess: (res) => {
      toast.success(`Vendido: ${res.sold}`, {
        description: `Você recebeu ${formatMoney(res.amount)}`,
      });
      qc.invalidateQueries({ queryKey: ["market"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredListings = useMemo(() => {
    const list = data?.listings ?? [];
    let out = list.filter((l) => {
      if (elementFilter !== "all" && l.element !== elementFilter) return false;
      if (posFilter !== "all" && l.suggested_position !== posFilter) return false;
      if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sortBy === "price") return a.price - b.price;
      if (sortBy === "overall") return b.overall - a.overall;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return 0;
    });
    return out;
  }, [data, elementFilter, posFilter, sortBy, search]);

  const filteredMine = useMemo(() => {
    const list = data?.my_creatures ?? [];
    let out = list.filter((c) => {
      if (elementFilter !== "all" && c.element !== elementFilter) return false;
      if (posFilter !== "all" && c.suggested_position !== posFilter) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sortBy === "price") return (b.market_value ?? 0) - (a.market_value ?? 0);
      if (sortBy === "overall") return b.overall - a.overall;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return 0;
    });
    return out;
  }, [data, elementFilter, posFilter, sortBy, search]);

  return (
    <div className="min-h-screen bg-[#020617] pb-24 text-white">
      <div className="fixed inset-0 -z-0 bg-[url('/assets/monster-stadium.webp')] bg-cover bg-center bg-fixed opacity-25" />
      <div className="fixed inset-0 -z-0 bg-gradient-to-b from-[#020617] via-[#020617]/90 to-[#020617]/75" />
      <header className="sticky top-0 z-20 border-b border-violet-500/35 bg-slate-950/90 shadow-[0_4px_24px_rgba(76,29,149,0.28)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:px-4">
          <GameLogo size="xs" className="shrink-0" />
          <TeamCrest teamName={(data as any)?.trainer?.academyName ?? null} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Academia</p>
            <h1 className="truncate text-base font-bold sm:text-lg">{(data as any)?.trainer?.academyName ?? "Mercado"}</h1>
            <p className="truncate text-[11px] text-slate-400">{(data as any)?.trainer ? `${(data as any).trainer.name} · Nível ${(data as any).trainer.level}` : "Ofertas rotativas"}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex h-10 items-center gap-2 rounded-lg border border-violet-400/25 bg-slate-900/80 px-3 text-sm font-bold"><Gem className="h-4 w-4 fill-violet-400/25 text-violet-300" />{(data?.gems ?? 0).toLocaleString("pt-BR")}</div>
            <div className="hidden h-10 items-center gap-2 rounded-lg border border-amber-400/25 bg-slate-900/80 px-3 text-sm font-bold sm:flex"><Coins className="h-4 w-4 text-amber-400" />{formatMoney(data?.money ?? 0)}</div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl space-y-3 p-2.5 sm:space-y-4 sm:p-4">
        {marketError && (
          <Card className="border-red-500/50 bg-red-950/80 text-white">
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-red-200">Não foi possível carregar o Mercado.</p>
                <p className="text-xs text-red-100/80">{marketError instanceof Error ? marketError.message : "Falha inesperada ao consultar os dados."}</p>
              </div>
              <Button variant="outline" onClick={() => refetch()} className="border-red-300/40 bg-slate-950 text-white hover:bg-red-900">
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}
        <Card className="border-violet-400/30 bg-slate-950/85 text-white shadow-xl backdrop-blur-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Elenco:</span>
              <span className="font-semibold">
                {data?.roster_count ?? 0}/{data?.roster_slots ?? 0}
              </span>
            </div>
            {data?.division && (
              <div className="text-xs text-muted-foreground">
                Divisão: <span className="font-medium capitalize">{data.division}</span>
                {" · "}Até <span className="inline-flex items-center gap-1 align-middle"><StarRating value={halfStarsToStars(data.max_band ?? 0)} size={0.75} /></span>
              </div>
            )}
            {typeof data?.payroll === "number" && (
              <div className="text-xs text-muted-foreground">
                Folha: <span className="font-medium">{formatMoney(data.payroll)}</span>
                {" / "}{formatMoney(data.salary_cap ?? 0)}
              </div>
            )}
            {data?.rotation_label && (
              <p className="w-full text-xs text-muted-foreground">{data.rotation_label}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-cyan-400/25 bg-slate-950/85 text-white shadow-xl">
          <CardContent className="space-y-3 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold">Rotação de ofertas</p>
                <p className="text-xs text-slate-400">O mercado muda sozinho a cada 12 horas. Atualizações extras ficam progressivamente mais caras.</p>
              </div>
              <Button disabled={refreshMut.isPending} onClick={() => refreshMut.mutate()} className="border border-cyan-400/30 bg-cyan-950/80 text-cyan-100 hover:bg-cyan-900">
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshMut.isPending ? "animate-spin" : ""}`} />
                Atualizar · {data?.next_refresh_cost?.currency === "free" ? "grátis" : data?.next_refresh_cost?.currency === "money" ? formatMoney(data.next_refresh_cost.amount) : `${data?.next_refresh_cost?.amount ?? 0} gemas`}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
              <span className="mr-1 flex items-center gap-1 text-xs text-slate-400"><Search className="h-3.5 w-3.5" /> Olheiro por posição · 10 gemas:</span>
              {(["GOL", "DEF", "MEI", "ATA"] as const).map((position) => (
                <Button key={position} size="sm" variant="outline" disabled={scoutMut.isPending || (data?.gems ?? 0) < 10} onClick={() => scoutMut.mutate(position)} className={data?.market_cycle?.scout_position === position ? "border-violet-400 bg-violet-700 text-white" : "border-slate-600 bg-slate-900 text-slate-100"}>{position}</Button>
              ))}
            </div>
          </CardContent>
        </Card>


        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={tab === "buy" ? "default" : "outline"}
            onClick={() => setTab("buy")}
            className="h-11 border border-violet-400/30 bg-violet-700 text-white hover:bg-violet-600"
          >
            <Store className="mr-2 h-4 w-4" />
            Comprar
          </Button>
          <Button
            variant={tab === "sell" ? "default" : "outline"}
            onClick={() => setTab("sell")}
            className="h-11 border border-slate-600 bg-slate-900/90 text-slate-100 hover:bg-slate-800"
          >
            <Coins className="mr-2 h-4 w-4" />
            Vender
          </Button>
        </div>

        {tab === "buy" && data?.premium_offer && (
          <Card className="overflow-hidden border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-slate-950/95 to-violet-500/10 text-white shadow-xl">
            <CardHeader className="space-y-2 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge className="gap-1 bg-amber-400 text-amber-950 hover:bg-amber-400">
                  <Sparkles className="h-3.5 w-3.5" /> Oferta rara da temporada
                </Badge>
                <span className="text-lg font-black text-amber-300">
                  {data.premium_offer.gem_price.toLocaleString("pt-BR")} gemas
                </span>
              </div>
              <CardTitle className="text-xl">{data.premium_offer.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={ELEMENT_COLORS[data.premium_offer.element]}>
                  {ELEMENT_LABEL[data.premium_offer.element]}
                </Badge>
                <Badge variant="outline" className={POSITION_BADGE_CLASS}>
                  {data.premium_offer.suggested_position}
                </Badge>
                <Badge variant="outline" className={AGE_BADGE_CLASS}>
                  18 anos
                </Badge>
                <Stars overall={data.premium_offer.overall} />
                <span className="text-sm font-bold">OVR {data.premium_offer.overall}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {data.premium_offer.premium_tier_label}. Jovem prodígio de 18 anos selecionado pelo olheiro premium.
                Limite de uma contratação premium por temporada e divisão. A oferta não concede vantagem oculta e entra normalmente no cálculo de força.
              </p>
              <Button
                className="w-full bg-amber-400 font-black text-amber-950 hover:bg-amber-300"
                disabled={premiumBuyMut.isPending || (data.gems ?? 0) < data.premium_offer.gem_price}
                onClick={() => premiumBuyMut.mutate(data.premium_offer.id)}
              >
                {premiumBuyMut.isPending
                  ? "Contratando com segurança..."
                  : `Contratar por ${data.premium_offer.gem_price.toLocaleString("pt-BR")} gemas`}
              </Button>
            </CardContent>
          </Card>
        )}

        {tab === "buy" && data?.premium_offer_used && (
          <Card className="border-dashed border-slate-600 bg-slate-950/85 text-slate-200">
            <CardContent className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Star className="h-4 w-4 text-amber-400" />
              A contratação premium desta temporada e divisão já foi utilizada.
            </CardContent>
          </Card>
        )}

        <Card className="border-violet-400/30 bg-slate-950/85 text-white shadow-xl backdrop-blur-sm">
          <CardContent className="space-y-3 py-4">
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-slate-600 bg-slate-900/90 text-white placeholder:text-slate-500"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Select value={elementFilter} onValueChange={setElementFilter}>
                <SelectTrigger className="border-slate-600 bg-slate-900/90 text-white">
                  <SelectValue placeholder="Elemento" />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-950 text-white">
                  <SelectItem value="all">Todos elementos</SelectItem>
                  {Object.entries(ELEMENT_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={posFilter} onValueChange={setPosFilter}>
                <SelectTrigger className="border-slate-600 bg-slate-900/90 text-white">
                  <SelectValue placeholder="Posição" />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-950 text-white">
                  <SelectItem value="all">Todas posições</SelectItem>
                  <SelectItem value="Goleiro">Goleiro</SelectItem>
                  <SelectItem value="Zagueiro">Zagueiro</SelectItem>
                  <SelectItem value="Meio-campo">Meio-campo</SelectItem>
                  <SelectItem value="Atacante">Atacante</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="border-slate-600 bg-slate-900/90 text-white">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-950 text-white">
                  <SelectItem value="price">Preço</SelectItem>
                  <SelectItem value="overall">Overall</SelectItem>
                  <SelectItem value="name">Nome</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {tab === "buy" ? (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando ofertas...</p>}
            {!isLoading && filteredListings.length === 0 && (
              <Card className="border-slate-700 bg-slate-950/85 text-slate-300">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma oferta corresponde aos filtros.
                </CardContent>
              </Card>
            )}
            {filteredListings.map((l: any) => {
              const canAfford = (data?.money ?? 0) >= l.price;
              const rosterFull = (data?.roster_count ?? 0) >= (data?.roster_slots ?? 0);
              const salary = l.salary ?? 0;
              const currentPayroll = data?.payroll ?? 0;
              const cap = data?.salary_cap ?? 0;
              const newPayroll = currentPayroll + salary;
              const cashAfter = (data?.money ?? 0) - l.price;
              const reserve = data?.minimum_operating_reserve ?? 0;
              const belowReserve = canAfford && cashAfter < reserve;
              const overCap = newPayroll > cap;
              const disabled = !canAfford || rosterFull || overCap || buyMut.isPending;
              const btnLabel = rosterFull
                ? "Cheio"
                : overCap
                ? "Folha"
                : !canAfford
                ? "Sem $"
                : "Comprar";
              return (
                <Card key={l.id} className="border-violet-400/25 bg-slate-950/90 text-white shadow-lg">
                  <CardContent className="space-y-2 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold truncate">{l.name}</p>
                          {l.is_prodigy && (
                            <Badge variant="outline" className="border-amber-400/60 bg-amber-400/15 text-amber-200 text-[10px] gap-1 px-1.5">
                              <Sparkles className="h-3 w-3" /> Prodígio
                            </Badge>
                          )}
                          <Badge variant="outline" className={ELEMENT_COLORS[l.element]}>
                            {ELEMENT_LABEL[l.element]}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${POSITION_BADGE_CLASS}`}>
                            {l.suggested_position}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${AGE_BADGE_CLASS}`}>
                            {l.age} anos
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <Stars overall={l.overall} />
                          <span>OVR {l.overall}</span>
                          <span className="truncate">de {l.seller}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1 text-right">
                        <Button size="sm" className="h-8" disabled={disabled} onClick={() => buyMut.mutate({ listing_id: l.id, currency: "money" })}>{btnLabel} {formatMoney(l.price)}</Button>
                        <Button size="sm" variant="outline" className="h-8 border-violet-400/50 bg-violet-950/70 text-violet-100" disabled={rosterFull || overCap || buyMut.isPending || (data?.gems ?? 0) < l.gem_price} onClick={() => buyMut.mutate({ listing_id: l.id, currency: "gems" })}><Gem className="mr-1 h-3.5 w-3.5" />{l.gem_price}</Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs">
                      <span>
                        <span className="text-muted-foreground">Preço:</span>{" "}
                        <span className="font-semibold text-amber-300">{formatMoney(l.price)}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Salário:</span>{" "}
                        <span className="font-semibold">{formatMoney(l.salary_per_match ?? Math.round(salary / 26))}/partida</span>
                        <span className="ml-1 text-muted-foreground">({formatMoney(salary)}/temp)</span>
                      </span>
                    </div>
                    <p className={`text-[11px] ${overCap ? "text-red-400" : "text-muted-foreground"}`}>
                      Folha passaria de {formatMoney(currentPayroll)} para {formatMoney(newPayroll)}
                      {" "}(limite: {formatMoney(cap)})
                      {overCap && " — teto de folha estourado."}
                    </p>
                    {canAfford && (
                      <p className={`text-[11px] ${belowReserve ? "text-amber-400" : "text-emerald-400"}`}>
                        Caixa após a compra: {formatMoney(cashAfter)}. Reserva recomendada para 5 jogos: {formatMoney(reserve)}.
                        {belowReserve && " A contratação deixa o clube financeiramente exposto."}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando elenco...</p>}
            {!isLoading && filteredMine.length === 0 && (
              <Card className="border-slate-700 bg-slate-950/85 text-slate-300">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma criatura corresponde aos filtros.
                </CardContent>
              </Card>
            )}
            {filteredMine.map((c) => {
              const sellPrice = (c as any).sell_price ?? Math.round((c.market_value * 0.9) / 100) * 100;
              const canSell = (data?.roster_count ?? 0) > 11;
              return (
                <Card key={c.id} className="border-violet-400/25 bg-slate-950/90 text-white shadow-lg">
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold truncate">{c.name}</p>
                        {(c as any).is_prodigy && (
                          <Badge variant="outline" className="border-amber-400/60 bg-amber-400/15 text-amber-200 text-[10px] gap-1 px-1.5">
                            <Sparkles className="h-3 w-3" /> Prodígio
                          </Badge>
                        )}
                        <Badge variant="outline" className={ELEMENT_COLORS[c.element]}>
                          {ELEMENT_LABEL[c.element]}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${POSITION_BADGE_CLASS}`}>
                          {c.suggested_position}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${AGE_BADGE_CLASS}`}>
                          {c.age} anos
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <Stars overall={c.overall} />
                        <span>OVR {c.overall}</span>
                        <span>Energia {c.energy}%</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">Oferta</p>
                      <p className="text-sm font-bold text-emerald-300">
                        {formatMoney(sellPrice)}
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-1 h-7"
                        disabled={!canSell || sellMut.isPending}
                        onClick={() => {
                          if (confirm(`Vender ${c.name} por ${formatMoney(sellPrice)}?`)) {
                            sellMut.mutate(c.id);
                          }
                        }}
                      >
                        {!canSell ? "Mín. 11" : "Vender"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!counter} onOpenChange={(o) => !o && setCounter(null)}>
        <DialogContent className="max-w-sm border-violet-400/30 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle>{counter?.name}</DialogTitle>
            <DialogDescription>{counter?.message}</DialogDescription>
          </DialogHeader>
          {counter && (
            <div className="space-y-2 text-sm">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
                <p>
                  Passe: <span className="font-semibold">{formatMoney(counter.price)}</span>{" "}
                  <span className="text-muted-foreground line-through">{formatMoney(counter.base_price)}</span>{" "}
                  <span className="text-amber-300">(+50%)</span>
                </p>
                <p>
                  Salário: <span className="font-semibold">{formatMoney(counter.salary)}/temporada</span>{" "}
                  <span className="text-muted-foreground line-through">{formatMoney(counter.base_salary)}</span>{" "}
                  <span className="text-amber-300">(+50%)</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(counter.salary_per_match)}/partida · {counter.age} anos (veterano)
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Recusar não custa nada — a negociação simplesmente não avança.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setCounter(null)} disabled={buyMut.isPending}>
              Desistir
            </Button>
            <Button
              disabled={buyMut.isPending}
              onClick={() =>
                buyMut.mutate({ listing_id: counter.listing_id, accept_counter: true })
              }
            >
              Aceitar contraproposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
