import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  devFastForwardCurrentSeason,
  devDeriveWorldQualifiers,
  devReadMyQualifications,
  devResetMyGame,
} from "@/lib/dev-tools.functions";
import { finishSeasonAndAdvance } from "@/lib/league.functions";

export const Route = createFileRoute("/_authenticated/dev")({
  head: () => ({
    meta: [
      { title: "Dev Tools · Monster Club Manager" },
      { name: "description", content: "Ferramentas de teste (dev-only)." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DevPage,
});

function DevPage() {
  const navigate = useNavigate();
  const fastForward = useServerFn(devFastForwardCurrentSeason);
  const finish = useServerFn(finishSeasonAndAdvance);
  const derive = useServerFn(devDeriveWorldQualifiers);
  const readQuals = useServerFn(devReadMyQualifications);
  const resetMyGame = useServerFn(devResetMyGame);

  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<any[]>([]);
  const push = (label: string, data: any) =>
    setLog((l) => [...l, { label, data, ts: new Date().toISOString() }]);

  if (!import.meta.env.DEV) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Dev Tools</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Disponível apenas em build de desenvolvimento.
        </p>
      </div>
    );
  }

  const run = async (label: string, fn: () => Promise<any>) => {
    try {
      setBusy(label);
      const res = await fn();
      push(label, res);
    } catch (e: any) {
      push(label, { error: String(e?.message ?? e) });
    } finally {
      setBusy(null);
    }
  };

  const runFullCycle = async () => {
    await run("1. fast-forward", () => fastForward({}));
    await run("2. finishSeasonAndAdvance", () => finish({}));
    await run("3. read qualifications", () => readQuals({}));
    // deriva da temporada recém-encerrada (última finished)
    await run("4. derive world qualifiers", () => derive({ data: {} }));
  };

  const resetAndRestart = async () => {
    setBusy("reiniciar jogo");
    try {
      await resetMyGame();
      navigate({ to: "/onboarding", replace: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Dev Tools</h1>
        <p className="text-xs text-muted-foreground">
          Fast-forward preenche partidas pendentes com resultados aleatórios (sem motor,
          sem fadiga, sem XP), depois roda o encerramento real de temporada.
        </p>
      </div>

      <Card className="p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!!busy}
            onClick={() => run("fast-forward", () => fastForward({}))}
          >
            Fast-forward (só)
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => run("finishSeasonAndAdvance", () => finish({}))}
          >
            finishSeasonAndAdvance
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => run("derive", () => derive({ data: {} }))}
          >
            Derivar qualificados
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => run("read quals", () => readQuals({}))}
          >
            Ler minhas qualifications
          </Button>
          <Button size="sm" variant="default" disabled={!!busy} onClick={runFullCycle}>
            Ciclo completo (1→4)
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLog([])}>
            Limpar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!!busy}
            onClick={resetAndRestart}
          >
            Reiniciar meu jogo
          </Button>
        </div>
        {busy && <div className="text-xs text-muted-foreground">Executando: {busy}…</div>}
      </Card>

      <div className="space-y-2">
        {log.map((entry, i) => (
          <Card key={i} className="p-3">
            <div className="text-xs font-semibold">{entry.label}</div>
            <div className="text-[10px] text-muted-foreground">{entry.ts}</div>
            <pre className="text-[11px] mt-2 overflow-auto max-h-96 whitespace-pre-wrap">
              {JSON.stringify(entry.data, null, 2)}
            </pre>
          </Card>
        ))}
      </div>
    </div>
  );
}
