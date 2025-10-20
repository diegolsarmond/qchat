import { Search, MoreVertical, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chat, ChatFilter } from "@/types/whatsapp";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ChatSidebarProps {
  chats: Chat[];
  selectedChat: Chat | null;
  onSelectChat: (chat: Chat) => void;
  onAssignChat: (chatId: string) => void;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  activeFilter: ChatFilter;
  onFilterChange: (value: ChatFilter) => void;
  currentUserId?: string;
}

export const filterChatsByAttendance = (
  chats: Chat[],
  filter: ChatFilter,
  currentUserId?: string,
) => {
  if (filter === "mine") {
    if (!currentUserId) {
      return [];
    }
    return chats.filter(chat => chat.assignedTo === currentUserId);
  }

  if (filter === "in_service") {
    return chats.filter(chat => chat.attendanceStatus === "in_service");
  }

  if (filter === "waiting") {
    return chats.filter(chat => chat.attendanceStatus === "waiting");
  }

  if (filter === "finished") {
    return chats.filter(chat => chat.attendanceStatus === "finished");
  }

  return chats;
};

export const ChatSidebar = ({
  chats,
  selectedChat,
  onSelectChat,
  onAssignChat: _onAssignChat,
  showSidebar,
  onToggleSidebar,
  activeFilter,
  onFilterChange,
  currentUserId,
}: ChatSidebarProps) => {
  const navigate = useNavigate();
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getAssignedLabels = (chat: Chat) => {
    if (chat.assignedUserNames && chat.assignedUserNames.length > 0) {
      return chat.assignedUserNames;
    }
    if (Array.isArray(chat.assignedTo)) {
      return chat.assignedTo;
    }
    return chat.assignedTo ? [chat.assignedTo] : [];
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const filteredChats = filterChatsByAttendance(chats, activeFilter, currentUserId);

  const filters: { value: ChatFilter; label: string; testId: string }[] = [
    { value: "mine", label: "Minhas", testId: "filter-mine" },
    { value: "in_service", label: "Em atendimento", testId: "filter-in-service" },
    { value: "waiting", label: "Aguardando Atendimento", testId: "filter-waiting" },
    { value: "finished", label: "Finalizadas", testId: "filter-finished" },
    { value: "all", label: "Tudo", testId: "filter-all" },
  ];

  return (
    <div
      data-testid="chat-sidebar"
      className={`w-full md:w-96 bg-[hsl(var(--whatsapp-sidebar))] border-r border-[hsl(var(--whatsapp-border))] flex-col h-screen ${showSidebar ? 'flex' : 'hidden'} md:flex`}
    >
      {/* Header */}
      <div className="bg-[hsl(var(--whatsapp-header))] p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback className="bg-primary/20 text-primary">U</AvatarFallback>
          </Avatar>
          <h1 className="text-lg font-semibold text-primary-foreground">WhatsApp</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-sm text-primary-foreground hover:bg-white/10"
            onClick={() => navigate("/admin")}
            data-testid="admin-nav-button"
          >
            Admin
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-sm text-primary-foreground hover:bg-white/10"
            onClick={handleSignOut}
          >
            Sair
          </Button>
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
            <Users className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-2 bg-[hsl(var(--whatsapp-sidebar))]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Pesquisar ou começar uma nova conversa" 
            className="pl-10 bg-[hsl(var(--whatsapp-hover))] border-none"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="px-2 pb-2">
        <div className="grid grid-cols-2 gap-2">
          {filters.map(filter => (
            <Button
              key={filter.value}
              data-testid={filter.testId}
              variant={activeFilter === filter.value ? "secondary" : "ghost"}
              size="sm"
              className="text-xs"
              onClick={() => onFilterChange(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1">
        {filteredChats.map((chat) => {
          const assignedLabels = getAssignedLabels(chat);

          return (
            <div
              key={chat.id}
              onClick={() => {
                onToggleSidebar();
                onSelectChat(chat);
              }}
              className={`
                flex items-center gap-3 p-3 cursor-pointer transition-colors
                hover:bg-[hsl(var(--whatsapp-hover))]
                ${selectedChat?.id === chat.id ? 'bg-[hsl(var(--whatsapp-hover))]' : ''}
              `}
            >
              <Avatar className="w-12 h-12 flex-shrink-0">
                <AvatarImage src={chat.avatar} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(chat.name)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm truncate">{chat.name}</h3>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {chat.timestamp}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground truncate flex-1">
                    {chat.lastMessage}
                  </p>
                  {chat.unread > 0 && (
                    <Badge className="ml-2 bg-primary text-primary-foreground rounded-full px-2 py-0 text-xs flex-shrink-0">
                      {chat.unread}
                    </Badge>
                  )}
                </div>

                {assignedLabels.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-xs text-muted-foreground">Atribuído:</span>
                    {assignedLabels.map((label) => (
                      <Badge key={label} variant="outline" className="text-xs">
                        {label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
};
