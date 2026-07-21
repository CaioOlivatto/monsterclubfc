import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Futebol de Criaturas" },
      {
        name: "description",
        content:
          "Entre ou crie sua academia e comande um elenco de criaturas na liga.",
      },
      { property: "og:title", content: "Entrar — Futebol de Criaturas" },
      {
        property: "og:description",
        content:
          "Entre ou crie sua academia e comande um elenco de criaturas na liga.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function formatAuthError(message: string) {
    const normalized = message.toLowerCase();
    if (normalized.includes("email not confirmed")) {
      return "Este email ainda não estava confirmado. A confirmação automática já foi ativada; tente entrar novamente.";
    }
    if (normalized.includes("invalid login credentials")) {
      return "Email ou senha incorretos. Confira os dados e tente novamente.";
    }
    return message;
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      const text = formatAuthError(error.message);
      setMessage({ type: "error", text });
      toast.error(text);
      return;
    }
    setMessage({ type: "success", text: "Login feito. Carregando sua academia..." });
    nav({ to: "/", replace: true });
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) {
      const text = formatAuthError(error.message);
      setMessage({ type: "error", text });
      toast.error(text);
      return;
    }
    const text = "Conta criada. Carregando sua academia...";
    setMessage({ type: "success", text });
    toast.success(text);
    nav({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Futebol de Criaturas</CardTitle>
          <CardDescription>
            Entre na sua academia ou comece uma nova jornada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                {message ? (
                  <div
                    aria-live="polite"
                    className={`rounded-md border px-3 py-2 text-sm ${
                      message.type === "error"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-primary/30 bg-primary/10 text-primary"
                    }`}
                  >
                    {message.text}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-pw">Senha</Label>
                  <Input
                    id="signin-pw"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                {message ? (
                  <div
                    aria-live="polite"
                    className={`rounded-md border px-3 py-2 text-sm ${
                      message.type === "error"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-primary/30 bg-primary/10 text-primary"
                    }`}
                  >
                    {message.text}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-pw">Senha</Label>
                  <Input
                    id="signup-pw"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
