import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { ChatAttendanceStatus, Label as ChatLabel, User as ChatUser } from "@/types/whatsapp";
import { AssignChatDialog } from "@/components/AssignChatDialog";

interface AdminStat {
  key: string;
  title: string;
  description: string;
  value: string;
}

interface ChatSummary {
  chatId: string;
  chatName: string;
  attendanceStatus: string;
  assignedTo: string | null;
  labels: ChatLabel[];
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

type AdminChatSummary = {
  id: string;
  name: string;
  attendanceStatus: ChatAttendanceStatus;
  assignedTo?: string | string[] | null;
  labels: ChatLabel[];
};

const CHAT_PAGE_SIZE = 10;

const attendanceStatusLabels: Record<ChatAttendanceStatus, string> = {
  waiting: "Aguardando atendimento",
  in_service: "Em atendimento",
  finished: "Finalizada",
};

const deriveAttendanceStatus = (chat: any): ChatAttendanceStatus => {
  const raw =
    (typeof chat.attendance_status === "string" && chat.attendance_status.trim()) ||
    (typeof chat.attendanceStatus === "string" && chat.attendanceStatus.trim()) ||
    "";

  const normalized = raw.toLowerCase();

  if (normalized === "in_service") {
    return "in_service";
  }

  if (normalized === "finished") {
    return "finished";
  }

  return "waiting";
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
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [chatSummaries, setChatSummaries] = useState<AdminChatSummary[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatStatusFilter, setChatStatusFilter] = useState<ChatAttendanceStatus | "all">("all");
  const [chatPage, setChatPage] = useState(1);
  const [chatActionIds, setChatActionIds] = useState<Record<string, boolean>>({});
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [chatToAssign, setChatToAssign] = useState<{ id: string; name: string } | null>(null);
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
  const [conversationSummaries, setConversationSummaries] = useState<ChatSummary[]>([]);
  const [conversationSummariesLoading, setConversationSummariesLoading] = useState(false);
  const [conversationLabelFilter, setConversationLabelFilter] = useState<string>("all");
  const [attendanceSummaryFilter, setAttendanceSummaryFilter] = useState<string>("all");
  const [selectedChatIds, setSelectedChatIds] = useState<Record<string, boolean>>({});
  const [bulkLabelId, setBulkLabelId] = useState<string>("");
  const [bulkLabelProcessing, setBulkLabelProcessing] = useState(false);
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

  const fetchAdminChats = useCallback(
    async (credentialIdParam?: string) => {
      const credentialId = credentialIdParam ?? activeCredentialId;

      if (!credentialId) {
        setChatSummaries([]);
        return;
      }

      setChatsLoading(true);

      try {
        const { data, error } = await supabase.functions.invoke("uaz-fetch-chats", {
          body: { credentialId },
        });

        if (error) {
          throw error;
        }

        const rawChats = Array.isArray(data?.chats) ? data.chats : [];

        const mapped = rawChats
          .map((item: any) => {
            const id = typeof item?.id === "string" ? item.id : null;

            if (!id) {
              return null;
            }

            const labelsList = Array.isArray(item?.labels)
              ? item.labels
                  .map((label: any) => {
                    const labelId = typeof label?.id === "string" ? label.id : null;

                    if (!labelId) {
                      return null;
                    }

                    const labelName = typeof label?.name === "string" ? label.name : "";
                    const labelColor = typeof label?.color === "string" ? label.color : null;

                    return { id: labelId, name: labelName, color: labelColor } as ChatLabel;
                  })
                  .filter((label): label is ChatLabel => Boolean(label))
              : [];

            const assignedValue =
              typeof item?.assigned_to === "string" || Array.isArray(item?.assigned_to)
                ? item.assigned_to
                : typeof item?.assignedTo === "string" || Array.isArray(item?.assignedTo)
                  ? item.assignedTo
                  : undefined;

            return {
              id,
              name: typeof item?.name === "string" ? item.name : id,
              attendanceStatus: deriveAttendanceStatus(item),
              assignedTo: assignedValue ?? null,
              labels: labelsList,
            } as AdminChatSummary;
          })
          .filter((chat): chat is AdminChatSummary => Boolean(chat));

        setChatSummaries(mapped);
      } catch (error) {
        console.error("Erro ao carregar conversas", error);
        toast({
          title: "Erro ao carregar conversas",
          description: "Não foi possível obter a lista de conversas",
          variant: "destructive",
        });
      } finally {
        setChatsLoading(false);
      }
    },
    [activeCredentialId, toast],
  );

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

  const usersById = useMemo(() => {
    return usersList.reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {} as Record<string, AdminUser>);
  }, [usersList]);

