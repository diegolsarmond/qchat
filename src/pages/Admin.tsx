import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

type AdminUser = Tables<'users'>;
type UserRole = AdminUser['role'];
const userRoleOptions: UserRole[] = ["admin", "supervisor", "agent"];

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
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [userActionIds, setUserActionIds] = useState<Record<string, boolean>>({});
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingUser, setSavingUser] = useState(false);
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

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, is_active, created_at, updated_at')
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      setUsersList(data ?? []);
    } catch (error) {
      console.error('Erro ao carregar usuários', error);
      toast({
        title: "Erro ao carregar usuários",
        description: "Não foi possível obter a lista de usuários",
        variant: "destructive",
      });
    } finally {
      setUsersLoading(false);
    }
  }, [toast]);

  const filteredUsers = useMemo(() => {
    return usersList.filter((user) => {
      const statusMatch =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? user.is_active
            : !user.is_active;
      const roleMatch = roleFilter === "all" ? true : user.role === roleFilter;
      return statusMatch && roleMatch;
    });
  }, [usersList, statusFilter, roleFilter]);

  const handleOpenEditUser = useCallback((user: AdminUser) => {
    setEditUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditDialogOpen(true);
  }, []);

  const handleCloseEditUser = useCallback(() => {
    setEditDialogOpen(false);
    setEditUser(null);
    setEditName("");
    setEditEmail("");
  }, []);

  const handleSaveUser = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editUser) {
      return;
    }

    const nextName = editName.trim();
    const nextEmail = editEmail.trim();

    if (!nextName || !nextEmail) {
      toast({
        title: "Preencha os campos",
        description: "Informe nome e e-mail válidos",
        variant: "destructive",
      });
      return;
    }

    setSavingUser(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({ name: nextName, email: nextEmail })
        .eq('id', editUser.id);

      if (error) {
        throw error;
      }

      setUsersList((prev) =>
        prev.map((user) => (user.id === editUser.id ? { ...user, name: nextName, email: nextEmail } : user)),
      );
      toast({
        title: "Usuário atualizado",
        description: "Informações salvas com sucesso",
      });
      handleCloseEditUser();
    } catch (error) {
      console.error('Erro ao atualizar usuário', error);
      toast({
        title: "Erro ao atualizar usuário",
        description: "Não foi possível salvar as alterações",
        variant: "destructive",
      });
    } finally {
      setSavingUser(false);
    }
  }, [editEmail, editName, editUser, handleCloseEditUser, toast]);

  const handleToggleUserActive = useCallback(
    async (user: AdminUser) => {
      const nextActive = !user.is_active;
      setUserActionIds((prev) => ({ ...prev, [user.id]: true }));

      try {
        const { error } = await supabase
          .from('users')
          .update({ is_active: nextActive })
          .eq('id', user.id);

        if (error) {
          throw error;
        }

        setUsersList((prev) =>
          prev.map((current) => (current.id === user.id ? { ...current, is_active: nextActive } : current)),
        );

        toast({
          title: nextActive ? "Usuário ativado" : "Usuário desativado",
          description: "Alteração aplicada com sucesso",
        });
      } catch (error) {
        console.error('Erro ao atualizar status do usuário', error);
        toast({
          title: "Erro ao atualizar status",
          description: "Não foi possível aplicar a alteração",
          variant: "destructive",
        });
      } finally {
        setUserActionIds((prev) => {
          const next = { ...prev };
          delete next[user.id];
          return next;
        });
      }
    },
    [toast],
  );

  const handleRoleUpdate = useCallback(
    async (user: AdminUser, nextRole: UserRole) => {
      if (user.role === nextRole) {
        return;
      }

      setUserActionIds((prev) => ({ ...prev, [user.id]: true }));

      try {
        const { error } = await supabase
          .from('users')
          .update({ role: nextRole })
          .eq('id', user.id);

        if (error) {
          throw error;
        }

        setUsersList((prev) =>
          prev.map((current) => (current.id === user.id ? { ...current, role: nextRole } : current)),
        );

        toast({
          title: "Papel atualizado",
          description: "Permissões ajustadas com sucesso",
        });
      } catch (error) {
        console.error('Erro ao atualizar papel do usuário', error);
        toast({
          title: "Erro ao atualizar papel",
          description: "Não foi possível aplicar o novo papel",
          variant: "destructive",
        });
      } finally {
        setUserActionIds((prev) => {
          const next = { ...prev };
          delete next[user.id];
          return next;
        });
      }
    },
    [toast],
  );

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

        await fetchUsers();

        if (!active) {
          return;
        }

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
  }, [fetchCounts, fetchUsers, listLabelsForCredential, navigate, toast]);

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
              <CardDescription>Visualizar e manter usuários</CardDescription>
              <CardTitle className="text-2xl text-primary">Usuários cadastrados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="space-y-2">
                    <Label htmlFor="admin-filter-status">Status</Label>
                    <Select
                      value={statusFilter}
                      onValueChange={(value) =>
                        setStatusFilter(value as "all" | "active" | "inactive")
                      }
                    >
                      <SelectTrigger id="admin-filter-status" className="w-[160px]">
                        <SelectValue placeholder="Filtrar status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="active">Ativos</SelectItem>
                        <SelectItem value="inactive">Inativos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-filter-role">Papel</Label>
                    <Select
                      value={roleFilter}
                      onValueChange={(value) => setRoleFilter(value as "all" | UserRole)}
                    >
                      <SelectTrigger id="admin-filter-role" className="w-[180px]">
                        <SelectValue placeholder="Filtrar papel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="supervisor">Supervisor</SelectItem>
                        <SelectItem value="agent">Agente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button variant="outline" onClick={fetchUsers} disabled={usersLoading}>
                  {usersLoading ? "Atualizando..." : "Recarregar"}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6">
                          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Carregando usuários...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                          Nenhum usuário encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => {
                        const busy = Boolean(userActionIds[user.id]);

                        return (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.name}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                              <Select
                                value={user.role}
                                onValueChange={(value) =>
                                  handleRoleUpdate(user, value as UserRole)
                                }
                                disabled={busy || usersLoading}
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {userRoleOptions.map((role) => (
                                    <SelectItem key={role} value={role}>
                                      {role === "admin"
                                        ? "Administrador"
                                        : role === "supervisor"
                                          ? "Supervisor"
                                          : "Agente"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={user.is_active}
                                  onCheckedChange={(checked) => {
                                    if (checked !== user.is_active) {
                                      handleToggleUserActive(user);
                                    }
                                  }}
                                  disabled={busy || usersLoading}
                                />
                                <span className="text-sm text-muted-foreground">
                                  {user.is_active ? "Ativo" : "Inativo"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenEditUser(user)}
                                disabled={busy || usersLoading}
                              >
                                Editar
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
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
          <Dialog
            open={editDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseEditUser();
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar usuário</DialogTitle>
                <DialogDescription>Atualize os dados de contato do colaborador.</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleSaveUser}>
                <div className="space-y-2">
                  <Label htmlFor="admin-edit-name">Nome</Label>
                  <Input
                    id="admin-edit-name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-edit-email">E-mail</Label>
                  <Input
                    id="admin-edit-email"
                    type="email"
                    value={editEmail}
                    onChange={(event) => setEditEmail(event.target.value)}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleCloseEditUser}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={savingUser}>
                    {savingUser ? "Salvando..." : "Salvar alterações"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }, [
    activeCredentialId,
    authorized,
    editDialogOpen,
    editEmail,
    editName,
    fetchUsers,
    filteredUsers,
    createEmail,
    createPassword,
    createName,
    creatingLabel,
    creatingUser,
    deletingLabelId,
    handleCloseEditUser,
    handleCreateLabel,
    handleCreateUser,
    handleDeleteLabel,
    handleOpenEditUser,
    handleRoleUpdate,
    handleReloadLabels,
    handleSaveUser,
    handleToggleUserActive,
    handleUpdateLabel,
    labelEdits,
    labels,
    labelsLoading,
    loading,
    newLabelColor,
    newLabelName,
    roleFilter,
    savingUser,
    stats,
    statusFilter,
    userActionIds,
    usersLoading,
    updatingLabelIds,
  ]);

  return content;
};

export default Admin;
