-- Create users table for system users (attendants)
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create credentials table for UAZ API credentials
CREATE TABLE public.credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT NOT NULL,
  subdomain TEXT NOT NULL,
  token TEXT NOT NULL,
  admin_token TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  qr_code TEXT,
  profile_name TEXT,
  phone_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chats table
CREATE TABLE public.chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_id UUID NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  wa_chat_id TEXT NOT NULL,
  name TEXT NOT NULL,
  last_message TEXT,
  last_message_timestamp BIGINT,
  unread_count INTEGER DEFAULT 0,
  avatar TEXT,
  is_group BOOLEAN DEFAULT false,
  assigned_to UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(credential_id, wa_chat_id)
);

-- Create messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  wa_message_id TEXT NOT NULL,
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  from_me BOOLEAN DEFAULT false,
  sender TEXT,
  sender_name TEXT,
  status TEXT,
  message_timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(chat_id, wa_message_id)
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table (public access for now, can be restricted later)
CREATE POLICY "Users are viewable by everyone" 
ON public.users FOR SELECT USING (true);

CREATE POLICY "Users can be created by anyone" 
ON public.users FOR INSERT WITH CHECK (true);

-- RLS Policies for credentials table
CREATE POLICY "Credentials are viewable by everyone" 
ON public.credentials FOR SELECT USING (true);

CREATE POLICY "Credentials can be created by anyone" 
ON public.credentials FOR INSERT WITH CHECK (true);

CREATE POLICY "Credentials can be updated by anyone" 
ON public.credentials FOR UPDATE USING (true);

-- RLS Policies for chats table
CREATE POLICY "Chats are viewable by everyone" 
ON public.chats FOR SELECT USING (true);

CREATE POLICY "Chats can be created by anyone" 
ON public.chats FOR INSERT WITH CHECK (true);

CREATE POLICY "Chats can be updated by anyone" 
ON public.chats FOR UPDATE USING (true);

-- RLS Policies for messages table
CREATE POLICY "Messages are viewable by everyone" 
ON public.messages FOR SELECT USING (true);

CREATE POLICY "Messages can be created by anyone" 
ON public.messages FOR INSERT WITH CHECK (true);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at
BEFORE UPDATE ON public.credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chats_updated_at
BEFORE UPDATE ON public.chats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_chats_credential_id ON public.chats(credential_id);
CREATE INDEX idx_chats_assigned_to ON public.chats(assigned_to);
CREATE INDEX idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX idx_messages_timestamp ON public.messages(message_timestamp DESC);