  const assignableUsers = useMemo<ChatUser[]>(() => {
    return usersList
      .filter(user => user.is_active)
      .map(user => ({
        id: user.id,
        name: user.name?.trim() || user.email,
        email: user.email,
      }));
  }, [usersList]);

  const filteredChats = useMemo(() => {
    if (chatStatusFilter === "all") {
      return chatSummaries;
    }

    return chatSummaries.filter(chat => chat.attendanceStatus === chatStatusFilter);
  }, [chatStatusFilter, chatSummaries]);

  const totalChatPages = useMemo(() => {
    const total = filteredChats.length;
    return total === 0 ? 1 : Math.ceil(total / CHAT_PAGE_SIZE);
  }, [filteredChats.length]);

  const safeChatPage = useMemo(() => {
    return Math.min(chatPage, totalChatPages);
  }, [chatPage, totalChatPages]);

  const paginatedChats = useMemo(() => {
    const startIndex = (safeChatPage - 1) * CHAT_PAGE_SIZE;
    return filteredChats.slice(startIndex, startIndex + CHAT_PAGE_SIZE);
  }, [filteredChats, safeChatPage]);

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

  const handleOpenAssignDialog = useCallback((chat: AdminChatSummary) => {
    setChatToAssign({ id: chat.id, name: chat.name });
    setAssignDialogOpen(true);
  }, []);

  const handleAdminAssignToUser = useCallback(
    async (userId: string) => {
      if (!chatToAssign || !activeCredentialId) {
        return;
      }

      const chatId = chatToAssign.id;
      const targetChat = chatSummaries.find(chat => chat.id === chatId);
      const previousAssigned =
        Array.isArray(targetChat?.assignedTo)
          ? targetChat?.assignedTo[0] ?? null
          : typeof targetChat?.assignedTo === "string"
            ? targetChat?.assignedTo
            : null;

      setChatActionIds(prev => ({ ...prev, [chatId]: true }));

      try {
        const { error } = await supabase
          .from('chats')
          .update({ assigned_to: userId, attendance_status: 'in_service' })
          .eq('id', chatId);

        if (error) {
          throw error;
        }

        const { error: membershipError } = await supabase
          .from('credential_members')
          .upsert(
            {
              credential_id: activeCredentialId,
              user_id: userId,
              role: 'agent',
            },
            { onConflict: 'credential_id,user_id' },
          );

        if (membershipError) {
          throw membershipError;
        }

        if (previousAssigned && previousAssigned !== userId) {
          const { count: remainingAssignments, error: countError } = await supabase
            .from('chats')
            .select('id', { count: 'exact', head: true })
            .eq('credential_id', activeCredentialId)
            .eq('assigned_to', previousAssigned);

          if (countError) {
            throw countError;
          }

          if ((remainingAssignments ?? 0) === 0) {
            const { error: deleteError } = await supabase
              .from('credential_members')
              .delete()
              .eq('credential_id', activeCredentialId)
              .eq('user_id', previousAssigned)
              .eq('role', 'agent');

            if (deleteError) {
              throw deleteError;
            }
          }
        }

        await fetchAdminChats();
      } catch (error) {
        console.error('Erro ao reatribuir conversa', error);
        toast({
          title: "Erro ao reatribuir conversa",
          description: "Não foi possível atualizar o responsável",
          variant: "destructive",
        });
      } finally {
        setChatActionIds(prev => {
          const next = { ...prev };
          delete next[chatId];
          return next;
        });
        setAssignDialogOpen(false);
        setChatToAssign(null);
      }
    },
    [activeCredentialId, chatSummaries, chatToAssign, fetchAdminChats, toast],
  );

