import { Link } from "@tanstack/react-router";
import { RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function GameRecovery({ area = "esta área" }: { area?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <Card className="w-full max-w-md border-primary/25">
        <CardContent className="space-y-4 p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Reorganizando {area}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seu progresso está preservado. Podemos retomar a conexão ou voltar ao clube.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
            <Button asChild variant="outline"><Link to="/dashboard">Voltar ao clube</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
