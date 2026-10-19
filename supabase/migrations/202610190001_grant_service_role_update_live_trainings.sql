-- The start-live-training Edge Function uses service_role for an authenticated,
-- server-side status transition after checking the caller and persisted host.
-- Keep this privilege limited to UPDATE on this one table; do not grant broadly.
GRANT UPDATE ON TABLE public.live_trainings TO service_role;
