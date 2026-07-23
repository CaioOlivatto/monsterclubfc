import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Globe2, Info, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorldCompetitionStatus } from "@/lib/world-competitions.functions";

export const Route = createFileRoute("/_authenticated/world-league")({
  head: () => ({
    meta: [
      { title: "Liga Mundial — Monster Club Manager" },
      {
        name: "description",
        content:
          "Liga Mundial: 20 times de todas as divisões disputam fase de grupos e mata-mata em 7 rodadas.",
      },
    ],
  }),
  component: WorldLeaguePage,
});

function WorldLeaguePage() {
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
          <h1 className="text-lg font-bold">Liga Mundial</h1>
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
                  <Globe2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">O que é a Liga Mundial</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Reúne os <b className="text-foreground">4 melhores de cada divisão</b> (20 times no total)
                  em uma competição paralela ao Campeonato.
                </p>
                <p>
                  Formato: <b className="text-foreground">5 grupos de 4</b> (fase única) + mata-mata das
                  quartas até a final. Total: <b className="text-foreground">7 rodadas</b>, intercaladas
                  entre as rodadas de Campeonato.
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
                Termine <b className="text-foreground">entre os 4 melhores da sua divisão</b> no
                Campeonato para garantir vaga na Liga Mundial da temporada seguinte.
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
              Termine entre os 4 melhores da sua divisão para se classificar para a Temporada 2.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (!data.qualifiedLeague) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-4 text-sm">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold">Não classificado nesta temporada</p>
            <p className="text-muted-foreground">
              Volte a terminar entre os 4 melhores da sua divisão para garantir vaga na próxima.
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
          <p className="font-semibold">Você está na Liga Mundial desta temporada</p>
          <p className="text-muted-foreground">
            Origem: {data.qualifiedLeague.source_division.toUpperCase()} · posição{" "}
            {data.qualifiedLeague.source_position}. As rodadas serão liberadas na Fase B.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
