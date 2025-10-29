ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'waiting';

CREATE INDEX IF NOT EXISTS idx_chats_attendance_status
  ON public.chats(attendance_status);
