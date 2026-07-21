import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getMarket, buyCreature, sellCreature } from "@/lib/market.functions";
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
import { ArrowLeft, Coins, Store, Users, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/market")({
  head: () => ({
    meta: [
      { title: "Mercado — Futebol de Criaturas" },
      {
        name: "description",
        content: "Compre e venda criaturas para reforçar seu elenco.",
      },
      { property: "og:title", content: "Mercado — Futebol de Criaturas" },
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
  const stars = overall / 20;
  return (
    <div className="flex items-center gap-0.5">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      <span className="text-xs font-semibold">{stars.toFixed(1)}</span>
    </div>
  );
}

function MarketPage() {
  const qc = useQueryClient();
  const fetchMarket = useServerFn(getMarket);
  const buyFn = useServerFn(buyCreature);
  const sellFn = useServerFn(sellCreature);

  const { data, isLoading } = useQuery({
    queryKey: ["market"],
    queryFn: () => fetchMarket(),
  });

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [elementFilter, setElementFilter] = useState<string>("all");
  const [posFilter, setPosFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("price");
  const [search, setSearch] = useState("");

  const buyMut = useMutation({
    mutationFn: (listing_id: string) => buyFn({ data: { listing_id } }),
    onSuccess: (res) => {
      toast.success(`Contratado: ${res.name}`, {
        description: `Custo ${formatMoney(res.price)}`,
      });
      qc.invalidateQueries({ queryKey: ["market"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sellMut = useMutation({
    mutationFn: (creature_id: string) => sellFn({ data: { creature_id } }),
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
    <div className="min-h-screen bg-background pb-8">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Button asChild size="icon" variant="ghost">
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-bold leading-tight">Mercado</h1>
              <p className="text-xs text-muted-foreground">Ofertas rotativas</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold">
              {isLoading ? "…" : formatMoney(data?.money ?? 0)}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Elenco:</span>
              <span className="font-semibold">
                {data?.roster_count ?? 0}/{data?.roster_slots ?? 0}
              </span>
            </div>
            {data?.rotation_label && (
              <p className="text-xs text-muted-foreground">{data.rotation_label}</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={tab === "buy" ? "default" : "outline"}
            onClick={() => setTab("buy")}
            className="h-11"
          >
            <Store className="mr-2 h-4 w-4" />
            Comprar
          </Button>
          <Button
            variant={tab === "sell" ? "default" : "outline"}
            onClick={() => setTab("sell")}
            className="h-11"
          >
            <Coins className="mr-2 h-4 w-4" />
            Vender
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-3 py-4">
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              <Select value={elementFilter} onValueChange={setElementFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Elemento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos elementos</SelectItem>
                  {Object.entries(ELEMENT_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={posFilter} onValueChange={setPosFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Posição" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas posições</SelectItem>
                  <SelectItem value="Goleiro">Goleiro</SelectItem>
                  <SelectItem value="Zagueiro">Zagueiro</SelectItem>
                  <SelectItem value="Meio-campo">Meio-campo</SelectItem>
                  <SelectItem value="Atacante">Atacante</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
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
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma oferta corresponde aos filtros.
                </CardContent>
              </Card>
            )}
            {filteredListings.map((l) => {
              const canAfford = (data?.money ?? 0) >= l.price;
              const rosterFull = (data?.roster_count ?? 0) >= (data?.roster_slots ?? 0);
              const disabled = !canAfford || rosterFull || buyMut.isPending;
              return (
                <Card key={l.id}>
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold truncate">{l.name}</p>
                        <Badge variant="outline" className={ELEMENT_COLORS[l.element]}>
                          {ELEMENT_LABEL[l.element]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {l.suggested_position}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <Stars overall={l.overall} />
                        <span>OVR {l.overall}</span>
                        <span className="truncate">de {l.seller}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-amber-300">{formatMoney(l.price)}</p>
                      <Button
                        size="sm"
                        className="mt-1 h-7"
                        disabled={disabled}
                        onClick={() => buyMut.mutate(l.id)}
                      >
                        {rosterFull ? "Cheio" : !canAfford ? "Sem $" : "Comprar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando elenco...</p>}
            {!isLoading && filteredMine.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma criatura corresponde aos filtros.
                </CardContent>
              </Card>
            )}
            {filteredMine.map((c) => {
              const sellPrice = Math.round((c.market_value * 0.9) / 100) * 100;
              const canSell = (data?.roster_count ?? 0) > 11;
              return (
                <Card key={c.id}>
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold truncate">{c.name}</p>
                        <Badge variant="outline" className={ELEMENT_COLORS[c.element]}>
                          {ELEMENT_LABEL[c.element]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {c.suggested_position}
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
    </div>
  );
}

