import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncServerSession } from "@/integrations/supabase/session.functions";
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
  const syncSession = useServerFn(syncServerSession);
  const repairCareer = useServerFn(repairCurrentCareerWithSession);
  const [sessionReady, setSessionReady] = useState(false);
  const accessTokenRef = useRef<string | null>(null);

  // Correção global para o host: toda server function do jogo (Mercado,
  // Construções, Liga, Ranking, etc.) recebe o JWT atual diretamente. Isso
  // evita que cada página dependa de cookies que o proxy do Lovable pode
  // reaproveitar de uma sessão antiga. Chamadas ao Supabase continuam indo
  // direto ao domínio do Supabase e não são alteradas.
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const addCurrentSession = async () => {
      const { data } = await supabase.auth.getSession();
      accessTokenRef.current = data.session?.access_token ?? null;
    };
    void addCurrentSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(requestUrl, window.location.origin);
      const token = accessTokenRef.current;
      if (url.origin !== window.location.origin || !token) {
        return originalFetch(input, init);
      }

      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      if (!headers.has("x-supabase-access-token")) headers.set("x-supabase-access-token", token);

      if (input instanceof Request) {
        return originalFetch(new Request(input, { ...init, headers }));
      }
      return originalFetch(input, { ...init, headers });
    }) as typeof window.fetch;

    return () => {
      listener.subscription.unsubscribe();
      window.fetch = originalFetch;
    };
  }, []);

  // Todas as telas protegidas usam o mesmo JWT do navegador. Só liberamos o
  // conteúdo após gravá-lo na sessão HttpOnly do jogo; isso elimina a corrida
  // em que painel, elenco e escalação podiam consultar usuários diferentes.
  useEffect(() => {
    let active = true;
    async function prepareSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      try {
        await syncSession({ data: { accessToken: data.session.access_token } });
        await repairCareer({ data: { access_token: data.session.access_token } });
        if (active) setSessionReady(true);
      } catch {
        if (active) navigate({ to: "/auth", replace: true });
      }
    }
    void prepareSession();
    return () => { active = false; };
  }, [navigate, repairCareer, syncSession]);

  if (!sessionReady) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">Preparando sua academia...</div>;
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
