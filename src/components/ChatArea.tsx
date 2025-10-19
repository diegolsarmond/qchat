import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Search, 
  MoreVertical, 
  Paperclip, 
  Smile, 
  Mic, 
  Send,
  Phone,
  Video,
  Check,
  CheckCheck
} from "lucide-react";
import { Chat, Message } from "@/types/whatsapp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatAreaProps {
  chat: Chat | null;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onAssignChat: (chatId: string) => void;
}

export const ChatArea = ({ chat, messages, onSendMessage, onAssignChat }: ChatAreaProps) => {
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (messageText.trim()) {
      onSendMessage(messageText);
      setMessageText("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const MessageStatus = ({ status }: { status?: Message['status'] }) => {
    if (!status) return null;
    
    if (status === 'read') {
      return <CheckCheck className="w-4 h-4 text-blue-500" />;
    } else if (status === 'delivered') {
      return <CheckCheck className="w-4 h-4 text-muted-foreground" />;
    }
    return <Check className="w-4 h-4 text-muted-foreground" />;
  };

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[hsl(var(--whatsapp-chat-bg))]">
        <div className="text-center space-y-4">
          <div className="w-64 h-64 mx-auto opacity-20">
            <svg viewBox="0 0 303 172" className="w-full h-full">
              <path fill="currentColor" d="M219.7 120.5c-1.4-1.2-2.8-2.4-4.2-3.6-7.5-6.3-15.1-12.5-23.1-18.1-4.5-3.2-9.3-6-14.4-8.1-5.1-2.1-10.5-3.5-16-3.9-5.5-.4-11.1.2-16.4 1.8-5.3 1.6-10.4 4.1-14.9 7.4-4.5 3.3-8.4 7.4-11.5 12.1-3.1 4.7-5.4 9.9-6.8 15.4-.7 2.7-1.2 5.5-1.4 8.3-.2 2.8-.1 5.6.3 8.4.8 5.6 2.6 11 5.3 15.9 2.7 4.9 6.2 9.3 10.4 13 8.4 7.4 19.1 11.9 30.4 13 11.3 1.1 23-1.3 33.1-7 10.1-5.7 18.5-14.4 23.8-24.7 2.7-5.2 4.6-10.8 5.7-16.6.5-2.9.8-5.8.8-8.8 0-2.9-.3-5.9-.9-8.7z"/>
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-light text-muted-foreground">WhatsApp Web</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Selecione uma conversa para começar a enviar mensagens
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[hsl(var(--whatsapp-chat-bg))]">
      {/* Chat Header */}
      <div className="bg-[hsl(var(--whatsapp-header))] p-3 flex items-center justify-between border-b border-[hsl(var(--whatsapp-border))]">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={chat.avatar} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(chat.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-primary-foreground">{chat.name}</h2>
            <p className="text-xs text-primary-foreground/70">online</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
            <Video className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
            <Phone className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
            <Search className="w-5 h-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onAssignChat(chat.id)}>
                Atribuir conversa
              </DropdownMenuItem>
              <DropdownMenuItem>Info do contato</DropdownMenuItem>
              <DropdownMenuItem>Selecionar mensagens</DropdownMenuItem>
              <DropdownMenuItem>Silenciar notificações</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                Apagar conversa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 10h1v1h-1z' fill='%23000000' fill-opacity='0.02'/%3E%3C/svg%3E")`,
      }}>
        <div className="space-y-3 max-w-4xl mx-auto">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.from === 'me' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[65%] rounded-lg p-2 px-3 shadow-sm
                  ${message.from === 'me' 
                    ? 'bg-[hsl(var(--whatsapp-message-out))]' 
                    : 'bg-[hsl(var(--whatsapp-message-in))]'
                  }
                `}
              >
                <p className="text-sm break-words">{message.content}</p>
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {message.timestamp}
                  </span>
                  {message.from === 'me' && <MessageStatus status={message.status} />}
                </div>
              </div>
            </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="bg-[hsl(var(--whatsapp-header))] p-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
          <Smile className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
          <Paperclip className="w-5 h-5" />
        </Button>
        
        <Input
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Digite uma mensagem"
          className="flex-1 bg-white/90"
        />
        
        {messageText.trim() ? (
          <Button 
            onClick={handleSend}
            size="icon" 
            className="bg-primary hover:bg-primary/90"
          >
            <Send className="w-5 h-5" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
            <Mic className="w-5 h-5" />
          </Button>
        )}
      </div>
    </div>
  );
};
