-- Trusted Jitsi room-destroyed events. This migration is staged in Git only;
-- do not apply until the Jitsi event-sync receiver is deployed and tested.

CREATE TABLE IF NOT EXISTS public.jitsi_conference_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_name text NOT NULL CHECK (event_name = 'muc-room-destroyed'),
  room_name text NOT NULL,
  room_jid text NOT NULL,
  meeting_id text,
  destroyed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jitsi_conference_events_room_destroyed_idx
  ON public.jitsi_conference_events (room_name, destroyed_at DESC);

ALTER TABLE public.jitsi_conference_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.jitsi_conference_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.jitsi_conference_events TO service_role;

-- The trusted webhook calls this transaction after authenticating Prosody's
-- event. Event insertion, session finalization, and attendance reconciliation
-- commit atomically so the browser cannot forge a successful close.

DROP FUNCTION IF EXISTS public.finalize_live_training_from_jitsi_event(text, timestamptz);

CREATE OR REPLACE FUNCTION public.finalize_live_training_from_jitsi_event(
  p_event_key text,
  p_event_name text,
  p_room_name text,
  p_room_jid text,
  p_meeting_id text,
  p_destroyed_at timestamptz
)
RETURNS TABLE (training_id uuid, finalized boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training public.live_trainings%ROWTYPE;
BEGIN
  IF p_event_name <> 'muc-room-destroyed'
     OR p_event_key IS NULL OR length(p_event_key) <> 64
     OR p_room_name IS NULL OR p_room_jid IS NULL
     OR p_destroyed_at IS NULL THEN
    RAISE EXCEPTION 'Invalid trusted Jitsi closure event';
  END IF;

  INSERT INTO public.jitsi_conference_events (
    event_key, event_name, room_name, room_jid, meeting_id, destroyed_at
  ) VALUES (
    p_event_key, p_event_name, p_room_name, p_room_jid, p_meeting_id, p_destroyed_at
  ) ON CONFLICT (event_key) DO NOTHING;

  SELECT *
    INTO v_training
    FROM public.live_trainings
   WHERE room_name = p_room_name
     AND status = 'live'
     AND started_at IS NOT NULL
     AND started_at <= p_destroyed_at
   ORDER BY started_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.live_trainings
     SET status = 'finished',
         ended_at = p_destroyed_at
   WHERE id = v_training.id
     AND status = 'live';

  UPDATE public.live_training_participants
     SET left_at = p_destroyed_at,
         duration_seconds = GREATEST(
           0,
           FLOOR(EXTRACT(EPOCH FROM (p_destroyed_at - COALESCE(joined_at, p_destroyed_at))))::integer
         )
   WHERE live_training_participants.training_id = v_training.id
     AND live_training_participants.left_at IS NULL;

  RETURN QUERY SELECT v_training.id, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_live_training_from_jitsi_event(text, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_live_training_from_jitsi_event(text, text, text, text, text, timestamptz)
  TO service_role;
