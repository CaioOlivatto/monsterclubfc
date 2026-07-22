import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getShopState,
  buyItem,
  useItem,
  buyGemPackage,
  buyExtraBuilder,
  expandRoster,
} from "@/lib/shop.functions";
import { listMyCreatures } from "@/lib/creatures.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { ArrowLeft, Coins, Gem, Hammer, Package, Users, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shop")({
  head: () => ({
    meta: [
      { title: "Loja — Monster Club Manager" },
      { name: "description", content: "Pacotes de gemas, itens e upgrades da academia." },
      { property: "og:title", content: "Loja — Monster Club Manager" },
      { property: "og:description", content: "Pacotes de gemas, itens e upgrades da academia." },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const fetchShop = useServerFn(getShopState);
  const fetchCreatures = useServerFn(listMyCreatures);
  const buyItemFn = useServerFn(buyItem);
  const useItemFn = useServerFn(useItem);
  const buyGemsFn = useServerFn(buyGemPackage);
  const buyBuilderFn = useServerFn(buyExtraBuilder);
  const expandFn = useServerFn(expandRoster);

  const { data: shop, isLoading } = useQuery({
    queryKey: ["shop"],
    queryFn: () => fetchShop({}),
  });
  const { data: creatures } = useQuery({
    queryKey: ["my-creatures"],
    queryFn: () => fetchCreatures({}),
  });

  const [potionTarget, setPotionTarget] = useState<string>("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["shop"] });
    qc.invalidateQueries({ queryKey: ["my-creatures"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["buildings"] });
  };

  const buyMut = useMutation({
    mutationFn: (v: { itemKey: any; currency: "money" | "gems" }) => buyItemFn({ data: v }),
    onSuccess: (r) => { toast.success(r.message); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha na compra"),
  });
  const useMut = useMutation({
    mutationFn: (v: { itemKey: any; creatureId?: string }) => useItemFn({ data: v }),
    onSuccess: (r) => { toast.success(r.message); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao usar item"),
  });
  const gemsMut = useMutation({
    mutationFn: (packageId: string) => buyGemsFn({ data: { packageId } }),
    onSuccess: (r) => { toast.success(r.message); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha na compra"),
  });
  const builderMut = useMutation({
    mutationFn: () => buyBuilderFn({}),
    onSuccess: (r) => { toast.success(r.message); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });
  const expandMut = useMutation({
    mutationFn: () => expandFn({}),
    onSuccess: (r) => { toast.success(r.message); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  if (isLoading || !shop) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando loja...
      </div>
    );
  }

  const { academy, inventory, catalogs, creaturesCount } = shop;
  const nextExpansion = catalogs.rosterExpansions.find((r: any) => r.from === academy.roster_slots);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/dashboard" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-xl font-bold sm:text-2xl">Loja</h1>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1"><Coins className="h-4 w-4 text-yellow-500" /> $ {academy.money.toLocaleString("pt-BR")}</span>
            <span className="flex items-center gap-1"><Gem className="h-4 w-4 text-cyan-400" /> {academy.gems}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 p-4">
        <Tabs defaultValue="itens">
          <TabsList>
            <TabsTrigger value="itens"><Package className="mr-2 h-4 w-4" /> Itens</TabsTrigger>
            <TabsTrigger value="gemas"><Gem className="mr-2 h-4 w-4" /> Gemas</TabsTrigger>
            <TabsTrigger value="upgrades"><Zap className="mr-2 h-4 w-4" /> Upgrades</TabsTrigger>
          </TabsList>

          {/* ---------- ITENS ---------- */}
          <TabsContent value="itens" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Meu inventário</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {catalogs.items.map((item: any) => (
                  <div key={item.key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-card/40 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{item.name}</p>
                        <Badge variant="secondary">×{inventory[item.key] ?? 0}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.key === "potion_individual" && (
                        <Select value={potionTarget} onValueChange={setPotionTarget}>
                          <SelectTrigger className="h-8 w-44">
                            <SelectValue placeholder="Escolher criatura" />
                          </SelectTrigger>
                          <SelectContent>
                            {(creatures ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name} — {c.energy}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={(inventory[item.key] ?? 0) < 1 || useMut.isPending || (item.key === "potion_individual" && !potionTarget)}
                        onClick={() => useMut.mutate({ itemKey: item.key, creatureId: item.key === "potion_individual" ? potionTarget : undefined })}
                      >
                        Usar
                      </Button>
                      {item.moneyPrice != null && (
                        <Button
                          size="sm"
                          disabled={buyMut.isPending}
                          onClick={() => buyMut.mutate({ itemKey: item.key, currency: "money" })}
                        >
                          <Coins className="mr-1 h-3 w-3" /> ${item.moneyPrice.toLocaleString("pt-BR")}
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        disabled={buyMut.isPending}
                        onClick={() => buyMut.mutate({ itemKey: item.key, currency: "gems" })}
                      >
                        <Gem className="mr-1 h-3 w-3" /> {item.gemPrice}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------- GEMAS ---------- */}
          <TabsContent value="gemas" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catalogs.gemPackages.map((pkg: any) => (
                <Card key={pkg.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      {pkg.name}
                      <Badge variant="outline">{pkg.price}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-2xl font-bold">
                      <Gem className="h-6 w-6 text-cyan-400" />
                      {pkg.gems + pkg.bonus}
                    </div>
                    {pkg.bonus > 0 && (
                      <p className="text-xs text-emerald-400">Inclui +{pkg.bonus} de bônus!</p>
                    )}
                    <Button className="w-full" onClick={() => gemsMut.mutate(pkg.id)} disabled={gemsMut.isPending}>
                      Adquirir
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              MVP: compras simuladas. Integração com pagamento real chega nas próximas etapas.
            </p>
          </TabsContent>

          {/* ---------- UPGRADES ---------- */}
          <TabsContent value="upgrades" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Hammer className="h-4 w-4" /> Construtor extra</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm">Construtores atuais: <span className="font-medium">{academy.builders}</span> / {catalogs.maxBuilders}</p>
                  <p className="text-xs text-muted-foreground">Permite conduzir mais obras em paralelo.</p>
                </div>
                <Button
                  disabled={
                    builderMut.isPending ||
                    academy.builders >= catalogs.maxBuilders ||
                    catalogs.nextBuilderCost == null ||
                    academy.gems < (catalogs.nextBuilderCost ?? Infinity)
                  }
                  onClick={() => builderMut.mutate()}
                >
                  <Gem className="mr-2 h-4 w-4" />{" "}
                  {catalogs.nextBuilderCost ?? "—"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Vagas de elenco</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm">Ocupação: <span className="font-medium">{creaturesCount} / {academy.roster_slots}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {nextExpansion
                      ? `Próxima expansão: ${nextExpansion.from} → ${nextExpansion.to} vagas.`
                      : "Você já está no máximo de vagas."}
                  </p>
                </div>
                {nextExpansion && (
                  <Button
                    disabled={expandMut.isPending || academy.gems < nextExpansion.gems}
                    onClick={() => expandMut.mutate()}
                  >
                    <Gem className="mr-2 h-4 w-4" /> {nextExpansion.gems}
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/dashboard" className="underline underline-offset-4">Voltar ao painel</Link>
        </p>
      </main>
    </div>
  );
}
