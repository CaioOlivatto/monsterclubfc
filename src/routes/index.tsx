import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyTrainer } from "@/lib/creatures.functions";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const nav = useNavigate();
  const fetchTrainer = useServerFn(getMyTrainer);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A sessão já está disponível no armazenamento local. A chamada seguinte
      // ao servidor ainda valida o token, sem adicionar uma viagem extra à rede
      // antes de decidir a primeira tela.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        nav({ to: "/auth", replace: true });
        return;
      }
      try {
        const trainer = await fetchTrainer();
        if (cancelled) return;
        if (trainer && trainer.has_roster) {
          nav({ to: "/dashboard", replace: true });
        } else {
          nav({ to: "/onboarding", replace: true });
        }
      } catch {
        if (!cancelled) nav({ to: "/onboarding", replace: true });
      }

    })();
    return () => {
      cancelled = true;
    };
  }, [nav, fetchTrainer]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Carregando...
    </div>
  );
}
