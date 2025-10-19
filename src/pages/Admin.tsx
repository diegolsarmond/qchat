import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface AdminStat {
  key: string;
  title: string;
  description: string;
  value: string;
}

const defaultStats: AdminStat[] = [
  {
    key: "users",
    title: "Usuários ativos",
    description: "Colaboradores com acesso ao sistema",
    value: "0",
  },
  {
    key: "chats",
    title: "Conversas monitoradas",
    description: "Total de threads sincronizadas",
    value: "0",
  },
  {
    key: "uptime",
    title: "Status da plataforma",
    description: "Monitoramento das integrações",
    value: "Operacional",
  },
];

const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState<AdminStat[]>(defaultStats);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const sessionResult = await supabase.auth.getSession();
        const session = sessionResult.data.session;
        const appMetadata = (session?.user as { app_metadata?: Record<string, unknown> | undefined })?.app_metadata ?? {};
        const appRole = appMetadata.role as string | undefined;
        const appRoles = Array.isArray((appMetadata as { roles?: unknown }).roles)
          ? ((appMetadata as { roles?: string[] }).roles ?? [])
          : [];
        const isAdmin =
          appRole === "admin" ||
          appRoles.includes("admin") ||
          appMetadata.is_admin === true;

        if (!session || !isAdmin) {
          navigate("/", { replace: true });
          return;
        }

        if (!active) {
          return;
        }

        setAuthorized(true);

        const [usersResponse, chatsResponse] = await Promise.all([
          supabase.from("users").select("id", { count: "exact", head: true }),
          supabase.from("chats").select("id", { count: "exact", head: true }),
        ]);

        if (!active) {
          return;
        }

        const usersCount = usersResponse.count ?? 0;
        const chatsCount = chatsResponse.count ?? 0;

        setStats([
          { ...defaultStats[0], value: usersCount.toLocaleString("pt-BR") },
          { ...defaultStats[1], value: chatsCount.toLocaleString("pt-BR") },
          defaultStats[2],
        ]);
      } catch (error) {
        console.error("Falha ao validar acesso administrativo", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [navigate]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--whatsapp-background))]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!authorized) {
      return null;
    }

    return (
      <div className="min-h-screen bg-[hsl(var(--whatsapp-background))] p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div>
            <h1 className="text-3xl font-bold text-primary">Painel administrativo</h1>
            <p className="text-muted-foreground">Acompanhe indicadores críticos do atendimento</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stats.map((stat) => (
              <Card key={stat.key} className="border-[hsl(var(--whatsapp-border))] bg-card/80">
                <CardHeader className="pb-2">
                  <CardDescription>{stat.title}</CardDescription>
                  <CardTitle className="text-3xl text-primary">{stat.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{stat.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }, [authorized, loading, stats]);

  return content;
};

export default Admin;
