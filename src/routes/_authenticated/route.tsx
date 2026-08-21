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

  // O Supabase já gravou a sessão no navegador no instante em que o login
  // terminou. Não bloqueamos a entrada do jogo aguardando um cookie do host:
  // localhost e Lovable tratam cookies de formas diferentes. Cada função que
  // toca no banco valida o JWT diretamente.
  useEffect(() => {
    let active = true;
    async function prepareSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) {
        navigate({ to: "/auth", replace: true });
        return;
      }

      // Sessão válida libera a navegação imediatamente. A recuperação de uma
      // carreira interrompida é manutenção em segundo plano e jamais deve
      // transformar uma falha secundária em bloqueio global do jogo.
      if (active) setSessionReady(true);
      void repairCareer({ data: { access_token: data.session.access_token } })
        .catch((repairError) => console.error("[career-repair]", repairError));
    }
    void prepareSession();
    return () => { active = false; };
  }, [navigate, repairCareer]);

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-200">
        <div className="w-full max-w-sm rounded-2xl border border-violet-500/30 bg-slate-900/90 p-6 text-center shadow-2xl">
          <p className="font-semibold">Entrando na sua academia...</p>
          <p className="mt-2 text-sm text-slate-400">Validando sua sessão.</p>
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
