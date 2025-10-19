import { useState, useEffect } from "react";
import { CredentialSetup } from "@/components/CredentialSetup";
import { QRCodeScanner } from "@/components/QRCodeScanner";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatArea } from "@/components/ChatArea";
import { AssignChatDialog } from "@/components/AssignChatDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Chat, Message, User as WhatsAppUser } from "@/types/whatsapp";
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
});

type IndexProps = {
  user: SupabaseUser;
};

const Index = ({ user }: IndexProps) => {
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
  const [messagePagination, setMessagePagination] = useState(() =>
    createInitialMessagePagination(MESSAGE_PAGE_SIZE)
  );
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [isPrependingMessages, setIsPrependingMessages] = useState(false);
  const { toast } = useToast();

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

      const messagesChannel = supabase
        .channel('messages-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
          },
          (payload) => {
            console.log('New message:', payload);
            if (selectedChat && payload.new.chat_id === selectedChat.id) {
              const newMsg = payload.new as any;
              setMessages(prev => [...prev, mapApiMessage(newMsg)]);
              setMessagePagination(prev => ({
                ...prev,
                offset: prev.offset + 1,
              }));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(chatsChannel);
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [isConnected, credentialId, selectedChat]);

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

  const handleSendMessage = async (content: string) => {
    if (!selectedChat || !credentialId) return;

    try {
      const { data, error } = await supabase.functions.invoke('uaz-send-message', {
        body: {
          credentialId,
          chatId: selectedChat.id,
          content,
          messageType: 'text'
        }
      });

      if (error) throw error;

      const newMessage: Message = {
        id: data.messageId,
        chatId: selectedChat.id,
        content,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        from: 'me',
        status: 'sent',
      };

      setMessages(prev => [...prev, newMessage]);
      setMessagePagination(prev => ({
        ...prev,
        offset: prev.offset + 1,
      }));

      // Update chat last message
      setChats(chats.map(c => 
        c.id === selectedChat.id 
          ? { ...c, lastMessage: content, timestamp: newMessage.timestamp }
          : c
      ));

      toast({
        title: "Enviado",
        description: "Mensagem enviada com sucesso",
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

      setChats(chats.map(c => 
        c.id === chatToAssign ? { ...c, assignedTo: userId } : c
      ));

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

  const currentChatMessages = messages.filter(m => m.chatId === selectedChat?.id);

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
          chats={chats}
          selectedChat={selectedChat}
          onSelectChat={handleSelectChat}
          onAssignChat={handleAssignChat}
          showSidebar={showSidebar}
          onToggleSidebar={() => setShowSidebar(false)}
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
