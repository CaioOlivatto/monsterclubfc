import { Link, useLocation } from "@tanstack/react-router";
import { Home, Users, Trophy, Store, Inbox } from "lucide-react";

const items = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/roster", label: "Elenco", icon: Users },
  { to: "/league", label: "Liga", icon: Trophy },
  { to: "/market", label: "Mercado", icon: Store },
  { to: "/messages", label: "Mensagens", icon: Inbox },
] as const;


export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="sticky bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <li key={to}>
              <Link
                to={to}
                preload="intent"
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
