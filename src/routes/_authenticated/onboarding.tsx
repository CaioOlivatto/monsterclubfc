import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { createInitialTrainer } from "@/lib/creatures.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Criar treinador — Monster Club Manager" },
      {
        name: "description",
        content: "Escolha o nome do treinador e da sua academia.",
      },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const nav = useNavigate();
  const createFn = useServerFn(createInitialTrainer);
  const [trainerName, setTrainerName] = useState("");
  const [academyName, setAcademyName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createFn({
        data: { trainer_name: trainerName, academy_name: academyName },
      });
      toast.success("Academia criada! 18 criaturas geradas.");
      nav({ to: "/dashboard" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao criar treinador",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sua academia</CardTitle>
          <CardDescription>
            Escolha um nome para você e para a sua academia. Ao concluir, você
            recebe um elenco inicial de 18 criaturas geradas aleatoriamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trainer">Nome do treinador</Label>
              <Input
                id="trainer"
                required
                minLength={2}
                maxLength={40}
                value={trainerName}
                onChange={(e) => setTrainerName(e.target.value)}
                placeholder="Ex.: Iris"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="academy">Nome da academia</Label>
              <Input
                id="academy"
                required
                minLength={2}
                maxLength={40}
                value={academyName}
                onChange={(e) => setAcademyName(e.target.value)}
                placeholder="Ex.: Academia Vulcânica"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Criando..." : "Criar academia"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
