-- Enable realtime for chats table
ALTER TABLE public.chats REPLICA IDENTITY FULL;

-- Enable realtime for messages table  
ALTER TABLE public.messages REPLICA IDENTITY FULL;