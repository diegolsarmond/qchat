export interface Credential {
  id: string;
  instanceName: string;
  subdomain: string;
  token: string;
  adminToken?: string;
  status: 'disconnected' | 'connecting' | 'connected';
  qrCode?: string;
  createdAt: Date;
}

export interface Chat {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  avatar?: string;
  isGroup: boolean;
  assignedTo?: string;
}

export interface Message {
  id: string;
  chatId: string;
  content: string;
  timestamp: string;
  from: 'me' | 'them';
  status?: 'sent' | 'delivered' | 'read';
  messageType?: 'text' | 'media';
  mediaType?: string;
  caption?: string;
  documentName?: string;
  mediaUrl?: string;
  mediaBase64?: string;
}

export interface SendMessagePayload {
  content: string;
  messageType: 'text' | 'media';
  mediaType?: string;
  mediaUrl?: string;
  mediaBase64?: string;
  documentName?: string;
  caption?: string;
  isPrivate?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}
