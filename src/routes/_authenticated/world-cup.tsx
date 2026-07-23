import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info, Lock, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorldCompetitionStatus } from "@/lib/world-competitions.functions";

export const Route = createFileRoute("/_authenticated/world-cup")({
  head: () => ({
    meta: [
      { title: "Copa Mundial — Monster Club Manager" },
      {
        name: "description",
        content:
          "Copa Mundial: campeões de cada divisão em mata-mata direto com pré-rodada. 4 rodadas até o título.",
      },
    ],
  }),
  component: WorldCupPage,
});

function WorldCupPage() {
  const fetchStatus = useServerFn(getWorldCompetitionStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["world-competition-status"],
    queryFn: () => fetchStatus(),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-lg font-bold">Copa Mundial</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <Card>
              <CardHeader className="py-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">O que é a Copa Mundial</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Reúne os <b className="text-foreground">campeões de cada divisão</b> mais convidados
                  (10 times) em mata-mata direto.
                </p>
                <p>
                  Formato: <b className="text-foreground">pré-rodada + quartas + semi + final</b> —
                  4 rodadas intercaladas ao Campeonato.
                </p>
              </CardContent>
            </Card>

            <StatusCard data={data} />

            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">Como se classificar</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Seja <b className="text-foreground">campeão da sua divisão</b> no Campeonato para
                garantir vaga na Copa Mundial da temporada seguinte.
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function StatusCard({ data }: { data: any }) {
  if (!data) return null;
  if (data.isFirstSeason) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-4 text-sm">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold">Bloqueada na Temporada 1</p>
            <p className="text-muted-foreground">
              Vença sua divisão para se classificar para a Temporada 2.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (!data.qualifiedCup) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-4 text-sm">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold">Não classificado nesta temporada</p>
            <p className="text-muted-foreground">
              Volte a ser campeão da sua divisão para garantir vaga na próxima.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4 text-sm">
        <Badge className="uppercase">Classificado</Badge>
        <div>
          <p className="font-semibold">Você está na Copa Mundial desta temporada</p>
          <p className="text-muted-foreground">
            Origem: campeão de {data.qualifiedCup.source_division.toUpperCase()}. As rodadas serão
            liberadas na Fase B.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
