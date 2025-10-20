import { useState, useEffect, useMemo } from "react";
import { CredentialSetup } from "@/components/CredentialSetup";
import { QRCodeScanner } from "@/components/QRCodeScanner";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatArea } from "@/components/ChatArea";
import { AssignChatDialog } from "@/components/AssignChatDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  Chat,
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

const mapApiMessage = (m: any): Message => ({
  id: m.id,
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

type IndexProps = {
  user: SupabaseUser;
};

const Index = ({ user }: IndexProps) => {
  const [credentialId, setCredentialId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage?.getItem("activeCredentialId");
      if (stored) {
        return stored;
      }
    }
    return null;
  });
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
  const { toast } = useToast();

  const usersById = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.name;
    });
    return map;
  }, [users]);

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
    if (!user) return;

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
  }, [user]);

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

        setChats(prevChats => prevChats.map(chat =>
          chat.id === mappedMessage.chatId
            ? { ...chat, lastMessage: previewContent, timestamp: mappedMessage.timestamp }
            : chat
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
            table: 'messages'
          },
          handleMessageChange
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages'
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
    const raw =
      (chat.status || chat.attendance_status || chat.attendanceStatus || "")
        .toString()
        .toLowerCase();

    if (raw === "finished" || raw === "finalized" || raw === "closed") {
      return "finished";
    }

    if (
      raw === "in_service" ||
      raw === "in progress" ||
      raw === "in_progress" ||
      raw === "active"
    ) {
      return "in_service";
    }

    if (raw === "waiting" || raw === "pending" || raw === "queued") {
      return "waiting";
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
        setChats(data.chats.map((c: any) => ({
          id: c.id,
          name: c.name,
          lastMessage: c.last_message || '',
          timestamp: c.last_message_timestamp
            ? new Date(c.last_message_timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '',
          unread: c.unread_count || 0,
          avatar: c.avatar || undefined,
          isGroup: c.is_group || false,
          assignedTo: c.assigned_to || undefined,
          attendanceStatus: deriveAttendanceStatus(c),
        })));
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
          order: 'asc',
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

  const handleSetupComplete = (id: string) => {
    setCredentialId(id);
  };

  const handleConnected = () => {
    setIsConnected(true);
    toast({
      title: "Conectado!",
      description: "WhatsApp conectado com sucesso",
    });
  };

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

    const messageContent = payload.messageType === 'text'
      ? payload.content
      : payload.caption || `[${payload.mediaType || 'mídia'}]`;
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const fallbackId = () => {
      if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
      }
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    let messageId = payload.isPrivate ? fallbackId() : '';

    try {
      if (payload.isPrivate) {
        const { error } = await supabase.from('messages').insert({
          id: messageId,
          chat_id: selectedChat.id,
          credential_id: credentialId,
          content: payload.content,
          message_type: payload.messageType,
          media_type: payload.mediaType,
          media_url: payload.mediaUrl,
          media_base64: payload.mediaBase64,
          caption: payload.caption,
          document_name: payload.documentName,
          from_me: true,
          is_private: true,
          message_timestamp: new Date().toISOString(),
        });

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
          }
        });

        if (error) throw error;
        messageId = data.messageId;
      }

      const newMessage: Message = {
        id: messageId || fallbackId(),
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
      };

      setMessages(prev => [...prev, newMessage]);
      setMessagePagination(prev => ({
        ...prev,
        offset: prev.offset + 1,
      }));

      setChats(chats.map(c =>
        c.id === selectedChat.id
          ? { ...c, lastMessage: messageContent, timestamp: newMessage.timestamp }
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
    if (!chatToAssign) return;

    try {
      const { error } = await supabase
        .from('chats')
        .update({ assigned_to: userId })
        .eq('id', chatToAssign);

      if (error) throw error;

      setChats(prevChats =>
        prevChats.map(c =>
          c.id === chatToAssign
            ? { ...c, assignedTo: userId, attendanceStatus: "in_service" }
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
    return <QRCodeScanner credentialId={credentialId} onConnected={handleConnected} />;
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
          currentUserId={user.id}
        />
        <ChatArea
          chat={selectedChat}
          messages={currentChatMessages}
          onSendMessage={handleSendMessage}
          onAssignChat={handleAssignChat}
          onLoadMoreMessages={handleLoadMoreMessages}
          hasMoreMessages={messagePagination.hasMore}
          isLoadingMoreMessages={isLoadingMoreMessages}
          isPrependingMessages={isPrependingMessages}
          showSidebar={showSidebar}
          onShowSidebar={() => setShowSidebar(true)}
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