  const handleAdminFinishAttendance = useCallback(
    async (chatId: string) => {
      if (!activeCredentialId) {
        return;
      }

      const targetChat = chatSummaries.find(chat => chat.id === chatId);
      const previousAssigned =
        Array.isArray(targetChat?.assignedTo)
          ? targetChat?.assignedTo[0] ?? null
          : typeof targetChat?.assignedTo === "string"
            ? targetChat?.assignedTo
            : null;

      setChatActionIds(prev => ({ ...prev, [chatId]: true }));

      try {
        const { error } = await supabase
          .from('chats')
          .update({ attendance_status: 'finished', assigned_to: null })
          .eq('id', chatId);

        if (error) {
          throw error;
        }

        if (previousAssigned) {
          const { count: remainingAssignments, error: countError } = await supabase
            .from('chats')
            .select('id', { count: 'exact', head: true })
            .eq('credential_id', activeCredentialId)
            .eq('assigned_to', previousAssigned);

          if (countError) {
            throw countError;
          }

          if ((remainingAssignments ?? 0) === 0) {
            const { error: deleteError } = await supabase
              .from('credential_members')
              .delete()
              .eq('credential_id', activeCredentialId)
              .eq('user_id', previousAssigned)
              .eq('role', 'agent');

            if (deleteError) {
              throw deleteError;
            }
          }
        }

        await fetchAdminChats();
        toast({
          title: "Atendimento finalizado",
          description: "Conversa finalizada com sucesso",
        });
      } catch (error) {
        console.error('Erro ao finalizar atendimento', error);
        toast({
          title: "Erro ao finalizar atendimento",
          description: "Não foi possível finalizar esta conversa",
          variant: "destructive",
        });
      } finally {
        setChatActionIds(prev => {
          const next = { ...prev };
          delete next[chatId];
          return next;
        });
      }
    },
    [activeCredentialId, chatSummaries, fetchAdminChats, toast],
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
    setChatPage(1);
  }, [activeCredentialId]);

  useEffect(() => {
    if (chatPage > totalChatPages) {
      setChatPage(totalChatPages);
    }
  }, [chatPage, totalChatPages]);

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

        if (!active) {
          return;
        }

        await fetchAdminChats(credentialId ?? undefined);
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
  }, [fetchAdminChats, fetchCounts, fetchUsers, listLabelsForCredential, navigate, toast]);

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

  const fetchChatSummaries = useCallback(async () => {
    if (!activeCredentialId) {
      setConversationSummaries([]);
      setSelectedChatIds({});
      setConversationSummariesLoading(false);
      return;
    }

    setConversationSummariesLoading(true);

    try {
      const { data, error } = await supabase
        .from('chats')
        .select(
          'id, name, attendance_status, assigned_to, credential_id, chat_labels(label_id, labels(id, name, color, credential_id))',
        )
        .eq('credential_id', activeCredentialId);

      if (error) {
        throw error;
      }

      const rows = Array.isArray(data) ? data : [];

      const parsed = rows.reduce<ChatSummary[]>((acc, row) => {
        if (!row || typeof row.id !== 'string') {
          return acc;
        }

        const name = typeof row.name === 'string' ? row.name : '';
        const status =
          typeof row.attendance_status === 'string' && row.attendance_status.trim() !== ''
            ? row.attendance_status
            : 'sem_status';
        const assigned =
          typeof row.assigned_to === 'string' && row.assigned_to.trim() !== ''
            ? row.assigned_to
            : null;

        const labelEntries = Array.isArray((row as { chat_labels?: unknown }).chat_labels)
          ? ((row as { chat_labels: unknown[] }).chat_labels ?? [])
          : [];
        const uniqueLabels = new Map<string, ChatLabel>();

        labelEntries.forEach((entry) => {
          const typedEntry = entry as { labels?: unknown };
          const label = typedEntry?.labels as {
            id?: unknown;
            name?: unknown;
            color?: unknown;
            credential_id?: unknown;
          } | null;

          if (!label || typeof label.id !== 'string') {
            return;
          }

          const labelName = typeof label.name === 'string' ? label.name : '';
          const labelColor = typeof label.color === 'string' ? label.color : '#2563eb';
          const credentialId =
            typeof label.credential_id === 'string' ? label.credential_id : undefined;

          uniqueLabels.set(label.id, {
            id: label.id,
            name: labelName,
            color: labelColor,
            credentialId,
          });
        });

        const sortedLabels = Array.from(uniqueLabels.values()).sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR'),
        );

        acc.push({
          chatId: row.id,
          chatName: name,
          attendanceStatus: status,
          assignedTo: assigned,
          labels: sortedLabels,
        });

        return acc;
      }, []);

      parsed.sort((a, b) => a.chatName.localeCompare(b.chatName, 'pt-BR'));

      setConversationSummaries(parsed);
      setSelectedChatIds((prev) => {
        const next: Record<string, boolean> = {};
        parsed.forEach((chat) => {
          if (prev[chat.chatId]) {
            next[chat.chatId] = true;
          }
        });
        return next;
      });
    } catch (error) {
      console.error('Erro ao carregar conversas por etiqueta', error);
      toast({
        title: "Erro ao carregar conversas",
        description: "Não foi possível obter as conversas com etiquetas",
        variant: "destructive",
      });
      setConversationSummaries([]);
      setSelectedChatIds({});
    } finally {
      setConversationSummariesLoading(false);
    }
  }, [activeCredentialId, toast]);

  useEffect(() => {
    fetchChatSummaries();
  }, [fetchChatSummaries]);

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

      await fetchChatSummaries();

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

        await fetchChatSummaries();

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
    [fetchChatSummaries, labelEdits, toast]
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

        await fetchChatSummaries();

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
    [deletingLabelId, fetchChatSummaries, toast]
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
      await fetchChatSummaries();
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
  }, [activeCredentialId, fetchChatSummaries, listLabelsForCredential, toast]);

  const labelCounts = useMemo(() => {
    const counts = new Map<string, number>();

    conversationSummaries.forEach(chat => {
      chat.labels.forEach(label => {
        counts.set(label.id, (counts.get(label.id) ?? 0) + 1);
      });
    });

    return labels.map(label => ({
      id: label.id,
      name: label.name,
      color: label.color,
      count: counts.get(label.id) ?? 0,
    }));
  }, [conversationSummaries, labels]);

  const labelCountsMap = useMemo(() => {
    return labelCounts.reduce<Record<string, number>>((acc, current) => {
      acc[current.id] = current.count;
      return acc;
    }, {});
  }, [labelCounts]);

  const chatsWithoutLabelCount = useMemo(
    () => conversationSummaries.filter(chat => chat.labels.length === 0).length,
    [conversationSummaries],
  );

  const totalChats = conversationSummaries.length;

  const attendanceOptions = useMemo(() => {
    const values = new Set<string>();
    conversationSummaries.forEach(chat => {
      values.add(chat.attendanceStatus);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [conversationSummaries]);

  const filteredChatSummaries = useMemo(() => {
    return conversationSummaries.filter(chat => {
      const matchesLabel =
        conversationLabelFilter === 'all'
          ? true
          : chat.labels.some(label => label.id === conversationLabelFilter);
      const matchesAttendance =
        attendanceSummaryFilter === 'all'
          ? true
          : chat.attendanceStatus === attendanceSummaryFilter;
      return matchesLabel && matchesAttendance;
    });
  }, [attendanceSummaryFilter, conversationSummaries, conversationLabelFilter]);

  const filteredSelectedCount = useMemo(
    () => filteredChatSummaries.filter(chat => selectedChatIds[chat.chatId]).length,
    [filteredChatSummaries, selectedChatIds],
  );

  const selectedCount = useMemo(
    () => Object.values(selectedChatIds).filter(Boolean).length,
    [selectedChatIds],
  );

  const masterCheckboxState = useMemo<boolean | "indeterminate">(() => {
    if (filteredChatSummaries.length === 0) {
      return false;
    }

    if (filteredSelectedCount === filteredChatSummaries.length) {
      return true;
    }

    if (filteredSelectedCount > 0) {
      return "indeterminate";
    }

    return false;
  }, [filteredChatSummaries.length, filteredSelectedCount]);

  const handleSelectChat = useCallback((chatId: string, checked: boolean) => {
    setSelectedChatIds(prev => {
      const next = { ...prev };
      if (checked) {
        next[chatId] = true;
      } else {
        delete next[chatId];
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedChatIds(prev => {
        const next = { ...prev };
        if (checked) {
          filteredChatSummaries.forEach(chat => {
            next[chat.chatId] = true;
          });
        } else {
          filteredChatSummaries.forEach(chat => {
            delete next[chat.chatId];
          });
        }
        return next;
      });
    },
    [filteredChatSummaries],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedChatIds({});
  }, []);

  const handleBulkApply = useCallback(async () => {
    if (!bulkLabelId) {
      toast({
        title: "Selecione uma etiqueta",
        description: "Escolha a etiqueta que será aplicada",
        variant: "destructive",
      });
      return;
    }

    const chatIds = Object.entries(selectedChatIds)
      .filter(([, value]) => value)
      .map(([chatId]) => chatId);

    if (chatIds.length === 0) {
      toast({
        title: "Selecione conversas",
        description: "Escolha ao menos uma conversa para aplicar a etiqueta",
        variant: "destructive",
      });
      return;
    }

    setBulkLabelProcessing(true);

    try {
      const existing = new Set<string>();
      conversationSummaries.forEach(chat => {
        if (chat.labels.some(label => label.id === bulkLabelId)) {
          existing.add(chat.chatId);
        }
      });

      const records = chatIds
        .filter(chatId => !existing.has(chatId))
        .map(chatId => ({ chat_id: chatId, label_id: bulkLabelId }));

      if (records.length > 0) {
        const { error } = await supabase.from('chat_labels').insert(records);
        if (error) {
          throw error;
        }
      }

      await fetchChatSummaries();

      toast({
        title: records.length === 0 ? "Nenhuma alteração" : "Etiqueta aplicada",
        description:
          records.length === 0
            ? "As conversas selecionadas já possuíam esta etiqueta"
            : "Etiqueta aplicada às conversas selecionadas",
      });
    } catch (error) {
      console.error('Erro ao aplicar etiqueta em lote', error);
      toast({
        title: "Erro ao aplicar etiqueta",
        description: "Não foi possível aplicar a etiqueta nas conversas selecionadas",
        variant: "destructive",
      });
    } finally {
      setBulkLabelProcessing(false);
    }
  }, [bulkLabelId, conversationSummaries, fetchChatSummaries, selectedChatIds, toast]);

  const handleBulkRemove = useCallback(async () => {
    if (!bulkLabelId) {
      toast({
        title: "Selecione uma etiqueta",
        description: "Escolha a etiqueta que será removida",
        variant: "destructive",
      });
      return;
    }

    const chatIds = Object.entries(selectedChatIds)
      .filter(([, value]) => value)
      .map(([chatId]) => chatId);

    if (chatIds.length === 0) {
      toast({
        title: "Selecione conversas",
        description: "Escolha ao menos uma conversa para remover a etiqueta",
        variant: "destructive",
      });
      return;
    }

    const targets = conversationSummaries
      .filter(chat => chat.labels.some(label => label.id === bulkLabelId) && chatIds.includes(chat.chatId))
      .map(chat => chat.chatId);

    setBulkLabelProcessing(true);

    try {
      if (targets.length > 0) {
        const { error } = await supabase
          .from('chat_labels')
          .delete()
          .eq('label_id', bulkLabelId)
          .in('chat_id', targets);

        if (error) {
          throw error;
        }
      }

      await fetchChatSummaries();

      toast({
        title: targets.length === 0 ? "Nenhuma alteração" : "Etiqueta removida",
        description:
          targets.length === 0
            ? "As conversas selecionadas não possuíam esta etiqueta"
            : "Etiqueta removida das conversas selecionadas",
      });
    } catch (error) {
      console.error('Erro ao remover etiqueta em lote', error);
      toast({
        title: "Erro ao remover etiqueta",
        description: "Não foi possível remover a etiqueta das conversas selecionadas",
        variant: "destructive",
      });
    } finally {
      setBulkLabelProcessing(false);
    }
  }, [bulkLabelId, conversationSummaries, fetchChatSummaries, selectedChatIds, toast]);

  const handleExportCsv = useCallback(() => {
    if (labelCounts.length === 0 && chatsWithoutLabelCount === 0 && totalChats === 0) {
      toast({
        title: "Nada para exportar",
        description: "Não há conversas disponíveis para exportação",
        variant: "destructive",
      });
      return;
    }

    const header = ['Etiqueta', 'Conversas'];
    const rows = labelCounts.map(item => {
      const escaped = item.name.replace(/"/g, '""');
      return `"${escaped}",${item.count}`;
    });
    rows.push(`"Sem etiqueta",${chatsWithoutLabelCount}`);
    rows.push(`"Total",${totalChats}`);

    const csvContent = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'conversas_por_etiqueta.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [chatsWithoutLabelCount, labelCounts, toast, totalChats]);

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

    const totalChats = filteredChats.length;
    const startRange = totalChats === 0 ? 0 : (safeChatPage - 1) * CHAT_PAGE_SIZE + 1;
    const endRange = totalChats === 0 ? 0 : Math.min(safeChatPage * CHAT_PAGE_SIZE, totalChats);

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
              <CardDescription>Acompanhar atendimentos</CardDescription>
              <CardTitle className="text-2xl text-primary">Conversas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                  <Label htmlFor="admin-chat-status">Status</Label>
                  <Select
                    value={chatStatusFilter}
                    onValueChange={(value) => {
                      setChatStatusFilter(value as ChatAttendanceStatus | "all");
                      setChatPage(1);
                    }}
                  >
                    <SelectTrigger id="admin-chat-status" className="w-[220px]">
                      <SelectValue placeholder="Filtrar status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="waiting">Aguardando atendimento</SelectItem>
                      <SelectItem value="in_service">Em atendimento</SelectItem>
                      <SelectItem value="finished">Finalizadas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => fetchAdminChats()} disabled={chatsLoading}>
                    {chatsLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Atualizando...
                      </span>
                    ) : (
                      "Recarregar"
                    )}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contato</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rótulos</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chatsLoading && paginatedChats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6">
                          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Carregando conversas...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : paginatedChats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                          Nenhuma conversa encontrada.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedChats.map((chat) => {
                        const busy = Boolean(chatActionIds[chat.id]);
                        const assignedIds = Array.isArray(chat.assignedTo)
                          ? chat.assignedTo.filter((id): id is string => typeof id === "string")
                          : typeof chat.assignedTo === "string"
                            ? [chat.assignedTo]
                            : [];
                        const assignedNames =
                          assignedIds.length > 0
                            ? assignedIds.map((id) => {
                                const user = usersById[id];
                                return user?.name?.trim() || user?.email || id;
                              })
                            : [];
                        const displayAssigned =
                          assignedNames.length > 0 ? assignedNames.join(", ") : "Não atribuído";
                        const labelBadges = chat.labels;
                        const statusLabel = attendanceStatusLabels[chat.attendanceStatus];
                        const finished = chat.attendanceStatus === "finished";

                        return (
                          <TableRow key={chat.id}>
                            <TableCell className="font-medium">{chat.name}</TableCell>
                            <TableCell>{displayAssigned}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{statusLabel}</Badge>
                            </TableCell>
                            <TableCell>
                              {labelBadges.length === 0 ? (
                                <span className="text-sm text-muted-foreground">Sem rótulos</span>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {labelBadges.map((label) => (
                                    <Badge key={label.id} variant="outline">
                                      {label.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenAssignDialog(chat)}
                                  disabled={busy || chatsLoading}
                                >
                                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reatribuir"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleAdminFinishAttendance(chat.id)}
                                  disabled={busy || chatsLoading || finished}
                                >
                                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finalizar"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted-foreground">
                  {totalChats === 0
                    ? "Nenhuma conversa disponível"
                    : `Mostrando ${startRange} - ${endRange} de ${totalChats}`}
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatPage((prev) => Math.max(prev - 1, 1))}
                    disabled={safeChatPage <= 1 || totalChats === 0}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {totalChats === 0 ? 0 : safeChatPage} de {totalChats === 0 ? 0 : totalChatPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatPage((prev) => Math.min(prev + 1, totalChatPages))}
                    disabled={safeChatPage >= totalChatPages || totalChats === 0}
                  >
                    Próxima
                  </Button>
                </div>
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
          <Card className="border-[hsl(var(--whatsapp-border))] bg-card/80">
            <CardHeader className="pb-2">
              <CardDescription>Acompanhar conversas etiquetadas e aplicar ações em lote</CardDescription>
              <CardTitle className="text-2xl text-primary">Conversas por etiqueta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="space-y-2">
                    <Label htmlFor="admin-label-filter">Etiqueta</Label>
                    <Select
                      value={conversationLabelFilter}
                      onValueChange={value => setConversationLabelFilter(value)}
                    >
                      <SelectTrigger id="admin-label-filter" className="w-[220px]">
                        <SelectValue placeholder="Filtrar etiqueta" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas ({totalChats})</SelectItem>
                        {labelCounts.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} ({item.count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-attendance-filter">Status do atendimento</Label>
                    <Select
                      value={attendanceSummaryFilter}
                      onValueChange={value => setAttendanceSummaryFilter(value)}
                    >
                      <SelectTrigger id="admin-attendance-filter" className="w-[220px]">
                        <SelectValue placeholder="Filtrar status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {attendanceOptions.map(status => (
                          <SelectItem key={status} value={status}>
                            {status === 'sem_status' ? 'Não definido' : status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    variant="outline"
                    onClick={fetchChatSummaries}
                    disabled={conversationSummariesLoading}
                  >
                    {conversationSummariesLoading ? "Atualizando..." : "Recarregar"}
                  </Button>
                  <Button
                    onClick={handleExportCsv}
                    disabled={conversationSummaries.length === 0 && labelCounts.length === 0 && chatsWithoutLabelCount === 0}
                  >
                    Exportar CSV
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-md border border-[hsl(var(--whatsapp-border))]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Etiqueta</TableHead>
                        <TableHead>Cor</TableHead>
                        <TableHead className="text-right">Conversas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {labelCounts.length === 0 && chatsWithoutLabelCount === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-4 text-center text-sm text-muted-foreground">
                            Nenhuma etiqueta disponível.
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {labelCounts.map(item => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                                  <span className="text-xs text-muted-foreground">{item.color}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{item.count}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell className="font-medium">Sem etiqueta</TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">-</span>
                            </TableCell>
                            <TableCell className="text-right">{chatsWithoutLabelCount}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Total</TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">-</span>
                            </TableCell>
                            <TableCell className="text-right">{totalChats}</TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="text-sm text-muted-foreground">Selecionadas: {selectedCount}</div>
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <div className="space-y-2">
                        <Label htmlFor="admin-bulk-label">Etiqueta para ação</Label>
                        <Select
                          value={bulkLabelId || 'none'}
                          onValueChange={value => setBulkLabelId(value === 'none' ? '' : value)}
                        >
                          <SelectTrigger id="admin-bulk-label" className="w-[240px]">
                            <SelectValue placeholder="Selecionar etiqueta" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhuma</SelectItem>
                            {labels.map(label => (
                              <SelectItem key={label.id} value={label.id}>
                                {label.name} ({labelCountsMap[label.id] ?? 0})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          onClick={handleBulkApply}
                          disabled={bulkLabelProcessing || !bulkLabelId || selectedCount === 0}
                        >
                          {bulkLabelProcessing ? "Processando..." : "Aplicar etiqueta"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleBulkRemove}
                          disabled={bulkLabelProcessing || !bulkLabelId || selectedCount === 0}
                        >
                          {bulkLabelProcessing ? "Processando..." : "Remover etiqueta"}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={handleClearSelection}
                          disabled={selectedCount === 0}
                        >
                          Limpar seleção
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={masterCheckboxState}
                              onCheckedChange={checked => handleToggleSelectAll(checked === true)}
                              disabled={conversationSummariesLoading || filteredChatSummaries.length === 0}
                            />
                          </TableHead>
                          <TableHead>Conversa</TableHead>
                          <TableHead>Etiquetas</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Responsável</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {conversationSummariesLoading ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-6">
                              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Carregando conversas...
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : filteredChatSummaries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                              Nenhuma conversa encontrada.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredChatSummaries.map(chat => {
                            const isSelected = Boolean(selectedChatIds[chat.chatId]);

                            return (
                              <TableRow key={chat.chatId}>
                                <TableCell>
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={checked => handleSelectChat(chat.chatId, checked === true)}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{chat.chatName}</TableCell>
                                <TableCell>
                                  {chat.labels.length === 0 ? (
                                    <span className="text-sm text-muted-foreground">Sem etiqueta</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {chat.labels.map(label => (
                                        <div
                                          key={label.id}
                                          className="flex items-center gap-2 rounded-md border border-[hsl(var(--whatsapp-border))] px-2 py-1 text-xs"
                                        >
                                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
                                          <span>{label.name}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {chat.attendanceStatus === 'sem_status'
                                    ? 'Não definido'
                                    : chat.attendanceStatus}
                                </TableCell>
                                <TableCell>
                                  {chat.assignedTo ? (
                                    chat.assignedTo
                                  ) : (
                                    <span className="text-sm text-muted-foreground">Sem responsável</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
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
          <AssignChatDialog
            key={chatToAssign?.id ?? 'assign-dialog'}
            open={assignDialogOpen}
            onOpenChange={(open) => {
              setAssignDialogOpen(open);
              if (!open) {
                setChatToAssign(null);
              }
            }}
            chatName={chatToAssign?.name ?? "Conversa"}
            users={assignableUsers}
            onAssign={handleAdminAssignToUser}
          />
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
    attendanceOptions,
    attendanceSummaryFilter,
    authorized,
    bulkLabelId,
    bulkLabelProcessing,
    chatSummaries,
    conversationSummaries,
    conversationSummariesLoading,
    chatsWithoutLabelCount,
    conversationLabelFilter,
    editDialogOpen,
    editEmail,
    editName,
    fetchChatSummaries,
    fetchUsers,
    filteredChatSummaries,
    filteredUsers,
    assignDialogOpen,
    assignableUsers,
    authorized,
    chatActionIds,
    chatStatusFilter,
    chatSummaries,
    chatToAssign,
    chatsLoading,
    createEmail,
    createName,
    createPassword,
    creatingLabel,
    creatingUser,
    deletingLabelId,
    handleBulkApply,
    handleBulkRemove,
    handleClearSelection,
    editDialogOpen,
    editEmail,
    editName,
    fetchAdminChats,
    fetchUsers,
    filteredChats,
    filteredUsers,
    handleAdminAssignToUser,
    handleAdminFinishAttendance,
    handleCloseEditUser,
    handleCreateLabel,
    handleCreateUser,
    handleDeleteLabel,
    handleExportCsv,
    handleOpenAssignDialog,
    handleOpenEditUser,
    handleReloadLabels,
    handleSelectChat,
    handleRoleUpdate,
    handleSaveUser,
    handleToggleUserActive,
    handleToggleSelectAll,
    handleUpdateLabel,
    labelEdits,
    labelCounts,
    labelCountsMap,
    labels,
    labelsLoading,
    masterCheckboxState,
    loading,
    newLabelColor,
    newLabelName,
    paginatedChats,
    roleFilter,
    selectedChatIds,
    selectedCount,
    savingUser,
    stats,
    statusFilter,
    totalChats,
    safeChatPage,
    savingUser,
    stats,
    statusFilter,
    totalChatPages,
    userActionIds,
    usersById,
    usersLoading,
    updatingLabelIds,
  ]);

  return content;
};

export default Admin;
