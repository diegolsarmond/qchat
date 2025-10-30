import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CredentialSetup } from "@/components/CredentialSetup";
import { QRCodeScanner } from "@/components/QRCodeScanner";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatArea } from "@/components/ChatArea";
import { AssignChatDialog } from "@/components/AssignChatDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Chat,
  ChatAttendanceStatus,
  ChatFilter,
  Label,
  Message,
  User as WhatsAppUser,
  SendMessagePayload,
  Label,
} from "@/types/whatsapp";
import { mergeFetchedMessages } from "@/lib/message-order";
import {
  applyMessagePaginationUpdate,
  createInitialMessagePagination,
} from "@/lib/message-pagination";

const MESSAGE_PAGE_SIZE = 50;
const ALLOWED_ROLES = ["admin", "supervisor", "agent", "owner"];

const formatTimestamp = (value: number | string | null | undefined) =>
  new Date(value ?? Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const extractMessageTimestamp = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 1_000_000_000_000) {
      return value * 1000;
    }
    return value;
  }

  if (typeof value === "string") {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return extractMessageTimestamp(numericValue);
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
};

export const mapApiMessage = (m: any): Message => ({
  id: m.wa_message_id ?? m.id,
  chatId: m.chat_id,
  content: m.content || "",
  timestamp: formatTimestamp(m.message_timestamp),
  messageTimestamp: extractMessageTimestamp(m.message_timestamp),
  from: m.from_me ? "me" : "them",
  status: m.status,
  messageType: m.message_type,
  mediaType: m.media_type,
  caption: m.caption,
  documentName: m.document_name,
  mediaUrl: m.media_url,
  mediaBase64: m.media_base64,
  isPrivate: Boolean(m.is_private),
});

