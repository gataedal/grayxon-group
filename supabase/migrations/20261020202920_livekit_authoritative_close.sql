-- Authoritative LiveKit closure reconciliation.
-- Staged in Git only: do not apply until the end-livekit-training Edge Function
-- has been reviewed and its LiveKit server credentials are configured.

CREATE OR REPLACE FUNCTION public.finalize_live_training_from_livekit_delete(
  p_training_id uuid,
  p_ended_at timestamptz
)
RETURNS TABLE (training_id uuid, finalized boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training public.live_trainings%ROWTYPE;
BEGIN
  IF p_training_id IS NULL OR p_ended_at IS NULL THEN
    RAISE EXCEPTION 'Invalid LiveKit closure parameters';
  END IF;

  SELECT *
    INTO v_training
    FROM public.live_trainings
   WHERE id = p_training_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Live training not found';
  END IF;

  IF v_training.status = 'finished' THEN
    RETURN QUERY SELECT v_training.id, FALSE;
    RETURN;
  END IF;

  IF v_training.status <> 'live'
     OR v_training.started_at IS NULL
     OR p_ended_at < v_training.started_at THEN
    RAISE EXCEPTION 'Live training is not eligible for LiveKit finalization';
  END IF;

  UPDATE public.live_trainings
     SET status = 'finished',
         ended_at = p_ended_at
   WHERE id = v_training.id
     AND status = 'live';

  UPDATE public.live_training_participants
     SET left_at = p_ended_at,
         duration_seconds = GREATEST(
           0,
           FLOOR(EXTRACT(EPOCH FROM (p_ended_at - COALESCE(joined_at, p_ended_at))))::integer
         )
   WHERE live_training_participants.training_id = v_training.id
     AND live_training_participants.left_at IS NULL;

  RETURN QUERY SELECT v_training.id, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_live_training_from_livekit_delete(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_live_training_from_livekit_delete(uuid, timestamptz)
  TO service_role;
