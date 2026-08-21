import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { repairCurrentCareerWithSession } from "@/lib/creatures.functions";
import { BottomNav } from "@/components/BottomNav";
import { GameLogo } from "@/components/GameLogo";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getUser() faz uma viagem de rede em toda navegação protegida. A sessão
    // persistida é suficiente para o bloqueio visual; cada server function ainda
    // valida o JWT no Supabase antes de ler ou alterar qualquer dado.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user || !data.session.access_token) {
      throw redirect({ to: "/auth" });
    }

    // A sessão do navegador já é suficiente para entrar. Cada operação valida
    // o JWT diretamente no Supabase; a navegação não depende de cookie criado
    // pelo proxy do provedor de hospedagem.
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const repairCareer = useServerFn(repairCurrentCareerWithSession);
  const [sessionReady, setSessionReady] = useState(false);
  const [preparationFailed, setPreparationFailed] = useState(false);
  const [preparationAttempt, setPreparationAttempt] = useState(0);

  // O Supabase já gravou a sessão no navegador no instante em que o login
  // terminou. Não bloqueamos a entrada do jogo aguardando um cookie do host:
  // localhost e Lovable tratam cookies de formas diferentes. Cada função que
  // toca no banco valida o JWT diretamente.
  useEffect(() => {
    let active = true;
    async function prepareSession() {
      setPreparationFailed(false);
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await repairCareer({ data: { access_token: data.session.access_token } });
          if (active) setSessionReady(true);
          return;
        } catch (error) {
          console.error(`[career-gate:${attempt + 1}]`, error);
          if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
      if (active) setPreparationFailed(true);
    }
    void prepareSession();
    return () => { active = false; };
  }, [navigate, preparationAttempt, repairCareer]);

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-200">
        <div className="w-full max-w-sm rounded-2xl border border-violet-500/30 bg-slate-900/90 p-6 text-center shadow-2xl">
          <p className="font-semibold">{preparationFailed ? "Vamos concluir a preparação" : "Preparando sua academia..."}</p>
          <p className="mt-2 text-sm text-slate-400">Seu progresso está preservado e o jogo só abrirá quando toda a carreira estiver pronta.</p>
          {preparationFailed && (
            <button className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500" onClick={() => setPreparationAttempt((value) => value + 1)}>
              Continuar preparação
            </button>
          )}
        </div>
      </div>
    );
  }

  const pageOwnsBranding = pathname === "/dashboard" || pathname === "/onboarding" || pathname === "/roster" || pathname === "/lineup" || pathname === "/buildings" || pathname.startsWith("/match/");
  return (
    <div className="flex min-h-screen flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      {!pageOwnsBranding && (
        <div className="relative z-30 border-b border-violet-500/25 bg-slate-950/95 px-3 py-1.5 shadow-md backdrop-blur-md">
          <GameLogo size="sm" className="mx-auto" />
        </div>
      )}
      <div className="flex-1">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
