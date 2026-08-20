import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ensureServerSession } from "@/integrations/supabase/auth-attacher";
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

    try {
      // Não dependemos do middleware automático do host: toda entrada em uma
      // página protegida estabelece explicitamente a sessão HttpOnly usada por
      // todas as Server Functions do jogo.
      await ensureServerSession(data.session.access_token);
    } catch {
      const { data: refreshed, error: refreshError } =
        await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session?.access_token) {
        throw redirect({ to: "/auth" });
      }
      await ensureServerSession(refreshed.session.access_token);
    }
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { pathname } = useLocation();
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
