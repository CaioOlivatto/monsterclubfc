import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Futebol de Criaturas" },
      {
        name: "description",
        content: "Painel da sua academia de criaturas.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const nav = useNavigate();
  async function signOut() {
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen bg-background p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button variant="ghost" onClick={signOut}>
          Sair
        </Button>
      </header>
      <p className="mt-4 text-muted-foreground">
        Sua academia está pronta. As telas de gestão chegam na Etapa 3.
      </p>
    </div>
  );
}
