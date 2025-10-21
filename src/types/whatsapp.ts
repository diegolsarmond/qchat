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

export type ChatAttendanceStatus = "waiting" | "in_service" | "finished";

export type ChatFilter = "all" | "mine" | "in_service" | "waiting" | "finished";

export interface Chat {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  lastMessageAt?: number | null;
  unread: number;
  avatar?: string;
  isGroup: boolean;
  assignedTo?: string | string[];
  assignedUserNames?: string[];
  attendanceStatus: ChatAttendanceStatus;
}

export interface Message {
  id: string;
  chatId: string;
  content: string;
  timestamp: string;
  from: 'me' | 'them';
  status?: 'sent' | 'delivered' | 'read';
  messageType?: 'text' | 'media' | 'interactive' | 'contact' | 'location';
  mediaType?: string;
  caption?: string;
  documentName?: string;
  mediaUrl?: string;
  mediaBase64?: string;
  contactName?: string;
  contactPhone?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

export interface InteractiveMenuOption {
  id: string;
  title: string;
  description?: string;
}

export interface InteractiveMenuSection {
  title?: string;
  rows: InteractiveMenuOption[];
}

export interface InteractiveMenuPayload {
  header?: string;
  body: string;
  footer?: string;
  type: 'buttons' | 'list';
  button?: string;
  buttons?: InteractiveMenuOption[];
  sections?: InteractiveMenuSection[];
}

export interface InteractiveMenuOption {
  id: string;
  title: string;
  description?: string;
}

export interface InteractiveMenuSection {
  title?: string;
  rows: InteractiveMenuOption[];
}

export interface InteractiveMenuPayload {
  header?: string;
  body: string;
  footer?: string;
  type: 'buttons' | 'list';
  button?: string;
  buttons?: InteractiveMenuOption[];
  sections?: InteractiveMenuSection[];
}

export interface SendMessagePayload {
  content: string;
  messageType: 'text' | 'media' | 'interactive' | 'contact' | 'location';
  mediaType?: string;
  mediaUrl?: string;
  mediaBase64?: string;
  documentName?: string;
  caption?: string;
  isPrivate?: boolean;
  interactive?: InteractiveMenuPayload;
  contactName?: string;
  contactPhone?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}
