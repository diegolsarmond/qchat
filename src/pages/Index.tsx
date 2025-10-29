import { useState, useEffect, useMemo, useCallback } from "react";
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
  Message,
  User as WhatsAppUser,
  SendMessagePayload,
} from "@/types/whatsapp";
import { mergeFetchedMessages } from "@/lib/message-order";
import {
  applyMessagePaginationUpdate,
  createInitialMessagePagination,
} from "@/lib/message-pagination";

const MESSAGE_PAGE_SIZE = 50;

const formatTimestamp = (value: number | string | null | undefined) =>
  new Date(value ?? Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const mapApiMessage = (m: any): Message => ({
  id: m.wa_message_id ?? m.id,
  chatId: m.chat_id,
  content: m.content || "",
  timestamp: formatTimestamp(m.message_timestamp),
  from: m.from_me ? "me" : "them",
  status: m.status,
  messageType: m.message_type,
  mediaType: m.media_type,
  caption: m.caption,
  documentName: m.document_name,
  mediaUrl: m.media_url,
  mediaBase64: m.media_base64,
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
  const [credentialProfile, setCredentialProfile] = useState({
    profileName: null as string | null,
    phoneNumber: null as string | null,
  });
  const { toast } = useToast();

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

  const usersById = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.name;
    });
    return map;
  }, [users]);

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
    const fetchUsers = async () => {
      const { data } = await supabase.from('users').select('*');
      if (data) {
        setUsers(data.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          avatar: u.avatar || undefined,
        })));
      }
    };
    fetchUsers();
  }, []);

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
        const rawTimestamp = payload.new?.message_timestamp ?? null;
        const messageTimestampMs = rawTimestamp ? new Date(rawTimestamp).getTime() : null;

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

        if (selectedChat && payload.new.chat_id === selectedChat.id) {
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

      return () => {
        supabase.removeChannel(chatsChannel);
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [isConnected, credentialId, selectedChat]);

  const deriveAttendanceStatus = (chat: any): Chat["attendanceStatus"] => {
    const source =
      (typeof chat.attendance_status === "string" && chat.attendance_status) ||
      (typeof chat.attendanceStatus === "string" && chat.attendanceStatus) ||
      (typeof chat.status === "string" && chat.status) ||
      "";

    const normalized = source.toLowerCase();

    if (["finished", "finalized", "closed"].includes(normalized)) {
      return "finished";
    }

    if (["in_service", "in progress", "in_progress", "active"].includes(normalized)) {
      return "in_service";
    }

    if (["waiting", "pending", "queued"].includes(normalized)) {
      return chat.assigned_to || chat.assignedTo ? "in_service" : "waiting";
    }

    if (chat.assigned_to || chat.assignedTo) {
      return "in_service";
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
        setChats(data.chats.map((c: any) => {
          const lastMessageDate = c.last_message_timestamp ? new Date(c.last_message_timestamp) : null;

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
          };
        }));
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
      toast({
        title: "Erro",
        description: "Falha ao carregar mensagens",
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

    try {
      const { error } = await supabase.functions.invoke('uaz-disconnect-instance', {
        body: { credentialId },
      });

      if (error) {
        throw error;
      }

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

      if (typeof window !== 'undefined') {
        window.localStorage?.removeItem("activeCredentialId");
      }

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
        from: 'me',
        status: 'sent',
        messageType: payload.messageType,
        mediaType: payload.mediaType,
        caption: payload.caption,
        documentName: payload.documentName,
        mediaUrl: payload.mediaUrl,
        mediaBase64: payload.mediaBase64,
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
