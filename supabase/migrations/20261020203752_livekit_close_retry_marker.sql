-- Records that the exact LiveKit room was confirmed present before deletion.
-- This makes database reconciliation safely retryable if LiveKit deletion succeeds
-- but the following Supabase RPC fails.
ALTER TABLE public.live_trainings
  ADD COLUMN IF NOT EXISTS livekit_room_verified_at timestamptz;

COMMENT ON COLUMN public.live_trainings.livekit_room_verified_at IS
  'Set by the trusted LiveKit close endpoint after confirming this exact room exists, before deleting it; supports safe retry after database reconciliation failure.';
