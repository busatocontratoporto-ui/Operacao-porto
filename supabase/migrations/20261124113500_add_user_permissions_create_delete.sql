-- Add missing can_create and can_delete columns to user_permissions
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_create BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete BOOLEAN NOT NULL DEFAULT false;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
