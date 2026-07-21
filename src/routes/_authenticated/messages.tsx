import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listMessages,
  markMessageRead,
  markAllRead,
  deleteMessage,
} from "@/lib/messages.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, CheckCheck, Inbox, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Caixa de mensagens — Futebol de Criaturas" },
      { name: "description", content: "Eventos, resultados e avisos da sua academia." },
      { property: "og:title", content: "Caixa de mensagens — Futebol de Criaturas" },
      { property: "og:description", content: "Eventos, resultados e avisos da sua academia." },
    ],
  }),
  component: MessagesPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-sm text-destructive">Erro: {error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-8 text-center text-muted-foreground">Não encontrada.</div>
  ),
});

function MessagesPage() {
  const fetchList = useServerFn(listMessages);
  const readOne = useServerFn(markMessageRead);
  const readAll = useServerFn(markAllRead);
  const delOne = useServerFn(deleteMessage);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["messages"],
    queryFn: () => fetchList({}),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["messages"] });

  const readMut = useMutation({
    mutationFn: (id: string) => readOne({ data: { id } }),
    onSuccess: invalidate,
  });
  const readAllMut = useMutation({
    mutationFn: () => readAll({}),
    onSuccess: () => {
      toast.success("Todas marcadas como lidas");
      invalidate();
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delOne({ data: { id } }),
    onSuccess: invalidate,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Inbox className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Caixa de mensagens</h1>
            <p className="text-xs text-muted-foreground">
              {data ? `${data.unread} não lida(s)` : "Carregando..."}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={!data?.unread || readAllMut.isPending}
            onClick={() => readAllMut.mutate()}
          >
            <CheckCheck className="mr-1 h-4 w-4" /> Marcar todas
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 p-4">
        {isLoading && <p className="text-center text-sm text-muted-foreground">Carregando...</p>}
        {data && data.messages.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma mensagem.</p>
        )}
        {data?.messages.map((m: any) => (
          <Card key={m.id} className={m.read ? "opacity-70" : "border-primary/40"}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className="uppercase">
                  {m.kind}
                </Badge>
                <span className="min-w-0 truncate">{m.title}</span>
                {!m.read && <Badge className="ml-auto">Nova</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="whitespace-pre-line text-sm text-muted-foreground">{m.body}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                <div className="flex gap-2">
                  {!m.read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => readMut.mutate(m.id)}
                      disabled={readMut.isPending}
                    >
                      <Check className="mr-1 h-3 w-3" /> Ler
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => delMut.mutate(m.id)}
                    disabled={delMut.isPending}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Excluir
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </main>
    </div>
  );
}
