import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Label as ChatLabel } from "@/types/whatsapp";

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
  name?: string;
  createUser: (payload: { email: string; password: string; name?: string }) => Promise<{
    error: { message: string } | null;
  }>;
  fetchCounts: () => Promise<{ usersCount: number; chatsCount: number }>;
  updateStats: (nextStats: AdminStat[]) => void;
  toast: ReturnType<typeof useToast>['toast'];
};

export const performAdminUserCreation = async ({
  email,
  password,
  name,
  createUser,
  fetchCounts,
  updateStats,
  toast,
}: PerformAdminUserCreationParams) => {
  try {
    const { error } = await createUser({ email, password, name });

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
  const [createName, setCreateName] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [activeCredentialId, setActiveCredentialId] = useState<string | null>(null);
  const [labels, setLabels] = useState<ChatLabel[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#2563eb");
  const [labelEdits, setLabelEdits] = useState<Record<string, { name: string; color: string }>>({});
  const [updatingLabelIds, setUpdatingLabelIds] = useState<Record<string, boolean>>({});
  const [deletingLabelId, setDeletingLabelId] = useState<string | null>(null);
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

  const listLabelsForCredential = useCallback(async (credentialId: string) => {
    const { data, error } = await supabase
      .from('labels')
      .select('id, name, color, credential_id')
      .eq('credential_id', credentialId)
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      credentialId: row.credential_id ?? undefined,
    }));
  }, []);

  useEffect(() => {
    setLabelEdits(
      labels.reduce((acc, label) => {
        acc[label.id] = { name: label.name, color: label.color };
        return acc;
      }, {} as Record<string, { name: string; color: string }>),
    );
  }, [labels]);

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

        const { data: credentialData, error: credentialError } = await supabase
          .from('credentials')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (credentialError) {
          console.error('Erro ao carregar credencial ativa', credentialError);
        }

        if (!active) {
          return;
        }

        const credentialId = credentialData?.id ?? null;
        setActiveCredentialId(credentialId);

        if (credentialId) {
          setLabelsLoading(true);
          try {
            const loadedLabels = await listLabelsForCredential(credentialId);
            if (active) {
              setLabels(loadedLabels);
            }
          } catch (labelError) {
            console.error('Erro ao carregar etiquetas', labelError);
            if (active) {
              setLabels([]);
              toast({
                title: "Erro ao carregar etiquetas",
                description: "Não foi possível obter as etiquetas atuais",
                variant: "destructive",
              });
            }
          } finally {
            if (active) {
              setLabelsLoading(false);
            }
          }
        } else {
          setLabels([]);
        }
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
  }, [fetchCounts, listLabelsForCredential, navigate, toast]);

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
        name: createName,
        createUser: async ({ email, password, name }) => {
          const { data, error } = await supabase.functions.invoke("admin-create-user", {
            body: { email, password, name },
          });

          if (error) {
            return { error: { message: error.message } };
          }

          if (data && typeof data === "object" && "error" in data && data.error) {
            const errorMessage =
              typeof (data as { error?: unknown }).error === "string"
                ? ((data as { error: string }).error ?? "Erro inesperado")
                : "Erro inesperado";

            return { error: { message: errorMessage } };
          }

          return { error: null };
        },
        fetchCounts,
        updateStats: setStats,
        toast,
      });

      if (result) {
        setCreateEmail("");
        setCreatePassword("");
        setCreateName("");
      }
    } finally {
      setCreatingUser(false);
    }
  };

  const handleCreateLabel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (creatingLabel || !activeCredentialId) {
      return;
    }

    const trimmedName = newLabelName.trim();
    const resolvedColor = newLabelColor.trim() || '#2563eb';

    if (!trimmedName) {
      toast({
        title: "Informe um nome",
        description: "Defina um nome para a etiqueta",
        variant: "destructive",
      });
      return;
    }

    setCreatingLabel(true);

    try {
      const { data, error } = await supabase
        .from('labels')
        .insert({
          name: trimmedName,
          color: resolvedColor,
          credential_id: activeCredentialId,
        })
        .select('id, name, color, credential_id')
        .single();

      if (error) {
        throw error;
      }

      const created: ChatLabel = {
        id: data.id,
        name: data.name,
        color: data.color,
        credentialId: data.credential_id ?? undefined,
      };

      setLabels(prev => {
        const next = [...prev, created];
        next.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        return next;
      });

      setNewLabelName('');
      setNewLabelColor(resolvedColor);

      toast({
        title: "Etiqueta criada",
        description: "Etiqueta adicionada com sucesso",
      });
    } catch (error) {
      console.error('Erro ao criar etiqueta', error);
      toast({
        title: "Erro ao criar etiqueta",
        description: "Não foi possível criar a etiqueta",
        variant: "destructive",
      });
    } finally {
      setCreatingLabel(false);
    }
  };

  const handleUpdateLabel = useCallback(
    async (labelId: string) => {
      const edits = labelEdits[labelId];
      if (!edits) {
        return;
      }

      const trimmedName = edits.name.trim();
      const resolvedColor = edits.color.trim() || '#2563eb';

      if (!trimmedName) {
        toast({
          title: "Informe um nome",
          description: "Defina um nome para a etiqueta",
          variant: "destructive",
        });
        return;
      }

      setUpdatingLabelIds(prev => ({ ...prev, [labelId]: true }));

      try {
        const { error } = await supabase
          .from('labels')
          .update({ name: trimmedName, color: resolvedColor })
          .eq('id', labelId);

        if (error) {
          throw error;
        }

        setLabels(prev =>
          prev
            .map(label => (label.id === labelId ? { ...label, name: trimmedName, color: resolvedColor } : label))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
        );

        toast({
          title: "Etiqueta atualizada",
          description: "Alterações salvas com sucesso",
        });
      } catch (error) {
        console.error('Erro ao atualizar etiqueta', error);
        toast({
          title: "Erro ao atualizar etiqueta",
          description: "Não foi possível salvar as alterações",
          variant: "destructive",
        });
      } finally {
        setUpdatingLabelIds(prev => {
          const next = { ...prev };
          delete next[labelId];
          return next;
        });
      }
    },
    [labelEdits, toast]
  );

  const handleDeleteLabel = useCallback(
    async (labelId: string) => {
      if (deletingLabelId) {
        return;
      }

      setDeletingLabelId(labelId);

      try {
        const { error } = await supabase
          .from('labels')
          .delete()
          .eq('id', labelId);

        if (error) {
          throw error;
        }

        setLabels(prev => prev.filter(label => label.id !== labelId));

        toast({
          title: "Etiqueta removida",
          description: "Etiqueta excluída com sucesso",
        });
      } catch (error) {
        console.error('Erro ao remover etiqueta', error);
        toast({
          title: "Erro ao remover etiqueta",
          description: "Não foi possível excluir a etiqueta",
          variant: "destructive",
        });
      } finally {
        setDeletingLabelId(null);
      }
    },
    [deletingLabelId, toast]
  );

  const handleReloadLabels = useCallback(async () => {
    if (!activeCredentialId) {
      setLabels([]);
      return;
    }

    setLabelsLoading(true);

    try {
      const refreshed = await listLabelsForCredential(activeCredentialId);
      setLabels(refreshed);
    } catch (error) {
      console.error('Erro ao atualizar etiquetas', error);
      toast({
        title: "Erro ao atualizar etiquetas",
        description: "Não foi possível recarregar as etiquetas",
        variant: "destructive",
      });
    } finally {
      setLabelsLoading(false);
    }
  }, [activeCredentialId, listLabelsForCredential, toast]);

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
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="admin-create-name">Nome do agente</Label>
                  <Input
                    id="admin-create-name"
                    type="text"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder="Opcional"
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
          <Card className="border-[hsl(var(--whatsapp-border))] bg-card/80">
            <CardHeader className="pb-2">
              <CardDescription>Organizar atendimentos</CardDescription>
              <CardTitle className="text-2xl text-primary">Etiquetas de conversa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
                onSubmit={handleCreateLabel}
              >
                <div className="space-y-2">
                  <Label htmlFor="admin-label-name">Nome</Label>
                  <Input
                    id="admin-label-name"
                    value={newLabelName}
                    onChange={(event) => setNewLabelName(event.target.value)}
                    placeholder="Ex.: Prioridade"
                    disabled={!activeCredentialId || creatingLabel}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-label-color">Cor</Label>
                  <Input
                    id="admin-label-color"
                    type="color"
                    value={newLabelColor}
                    onChange={(event) => setNewLabelColor(event.target.value)}
                    disabled={!activeCredentialId || creatingLabel}
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Button type="submit" disabled={creatingLabel || !activeCredentialId}>
                    {creatingLabel ? "Adicionando..." : "Adicionar etiqueta"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={labelsLoading || !activeCredentialId}
                    onClick={handleReloadLabels}
                  >
                    {labelsLoading ? "Atualizando..." : "Recarregar"}
                  </Button>
                </div>
              </form>
              <div className="space-y-3">
                {labelsLoading && labels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Carregando etiquetas...</p>
                ) : labels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma etiqueta cadastrada.</p>
                ) : (
                  labels.map((label) => {
                    const editing = labelEdits[label.id] ?? { name: label.name, color: label.color };
                    const isUpdating = Boolean(updatingLabelIds[label.id]);
                    const isDeleting = deletingLabelId === label.id;

                    return (
                      <div
                        key={label.id}
                        className="rounded-md border border-[hsl(var(--whatsapp-border))] bg-card/60 p-3"
                      >
                        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor={`admin-label-edit-name-${label.id}`}>Nome</Label>
                              <Input
                                id={`admin-label-edit-name-${label.id}`}
                                value={editing.name}
                                onChange={(event) =>
                                  setLabelEdits((prev) => ({
                                    ...prev,
                                    [label.id]: {
                                      name: event.target.value,
                                      color: prev[label.id]?.color ?? label.color,
                                    },
                                  }))
                                }
                                disabled={isDeleting}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`admin-label-edit-color-${label.id}`}>Cor</Label>
                              <Input
                                id={`admin-label-edit-color-${label.id}`}
                                type="color"
                                value={editing.color}
                                onChange={(event) =>
                                  setLabelEdits((prev) => ({
                                    ...prev,
                                    [label.id]: {
                                      name: prev[label.id]?.name ?? label.name,
                                      color: event.target.value,
                                    },
                                  }))
                                }
                                disabled={isDeleting}
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              onClick={() => handleUpdateLabel(label.id)}
                              disabled={isUpdating || isDeleting}
                            >
                              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              onClick={() => handleDeleteLabel(label.id)}
                              disabled={isUpdating || isDeleting}
                            >
                              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
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
  }, [
    activeCredentialId,
    authorized,
    createEmail,
    createPassword,
    createName,
    creatingLabel,
    creatingUser,
    deletingLabelId,
    handleCreateLabel,
    handleCreateUser,
    handleDeleteLabel,
    handleReloadLabels,
    handleUpdateLabel,
    labelEdits,
    labels,
    labelsLoading,
    loading,
    newLabelColor,
    newLabelName,
    stats,
    updatingLabelIds,
  ]);

  return content;
};

export default Admin;
