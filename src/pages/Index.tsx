import { useState, useEffect } from "react";
import { CredentialSetup } from "@/components/CredentialSetup";
import { QRCodeScanner } from "@/components/QRCodeScanner";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatArea } from "@/components/ChatArea";
import { AssignChatDialog } from "@/components/AssignChatDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Chat, Message, User } from "@/types/whatsapp";

const Index = () => {
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [chatToAssign, setChatToAssign] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

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

  // Fetch chats when connected
  useEffect(() => {
    if (isConnected && credentialId) {
      fetchChats();
      // Poll for new chats every 10 seconds
      const interval = setInterval(fetchChats, 10000);
      return () => clearInterval(interval);
    }
  }, [isConnected, credentialId]);

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

  const fetchMessages = async (chatId: string) => {
    if (!credentialId) return;

    try {
      const { data, error } = await supabase.functions.invoke('uaz-fetch-messages', {
        body: { credentialId, chatId }
      });

      if (error) throw error;

      if (data?.messages) {
        setMessages(data.messages.map((m: any) => ({
          id: m.id,
          chatId: m.chat_id,
          content: m.content || '',
          timestamp: new Date(m.message_timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          from: m.from_me ? 'me' : 'them',
          status: m.status,
        })));
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Erro",
        description: "Falha ao carregar mensagens",
        variant: "destructive",
      });
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

  const handleSelectChat = (chat: Chat) => {
    setSelectedChat(chat);
    fetchMessages(chat.id);
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

      // Add message to local state
      const newMessage: Message = {
        id: data.messageId,
        chatId: selectedChat.id,
        content,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        from: 'me',
        status: 'sent',
      };

      setMessages([...messages, newMessage]);

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
      <div className="flex h-screen overflow-hidden">
        <ChatSidebar 
          chats={chats}
          selectedChat={selectedChat}
          onSelectChat={handleSelectChat}
          onAssignChat={handleAssignChat}
        />
        <ChatArea 
          chat={selectedChat}
          messages={currentChatMessages}
          onSendMessage={handleSendMessage}
          onAssignChat={handleAssignChat}
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
