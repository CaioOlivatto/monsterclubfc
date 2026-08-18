import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { GameRecovery } from "@/components/GameRecovery";
import { GameTelemetry } from "@/components/GameTelemetry";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  void reset;
  return <GameRecovery area="o clube" />;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Monster Club Manager — Gestão de Academia" },
      { name: "description", content: "Jogo de gestão estilo Elifoot com criaturas originais: monte seu elenco, treine, dispute liga e copa." },
      { name: "author", content: "Monster Club Manager" },
      { property: "og:title", content: "Monster Club Manager — Gestão de Academia" },
      { property: "og:description", content: "Jogo de gestão estilo Elifoot com criaturas originais: monte seu elenco, treine, dispute liga e copa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },

      { name: "twitter:title", content: "Monster Club Manager — Gestão de Academia" },
      { name: "twitter:description", content: "Jogo de gestão estilo Elifoot com criaturas originais: monte seu elenco, treine, dispute liga e copa." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4be21941-83ad-4624-b222-8d2cc3a2c659/id-preview-9813cd03--46a08301-b1f2-42ec-a1be-b33e8c1d0fd6.lovable.app-1784665928320.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4be21941-83ad-4624-b222-8d2cc3a2c659/id-preview-9813cd03--46a08301-b1f2-42ec-a1be-b33e8c1d0fd6.lovable.app-1784665928320.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <GameTelemetry />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