const Index = () => {
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<WhatsAppUser[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [chatToAssign, setChatToAssign] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [messagePagination, setMessagePagination] = useState(() =>
    createInitialMessagePagination(MESSAGE_PAGE_SIZE)
  );
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [isPrependingMessages, setIsPrependingMessages] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [credentialRole, setCredentialRole] = useState<string | null>(null);
  const [credentialProfile, setCredentialProfile] = useState({
    profileName: null as string | null,
    phoneNumber: null as string | null,
  });
  const { toast } = useToast();
  const connectionCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedChatIdRef = useRef<string | null>(null);

  const clearConnectionInterval = useCallback(() => {
    if (connectionCheckIntervalRef.current) {
      clearInterval(connectionCheckIntervalRef.current);
      connectionCheckIntervalRef.current = null;
    }
  }, []);

  const fetchCredentialProfile = useCallback(
    async (id: string) => {
      if (!id) {
        setCredentialProfile({ profileName: null, phoneNumber: null });
        return;
      }

      const { data, error } = await supabase
        .from('credentials')
        .select('profile_name, phone_number')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching credential profile:', error);
        setCredentialProfile({ profileName: null, phoneNumber: null });
        return;
      }

      setCredentialProfile({
        profileName: data?.profile_name ?? null,
        phoneNumber: data?.phone_number ?? null,
      });
    },
    []
  );

  const clearCredentialProfile = useCallback(() => {
    setCredentialProfile({ profileName: null, phoneNumber: null });
  }, []);

  const clearConnectionState = useCallback(() => {
    setIsConnected(false);
    setSelectedChat(null);
    setChats([]);
    setMessages([]);
    setAssignDialogOpen(false);
    setChatToAssign(null);
    setMessagePagination(createInitialMessagePagination(MESSAGE_PAGE_SIZE));
    setShowSidebar(true);
    setIsLoadingMoreMessages(false);
    setIsPrependingMessages(false);
    clearCredentialProfile();

    if (typeof window !== "undefined") {
      window.localStorage?.removeItem("activeCredentialId");
    }
  }, [clearCredentialProfile]);

  const handleConnectionLost = useCallback(() => {
    clearConnectionInterval();
    clearConnectionState();
    toast({
      title: "Desconectado",
      description: "Conexão perdida. Escaneie o QR code novamente.",
    });
  }, [clearConnectionInterval, clearConnectionState, toast]);

  const usersById = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.name;
    });
    return map;
  }, [users]);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from('users').select('*');
    if (data) {
      setUsers(data.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar || undefined,
      })));
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadSessionRole = async () => {
      const sessionResult = await supabase.auth.getSession();
      if (!active) {
        return;
      }
      const session = sessionResult.data.session;
      setSessionUserId(session?.user?.id ?? null);
      const appMetadata = (session?.user as { app_metadata?: Record<string, unknown> | undefined })?.app_metadata ?? {};
      const directRole = typeof appMetadata.role === "string" ? appMetadata.role.toLowerCase() : null;
      const metadataRoles = Array.isArray((appMetadata as { roles?: unknown }).roles)
        ? ((appMetadata as { roles?: string[] }).roles ?? [])
        : [];
      const normalizedRoles = [
        directRole,
        ...metadataRoles
          .filter((role): role is string => typeof role === "string" && role.trim().length > 0)
          .map(role => role.toLowerCase()),
      ];
      if (appMetadata.is_admin === true) {
        normalizedRoles.push("admin");
      }
      if (appMetadata.is_supervisor === true) {
        normalizedRoles.push("supervisor");
      }
      const cleanedRoles = normalizedRoles.filter((role): role is string => Boolean(role) && ALLOWED_ROLES.includes(role));
      const resolvedRole =
        cleanedRoles.find(role => role === "admin") ??
        cleanedRoles.find(role => role === "supervisor") ??
        cleanedRoles[0] ??
        null;
      setUserRole(resolvedRole);
    };

    loadSessionRole();

    return () => {
      active = false;
    };
  }, []);

  const normalizedUserRole = useMemo(() => (typeof userRole === "string" ? userRole.toLowerCase() : null), [userRole]);
  const normalizedCredentialRole = useMemo(
    () => (typeof credentialRole === "string" ? credentialRole.toLowerCase() : null),
    [credentialRole]
  );
  const canManageAttendance = useMemo(() => {
    const rolesToCheck = [normalizedUserRole, normalizedCredentialRole];
    return rolesToCheck.some(role => role === "admin" || role === "supervisor");
  }, [normalizedCredentialRole, normalizedUserRole]);

  useEffect(() => {
    let active = true;

    const loadCredentialRole = async () => {
      if (!credentialId || !sessionUserId) {
        if (active) {
          setCredentialRole(null);
        }
        return;
      }

      const { data, error } = await supabase
        .from('credential_members')
        .select('role')
        .eq('credential_id', credentialId)
        .eq('user_id', sessionUserId);

      if (!active) {
        return;
      }

      if (error) {
        console.error('Error fetching credential role:', error);
        setCredentialRole(null);
        return;
      }

      const membershipRoles = (data ?? [])
        .map(entry => (typeof entry.role === "string" ? entry.role.toLowerCase() : null))
        .filter((role): role is string => Boolean(role) && ALLOWED_ROLES.includes(role));

      const resolvedMembershipRole =
        membershipRoles.find(role => role === "admin") ??
        membershipRoles.find(role => role === "supervisor") ??
        membershipRoles[0] ??
        null;

      setCredentialRole(resolvedMembershipRole);
    };

    loadCredentialRole();

    return () => {
      active = false;
    };
  }, [credentialId, sessionUserId]);

  useEffect(() => {
    let active = true;

    if (credentialId) {
      return () => {
        active = false;
      };
    }

    const fetchCredential = async () => {
      const { data, error } = await supabase
        .from('credentials')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching credentials:', error);
        toast({
          title: "Erro",
          description: "Falha ao carregar credenciais",
          variant: "destructive",
        });
        return;
      }

      if (active) {
        const existing = data && data.length > 0 ? data[0].id : null;
        setCredentialId(existing);
      }
    };

    fetchCredential();

    return () => {
      active = false;
    };
  }, [credentialId, toast]);

  useEffect(() => {
    if (!selectedChat) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    if (window.innerWidth < 768) {
      setShowSidebar(false);
    }
  }, [selectedChat]);

  const chatsWithAssignedUsers = useMemo(() =>
    chats.map((chat) => {
      const assignedIds = Array.isArray(chat.assignedTo)
        ? chat.assignedTo
        : chat.assignedTo
        ? [chat.assignedTo]
        : [];
      const assignedUserNames = assignedIds
        .map((id) => usersById[id])
        .filter((name): name is string => Boolean(name));

      return {
        ...chat,
        assignedUserNames: assignedUserNames.length > 0 ? assignedUserNames : undefined,
      };
    }),
  [chats, usersById]);

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();

    const channel = supabase
      .channel('users-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
        },
        () => {
          fetchUsers();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [fetchUsers]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChat?.id ?? null;
  }, [selectedChat?.id]);

  // Fetch chats when connected and setup realtime
  useEffect(() => {
    if (isConnected && credentialId) {
      fetchChats();
      
      // Setup realtime subscription for new messages
      const chatsChannel = supabase
        .channel('chats-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chats',
            filter: `credential_id=eq.${credentialId}`
          },
          (payload) => {
            console.log('Chat change:', payload);
            fetchChats(); // Refresh chats on any change
          }
        )
        .subscribe();

      const handleMessageChange = (payload: any) => {
        console.log('Message change:', payload);
        const mappedMessage = mapApiMessage(payload.new as any);
        const previewContent = mappedMessage.messageType === 'text'
          ? mappedMessage.content
          : mappedMessage.caption || `[${mappedMessage.mediaType || 'mídia'}]`;
        const messageTimestampMs = mappedMessage.messageTimestamp ?? null;

        setChats(prevChats => prevChats.map(chat =>
          {
            if (chat.id !== mappedMessage.chatId) {
              return chat;
            }

            const shouldUpdatePreview = (() => {
              if (payload.eventType === 'INSERT') {
                if (messageTimestampMs === null) {
                  return true;
                }
                return (chat.lastMessageAt ?? -Infinity) <= messageTimestampMs;
              }

              if (payload.eventType === 'UPDATE') {
                if (messageTimestampMs === null) {
                  return false;
                }
                return (chat.lastMessageAt ?? -Infinity) <= messageTimestampMs;
              }

              return false;
            })();

            if (!shouldUpdatePreview) {
              return chat;
            }

            return {
              ...chat,
              lastMessage: previewContent,
              timestamp: mappedMessage.timestamp,
              lastMessageAt: messageTimestampMs ?? chat.lastMessageAt ?? null,
            };
          }
        ));

        if (selectedChatIdRef.current && payload.new.chat_id === selectedChatIdRef.current) {
          let appended = false;
          setMessages(prev => {
            const index = prev.findIndex(message => message.id === mappedMessage.id);
            if (index === -1) {
              appended = true;
              return [...prev, mappedMessage];
            }
            const next = [...prev];
            next[index] = { ...next[index], ...mappedMessage };
            return next;
          });

          if (appended) {
            setMessagePagination(prev => ({
              ...prev,
              offset: prev.offset + 1,
            }));
          }
        }
      };

      const messagesChannel = supabase
        .channel('messages-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `credential_id=eq.${credentialId}`
          },
          handleMessageChange
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `credential_id=eq.${credentialId}`
          },
          handleMessageChange
        )
        .subscribe();

      const chatLabelsChannel = supabase
        .channel('chat-labels-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_labels',
          },
          () => {
            fetchChats();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(chatsChannel);
        supabase.removeChannel(messagesChannel);
        supabase.removeChannel(chatLabelsChannel);
      };
    }
  }, [isConnected, credentialId]);

  const deriveAttendanceStatus = (chat: any): Chat["attendanceStatus"] => {
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

  const fetchChats = async () => {
    if (!credentialId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('uaz-fetch-chats', {
        body: { credentialId }
      });

      if (error) throw error;

      if (data?.chats) {
        const mappedChats: Chat[] = data.chats.map((c: any) => {
          const lastMessageDate = c.last_message_timestamp ? new Date(c.last_message_timestamp) : null;
          const labels = Array.isArray(c.labels)
            ? c.labels
                .map((label: any) => {
                  const id = typeof label?.id === 'string' ? label.id : null;
                  if (!id) {
                    return null;
                  }
                  const name = typeof label?.name === 'string' ? label.name : '';
                  const color = typeof label?.color === 'string' ? label.color : null;
                  return { id, name, color } as Label;
                })
                .filter((label): label is Label => Boolean(label))
            : [];

          return {
            id: c.id,
            name: c.name,
            lastMessage: c.last_message || '',
            timestamp: lastMessageDate
              ? lastMessageDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '',
            lastMessageAt: lastMessageDate ? lastMessageDate.getTime() : null,
            unread: c.unread_count || 0,
            avatar: c.avatar || undefined,
            isGroup: c.is_group || false,
            assignedTo: c.assigned_to || undefined,
            attendanceStatus: deriveAttendanceStatus(c),
            labels: labels.length > 0 ? labels : undefined,
          };
        });

        let enrichedChats = mappedChats;
        const chatIds = mappedChats.map(chat => chat.id);

        if (chatIds.length > 0) {
          const { data: assignments, error: assignmentsError } = await supabase
            .from('chat_labels')
            .select('chat_id, label_id')
            .in('chat_id', chatIds);

          if (assignmentsError) {
            console.error('Error fetching chat labels:', assignmentsError);
          } else if (assignments && assignments.length > 0) {
            const labelIds = Array.from(new Set(assignments.map(item => item.label_id)));
            let labelsById: Record<string, Label> = {};

            if (labelIds.length > 0) {
              const { data: labelRows, error: labelsError } = await supabase
                .from('labels')
                .select('id, name, color, credential_id')
                .in('id', labelIds);

              if (labelsError) {
                console.error('Error fetching labels:', labelsError);
              } else if (labelRows) {
                labelsById = labelRows.reduce((acc, row) => {
                  acc[row.id] = {
                    id: row.id,
                    name: row.name,
                    color: row.color,
                    credentialId: row.credential_id ?? undefined,
                  };
                  return acc;
                }, {} as Record<string, Label>);
              }
            }

            const labelsByChat = new Map<string, Label[]>();

            assignments.forEach(item => {
              const label = labelsById[item.label_id];
              if (!label) {
                return;
              }
              const list = labelsByChat.get(item.chat_id) ?? [];
              list.push(label);
              labelsByChat.set(item.chat_id, list);
            });

            enrichedChats = mappedChats.map(chat => ({
              ...chat,
              labels: labelsByChat.get(chat.id) ?? [],
            }));
          }
        }

        setChats(enrichedChats);
        setSelectedChat(prev => {
          if (!prev) {
            return prev;
          }
          const next = enrichedChats.find(chat => chat.id === prev.id);
          return next ? { ...next } : prev;
        });
      }
    } catch (error) {
      console.error('Error fetching chats:', error);
      toast({
        title: "Erro",
        description: "Falha ao carregar conversas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (chatId: string, options: { reset?: boolean } = { reset: false }) => {
    if (!credentialId) return;

    if (!options.reset && isLoadingMoreMessages) {
      return;
    }

    if (options.reset) {
      setMessagePagination(createInitialMessagePagination(MESSAGE_PAGE_SIZE));
    }

    setIsLoadingMoreMessages(true);
    setIsPrependingMessages(!options.reset);

    try {
      const { data, error } = await supabase.functions.invoke('uaz-fetch-messages', {
        body: {
          credentialId,
          chatId,
          limit: MESSAGE_PAGE_SIZE,
          offset: options.reset ? 0 : messagePagination.offset,
          order: 'desc',
        }
      });

      if (error) throw error;

      if (data?.messages) {
        const mapped = data.messages.map(mapApiMessage);
        setMessages(prev => mergeFetchedMessages(prev, mapped, Boolean(options.reset)));
        setMessagePagination(prev => {
          const baseState = options.reset
            ? createInitialMessagePagination(MESSAGE_PAGE_SIZE)
            : prev;
          const currentOffset = options.reset ? 0 : prev.offset;
          const nextOffset = typeof data.nextOffset === 'number'
            ? Math.max(0, data.nextOffset)
            : currentOffset + mapped.length;
          const receivedCount = options.reset
            ? nextOffset
            : nextOffset - currentOffset;

          return applyMessagePaginationUpdate(
            baseState,
            Math.max(0, receivedCount),
            {
              reset: options.reset,
              hasMore: Boolean(data.hasMore),
              limit: MESSAGE_PAGE_SIZE,
            }
          );
        });
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      const { message: rawMessage, error: rawError } = typeof error === 'object' && error !== null
        ? (error as { message?: unknown; error?: unknown })
        : { message: undefined, error: undefined };
      const parsedMessage = typeof rawMessage === 'string' && rawMessage.trim().length > 0
        ? rawMessage
        : typeof rawError === 'string' && rawError.trim().length > 0
          ? rawError
          : undefined;
      toast({
        title: "Erro",
        description: parsedMessage ?? "Falha ao carregar mensagens",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMoreMessages(false);
      setIsPrependingMessages(false);
    }
  };

  const handleSetupComplete = useCallback(
    (id: string) => {
      setCredentialId(id);
      clearCredentialProfile();
    },
    [clearCredentialProfile]
  );

  const handleConnected = () => {
    setIsConnected(true);
    if (credentialId) {
      fetchCredentialProfile(credentialId);
    }
    toast({
      title: "Conectado!",
      description: "WhatsApp conectado com sucesso",
    });
  };

  const handleDisconnect = async () => {
    if (!credentialId || isDisconnecting) {
      return;
    }

    setIsDisconnecting(true);
    clearConnectionInterval();

    try {
      const { error } = await supabase.functions.invoke('uaz-disconnect-instance', {
        body: { credentialId },
      });

      if (error) {
        throw error;
      }

      clearConnectionState();

      toast({
        title: "Desconectado",
        description: "WhatsApp desconectado com sucesso",
      });
    } catch (error) {
      console.error('Error disconnecting instance:', error);
      toast({
        title: "Erro",
        description: "Falha ao desconectar",
        variant: "destructive",
      });
    } finally {
      setIsDisconnecting(false);
    }
  };
  const handleConnectionStatusChange = useCallback(
    (status?: string | null) => {
      if (!credentialId) {
        clearCredentialProfile();
        return;
      }

      if (status === 'connected') {
        fetchCredentialProfile(credentialId);
        return;
      }

      if (status === 'disconnected') {
        clearCredentialProfile();
        setIsConnected(false);
      }
    },
    [credentialId, clearCredentialProfile, fetchCredentialProfile]
  );

  useEffect(() => {
    if (isConnected && credentialId) {
      fetchCredentialProfile(credentialId);
    }
  }, [isConnected, credentialId, fetchCredentialProfile]);

  useEffect(() => {
    if (!credentialId || !isConnected) {
      return;
    }

    const checkConnection = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('uaz-get-qr', {
          body: { credentialId },
        });

        if (error) {
          throw error;
        }

        if (data?.connected === false || data?.status !== 'connected') {
          handleConnectionLost();
        }
      } catch (error) {
        console.error('Error checking connection status:', error);
      }
    };

    checkConnection();
    connectionCheckIntervalRef.current = setInterval(checkConnection, 60000);

    return () => {
      clearConnectionInterval();
    };
  }, [credentialId, isConnected, handleConnectionLost, clearConnectionInterval]);

  const handleSelectChat = async (chat: Chat) => {
    setSelectedChat(chat);

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setShowSidebar(false);
    }

    await fetchMessages(chat.id, { reset: true });
    
    // Fetch and update contact details
    if (credentialId) {
      try {
        const { data } = await supabase.functions.invoke('uaz-fetch-contact-details', {
          body: { credentialId, chatId: chat.id }
        });
        
        if (data) {
          // Update chat in state with fresh details
          setChats(chats.map(c => 
            c.id === chat.id 
              ? { ...c, name: data.name, avatar: data.avatar }
              : c
          ));
        }
      } catch (error) {
        console.error('Error fetching contact details:', error);
      }
    }
  };

  const handleSendMessage = async (payload: SendMessagePayload) => {
    if (!selectedChat || !credentialId) return;

    const now = Date.now();
    const timestamp = new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    let messageContent = '';

    if (payload.messageType === 'text') {
      messageContent = payload.content;
    } else if (payload.messageType === 'media') {
      messageContent = payload.caption || `[${payload.mediaType || 'mídia'}]`;
    } else {
      const fallbackCoordinates =
        typeof payload.latitude === 'number' && typeof payload.longitude === 'number'
          ? `${payload.latitude}, ${payload.longitude}`
          : '';
      messageContent = payload.locationName || payload.content || fallbackCoordinates;
    }
    const fallbackId = () => {
      if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
      }
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    let messageId = payload.isPrivate ? fallbackId() : '';

    try {
      if (payload.isPrivate) {
        const { error } = await supabase.from('messages').insert([{
          chat_id: selectedChat.id,
          credential_id: credentialId,
          content: messageContent,
          message_type: payload.messageType,
          media_type: payload.mediaType,
          media_url: payload.mediaUrl,
          media_base64: payload.mediaBase64,
          caption: payload.caption,
          document_name: payload.documentName,
          from_me: true,
          is_private: true,
          message_timestamp: Date.now(),
          wa_message_id: messageId,
        }]);

        if (error) throw error;
      } else {
        const { data, error } = await supabase.functions.invoke('uaz-send-message', {
          body: {
            credentialId,
            chatId: selectedChat.id,
            content: payload.content,
            messageType: payload.messageType,
            mediaType: payload.mediaType,
            mediaUrl: payload.mediaUrl,
            mediaBase64: payload.mediaBase64,
            documentName: payload.documentName,
            caption: payload.caption,
            interactive: payload.interactive,
            contactName: payload.contactName,
            contactPhone: payload.contactPhone,
            latitude: payload.latitude,
            longitude: payload.longitude,
            locationName: payload.locationName,
          }
        });

        if (error) throw error;
        messageId = data.messageId;
      }

      const waMessageId = messageId || fallbackId();

      const newMessage: Message = {
        id: waMessageId,
        chatId: selectedChat.id,
        content: messageContent,
        timestamp,
        messageTimestamp: now,
        from: 'me',
        status: 'sent',
        messageType: payload.messageType,
        mediaType: payload.mediaType,
        caption: payload.caption,
        documentName: payload.documentName,
        mediaUrl: payload.mediaUrl,
        mediaBase64: payload.mediaBase64,
        isPrivate: Boolean(payload.isPrivate),
        contactName: payload.contactName,
        contactPhone: payload.contactPhone,
        latitude: payload.latitude,
        longitude: payload.longitude,
        locationName: payload.locationName,
      };

      setMessages(prev => [...prev, newMessage]);
      setMessagePagination(prev => ({
        ...prev,
        offset: prev.offset + 1,
      }));

      setChats(prevChats => prevChats.map(c =>
        c.id === selectedChat.id
          ? { ...c, lastMessage: messageContent, timestamp: newMessage.timestamp, lastMessageAt: now }
          : c
      ));

      toast({
        title: payload.isPrivate ? "Salvo" : "Enviado",
        description: payload.isPrivate ? "Mensagem privada registrada" : "Mensagem enviada com sucesso",
      });
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Erro",
        description: "Falha ao enviar mensagem",
        variant: "destructive",
      });
    }
  };

  const handleAssignChat = (chatId: string) => {
    if (!canManageAttendance) {
      toast({
        title: "Permissão insuficiente",
        description: "Apenas administradores e supervisores podem atribuir conversas.",
        variant: "destructive",
      });
      return;
    }
    setChatToAssign(chatId);
    setAssignDialogOpen(true);
  };

  const handleAssignToUser = async (userId: string) => {
    if (!chatToAssign || !credentialId) return;

    const previousAssigned = chats.find(c => c.id === chatToAssign)?.assignedTo || null;

    try {
      const { error } = await supabase
        .from('chats')
        .update({ assigned_to: userId, attendance_status: 'in_service' })
        .eq('id', chatToAssign);

      if (error) throw error;

      const { error: membershipError } = await supabase
        .from('credential_members')
        .upsert({
          credential_id: credentialId,
          user_id: userId,
          role: 'agent',
        }, { onConflict: 'credential_id,user_id' });

      if (membershipError) throw membershipError;

      if (previousAssigned && previousAssigned !== userId) {
        const { count: remainingAssignments } = await supabase
          .from('chats')
          .select('id', { count: 'exact', head: true })
          .eq('credential_id', credentialId)
          .eq('assigned_to', previousAssigned);

        if ((remainingAssignments ?? 0) === 0) {
          await supabase
            .from('credential_members')
            .delete()
            .eq('credential_id', credentialId)
            .eq('user_id', previousAssigned)
            .eq('role', 'agent');
        }
      }

      setChats(prevChats =>
        prevChats.map(c =>
          c.id === chatToAssign
            ? { ...c, assignedTo: userId, attendanceStatus: "in_service" as ChatAttendanceStatus }
            : c
        )
      );

      setSelectedChat(prevSelected =>
        prevSelected && prevSelected.id === chatToAssign
          ? { ...prevSelected, assignedTo: userId, attendanceStatus: "in_service" }
          : prevSelected
      );

      toast({
        title: "Atribuído",
        description: "Conversa atribuída com sucesso",
      });

      setAssignDialogOpen(false);
    } catch (error) {
      console.error('Error assigning chat:', error);
      toast({
        title: "Erro",
        description: "Falha ao atribuir conversa",
        variant: "destructive",
      });
    }
  };

  const handleFinishAttendance = async (chatId: string) => {
    if (!canManageAttendance) {
      toast({
        title: "Permissão insuficiente",
        description: "Apenas administradores e supervisores podem finalizar atendimentos.",
        variant: "destructive",
      });
      return;
    }
    try {
      const { error } = await supabase
        .from('chats')
        .update({ attendance_status: 'finished', assigned_to: null })
        .eq('id', chatId);

      if (error) throw error;

      setChats(prevChats =>
        prevChats.map(chat =>
          chat.id === chatId
            ? { ...chat, attendanceStatus: 'finished', assignedTo: undefined }
            : chat
        )
      );

      setSelectedChat(prevSelected =>
        prevSelected && prevSelected.id === chatId
          ? { ...prevSelected, attendanceStatus: 'finished', assignedTo: undefined }
          : prevSelected
      );

      toast({
        title: "Finalizado",
        description: "Atendimento finalizado com sucesso",
      });
    } catch (error) {
      console.error('Error finishing attendance:', error);
      toast({
        title: "Erro",
        description: "Falha ao finalizar atendimento",
        variant: "destructive",
      });
    }
  };

  const currentChatMessages = useMemo(() => {
    if (!selectedChat) {
      return [];
    }
    return messages.filter(m => m.chatId === selectedChat.id);
  }, [messages, selectedChat]);

  const handleLoadMoreMessages = () => {
    if (!selectedChat || !messagePagination.hasMore || isLoadingMoreMessages) {
      return;
    }
    fetchMessages(selectedChat.id);
  };

  const handleAssignLabelToChat = useCallback(
    async (chatId: string, label: Label) => {
      const currentChat = chats.find(chat => chat.id === chatId) || (selectedChat?.id === chatId ? selectedChat : null);
      if (currentChat?.labels?.some(item => item.id === label.id)) {
        return;
      }

      try {
        const { error } = await supabase
          .from('chat_labels')
          .insert({ chat_id: chatId, label_id: label.id });

        if (error) {
          throw error;
        }

        setChats(prev =>
          prev.map(chat => {
            if (chat.id !== chatId) {
              return chat;
            }
            const previous = chat.labels ?? [];
            if (previous.some(item => item.id === label.id)) {
              return chat;
            }
            const next = [...previous, label];
            next.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
            return { ...chat, labels: next };
          })
        );

        setSelectedChat(prev => {
          if (!prev || prev.id !== chatId) {
            return prev;
          }
          const previous = prev.labels ?? [];
          if (previous.some(item => item.id === label.id)) {
            return prev;
          }
          const next = [...previous, label];
          next.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
          return { ...prev, labels: next };
        });
      } catch (unknownError) {
        console.error('Error assigning label:', unknownError);
        toast({
          title: "Erro",
          description: "Não foi possível atribuir a etiqueta",
          variant: "destructive",
        });
        throw unknownError;
      }
    },
    [chats, selectedChat, toast]
  );

  const handleRemoveLabelFromChat = useCallback(
    async (chatId: string, label: Label) => {
      const currentChat = chats.find(chat => chat.id === chatId) || (selectedChat?.id === chatId ? selectedChat : null);
      if (!currentChat?.labels?.some(item => item.id === label.id)) {
        return;
      }

      try {
        const { error } = await supabase
          .from('chat_labels')
          .delete()
          .eq('chat_id', chatId)
          .eq('label_id', label.id);

        if (error) {
          throw error;
        }

        setChats(prev =>
          prev.map(chat => {
            if (chat.id !== chatId) {
              return chat;
            }
            const previous = chat.labels ?? [];
            if (!previous.some(item => item.id === label.id)) {
              return chat;
            }
            const next = previous.filter(item => item.id !== label.id);
            return { ...chat, labels: next };
          })
        );

        setSelectedChat(prev => {
          if (!prev || prev.id !== chatId) {
            return prev;
          }
          const previous = prev.labels ?? [];
          if (!previous.some(item => item.id === label.id)) {
            return prev;
          }
          const next = previous.filter(item => item.id !== label.id);
          return { ...prev, labels: next };
        });
      } catch (unknownError) {
        console.error('Error removing label:', unknownError);
        toast({
          title: "Erro",
          description: "Não foi possível remover a etiqueta",
          variant: "destructive",
        });
        throw unknownError;
      }
    },
    [chats, selectedChat, toast]
  );

  // Setup flow
  if (!credentialId) {
    return <CredentialSetup onSetupComplete={handleSetupComplete} />;
  }

  if (!isConnected) {
    return (
      <QRCodeScanner
        credentialId={credentialId}
        onConnected={handleConnected}
        onStatusChange={handleConnectionStatusChange}
      />
    );
  }

  // Main WhatsApp interface
  return (
    <>
      <div className="flex h-screen overflow-hidden flex-col md:flex-row">
        <ChatSidebar
          chats={chatsWithAssignedUsers}
          selectedChat={selectedChat}
          onSelectChat={handleSelectChat}
          onAssignChat={handleAssignChat}
          showSidebar={showSidebar}
          onToggleSidebar={() => setShowSidebar(false)}
          activeFilter={chatFilter}
          onFilterChange={setChatFilter}
          onDisconnect={handleDisconnect}
          isDisconnecting={isDisconnecting}
          profileName={credentialProfile.profileName}
          phoneNumber={credentialProfile.phoneNumber}
        />
        <ChatArea
          chat={selectedChat}
          messages={currentChatMessages}
          onSendMessage={handleSendMessage}
          onAssignChat={handleAssignChat}
          onFinishAttendance={handleFinishAttendance}
          onLoadMoreMessages={handleLoadMoreMessages}
          hasMoreMessages={messagePagination.hasMore}
          isLoadingMoreMessages={isLoadingMoreMessages}
          isPrependingMessages={isPrependingMessages}
          showSidebar={showSidebar}
          onShowSidebar={() => setShowSidebar(true)}
          credentialId={credentialId}
          onAssignLabel={handleAssignLabelToChat}
          onRemoveLabel={handleRemoveLabelFromChat}
          userRole={normalizedUserRole}
        />
      </div>

      <AssignChatDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        chatName={chats.find(c => c.id === chatToAssign)?.name || ""}
        users={users}
        onAssign={handleAssignToUser}
      />
    </>
  );
};

export default Index;
