import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

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

const formatStats = (usersCount: number, chatsCount: number): AdminStat[] => [
  { ...defaultStats[0], value: usersCount.toLocaleString("pt-BR") },
  { ...defaultStats[1], value: chatsCount.toLocaleString("pt-BR") },
  defaultStats[2],
];

type PerformAdminUserCreationParams = {
  email: string;
  password: string;
  createUser: typeof supabase.auth.admin.createUser;
  fetchCounts: () => Promise<{ usersCount: number; chatsCount: number }>;
  updateStats: (nextStats: AdminStat[]) => void;
  toast: (options: { title: string; description: string; variant?: string }) => void;
};

export const performAdminUserCreation = async ({
  email,
  password,
  createUser,
  fetchCounts,
  updateStats,
  toast,
}: PerformAdminUserCreationParams) => {
  try {
    const { error } = await createUser({ email, password, email_confirm: true });

    if (error) {
      toast({
        title: "Erro ao criar usuário",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }

    toast({
      title: "Usuário criado",
      description: "Cadastro disponibilizado com sucesso",
    });

    const { usersCount, chatsCount } = await fetchCounts();
    updateStats(formatStats(usersCount, chatsCount));

    return true;
  } catch (unknownError) {
    const message =
      typeof unknownError === "object" &&
      unknownError !== null &&
      "message" in unknownError &&
      typeof (unknownError as { message?: unknown }).message === "string"
        ? (unknownError as { message: string }).message
        : "Erro inesperado";
    toast({
      title: "Erro ao criar usuário",
      description: message,
      variant: "destructive",
    });
    return false;
  }
};

const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState<AdminStat[]>(defaultStats);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const { toast } = useToast();

  const fetchCounts = useCallback(async () => {
    const [usersResponse, chatsResponse] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }),
      supabase.from("chats").select("id", { count: "exact", head: true }),
    ]);

    return {
      usersCount: usersResponse.count ?? 0,
      chatsCount: chatsResponse.count ?? 0,
    };
  }, []);

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

        const { usersCount, chatsCount } = await fetchCounts();

        if (!active) {
          return;
        }

        setStats(formatStats(usersCount, chatsCount));
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
  }, [fetchCounts, navigate]);

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creatingUser) {
      return;
    }

    setCreatingUser(true);

    try {
      const result = await performAdminUserCreation({
        email: createEmail,
        password: createPassword,
        createUser: supabase.auth.admin.createUser.bind(supabase.auth.admin),
        fetchCounts,
        updateStats: setStats,
        toast,
      });

      if (result) {
        setCreateEmail("");
        setCreatePassword("");
      }
    } finally {
      setCreatingUser(false);
    }
  };

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
          <Card className="border-[hsl(var(--whatsapp-border))] bg-card/80">
            <CardHeader className="pb-2">
              <CardDescription>Gerenciar acessos</CardDescription>
              <CardTitle className="text-2xl text-primary">Criar novo usuário</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateUser}>
                <div className="space-y-2">
                  <Label htmlFor="admin-create-email">E-mail</Label>
                  <Input
                    id="admin-create-email"
                    type="email"
                    required
                    value={createEmail}
                    onChange={(event) => setCreateEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-create-password">Senha provisória</Label>
                  <Input
                    id="admin-create-password"
                    type="password"
                    required
                    value={createPassword}
                    onChange={(event) => setCreatePassword(event.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Button className="w-full md:w-auto" disabled={creatingUser} type="submit">
                    {creatingUser ? "Cadastrando..." : "Cadastrar usuário"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
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
  }, [authorized, createEmail, createPassword, creatingUser, handleCreateUser, loading, stats]);

  return content;
};

export default Admin;
