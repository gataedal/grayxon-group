-- Persist the authenticated participant who starts the actual LiveKit session.
-- Keep this separate from created_by, which still governs record ownership/authorization.
alter table public.live_trainings
  add column if not exists livekit_host_user_id uuid references public.profiles(id) on delete set null;

comment on column public.live_trainings.livekit_host_user_id is
  'Authenticated profile id of the participant who actually starts the LiveKit session.';
