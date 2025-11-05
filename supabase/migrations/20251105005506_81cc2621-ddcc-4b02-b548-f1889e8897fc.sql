-- Add missing document_name column to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS document_name text;