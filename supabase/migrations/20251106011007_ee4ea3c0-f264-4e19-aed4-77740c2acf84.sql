-- Add missing media_base64 column to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS media_base64 text;