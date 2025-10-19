import { useState } from "react";
import { CredentialSetup } from "@/components/CredentialSetup";
import { QRCodeScanner } from "@/components/QRCodeScanner";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatArea } from "@/components/ChatArea";
import { AssignChatDialog } from "@/components/AssignChatDialog";
import { Credential, Chat, Message, User } from "@/types/whatsapp";

const Index = () => {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [chatToAssign, setChatToAssign] = useState<string | null>(null);

  // Mock data
  const [chats, setChats] = useState<Chat[]>([
    {
      id: "1",
      name: "Itaú Pix",
      lastMessage: "Feito via WhatsApp Itaú!",
      timestamp: "11:41",
      unread: 0,
      isGroup: false,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=IP",
    },
    {
      id: "2",
      name: "Diego Armond (você)",
      lastMessage: "553187870292",
      timestamp: "Ontem",
      unread: 0,
      isGroup: false,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=DA",
    },
    {
      id: "3",
      name: "Roberto Armond",
      lastMessage: "Vem dormir aqui",
      timestamp: "22:28",
      unread: 2,
      isGroup: false,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=RA",
    },
    {
      id: "4",
      name: "Grupo - Ícaro da Hora",
      lastMessage: "~ Leandro: https://olhardigital.com.br/2025/10/...",
      timestamp: "22:10",
      unread: 37,
      isGroup: true,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=GI",
    },
    {
      id: "5",
      name: "Thiago Armond",
      lastMessage: "pf",
      timestamp: "22:00",
      unread: 4,
      isGroup: false,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=TA",
    },
  ]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      chatId: "3",
      content: "oi vou n",
      timestamp: "18:31",
      from: "me",
      status: "read",
    },
    {
      id: "2",
      chatId: "3",
      content: "tenho mt coisa pra resolver",
      timestamp: "18:31",
      from: "me",
      status: "read",
    },
    {
      id: "3",
      chatId: "3",
      content: "pra viajar",
      timestamp: "18:31",
      from: "me",
      status: "read",
    },
    {
      id: "4",
      chatId: "3",
      content: "Vamos comer uma carne aqui",
      timestamp: "18:39",
      from: "them",
    },
    {
      id: "5",
      chatId: "3",
      content: "Vem vc",
      timestamp: "18:40",
      from: "me",
      status: "read",
    },
    {
      id: "6",
      chatId: "3",
      content: "Eu tô trabalhando e preciso resolver as coisas da viagem",
      timestamp: "18:40",
      from: "me",
      status: "read",
    },
    {
      id: "7",
      chatId: "3",
      content: "Só eu q vou ai",
      timestamp: "18:40",
      from: "me",
      status: "read",
    },
    {
      id: "8",
      chatId: "3",
      content: "Vou não Diego",
      timestamp: "18:40",
      from: "them",
    },
    {
      id: "9",
      chatId: "3",
      content: "Se não o Hugo fica",
      timestamp: "18:41",
      from: "them",
    },
    {
      id: "10",
      chatId: "3",
      content: "Oi",
      timestamp: "22:10",
      from: "them",
    },
    {
      id: "11",
      chatId: "3",
      content: "Está tudo bem ai",
      timestamp: "22:10",
      from: "them",
    },
    {
      id: "12",
      chatId: "3",
      content: "SIM",
      timestamp: "22:23",
      from: "me",
      status: "read",
    },
    {
      id: "13",
      chatId: "3",
      content: "Está só",
      timestamp: "22:24",
      from: "them",
    },
    {
      id: "14",
      chatId: "3",
      content: "To",
      timestamp: "22:24",
      from: "me",
      status: "read",
    },
    {
      id: "15",
      chatId: "3",
      content: "Vem dormir aqui",
      timestamp: "22:28",
      from: "them",
    },
  ]);

  const users: User[] = [
    { id: "1", name: "João Silva", email: "joao@example.com" },
    { id: "2", name: "Maria Santos", email: "maria@example.com" },
    { id: "3", name: "Pedro Costa", email: "pedro@example.com" },
  ];

  const handleSetupComplete = (cred: Credential) => {
    setCredential(cred);
  };

  const handleConnected = () => {
    setIsConnected(true);
    if (credential) {
      setCredential({ ...credential, status: 'connected' });
    }
  };

  const handleSelectChat = (chat: Chat) => {
    setSelectedChat(chat);
  };

  const handleSendMessage = (content: string) => {
    if (!selectedChat) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      chatId: selectedChat.id,
      content,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      from: 'me',
      status: 'sent',
    };

    setMessages([...messages, newMessage]);

    // Update chat's last message
    setChats(chats.map(chat => 
      chat.id === selectedChat.id 
        ? { ...chat, lastMessage: content, timestamp: newMessage.timestamp }
        : chat
    ));

    // Simulate message delivery
    setTimeout(() => {
      setMessages(msgs => msgs.map(msg => 
        msg.id === newMessage.id ? { ...msg, status: 'delivered' as const } : msg
      ));
    }, 1000);

    // Simulate message read
    setTimeout(() => {
      setMessages(msgs => msgs.map(msg => 
        msg.id === newMessage.id ? { ...msg, status: 'read' as const } : msg
      ));
    }, 2000);
  };

  const handleAssignChat = (chatId: string) => {
    setChatToAssign(chatId);
    setAssignDialogOpen(true);
  };

  const handleAssignToUser = (userId: string) => {
    if (!chatToAssign) return;

    const user = users.find(u => u.id === userId);
    if (!user) return;

    setChats(chats.map(chat => 
      chat.id === chatToAssign 
        ? { ...chat, assignedTo: user.name }
        : chat
    ));

    setChatToAssign(null);
  };

  const currentChatMessages = messages.filter(m => m.chatId === selectedChat?.id);

  // Setup flow
  if (!credential) {
    return <CredentialSetup onSetupComplete={handleSetupComplete} />;
  }

  if (!isConnected) {
    return <QRCodeScanner credential={credential} onConnected={handleConnected} />;
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
