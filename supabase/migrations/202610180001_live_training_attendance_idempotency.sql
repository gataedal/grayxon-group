-- Live-training attendance idempotency guard.
-- Safe by design: this migration refuses to proceed if duplicate open rows exist.
-- Reconcile those rows explicitly before rerunning; no attendance data is deleted here.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.live_training_participants
    WHERE left_at IS NULL
    GROUP BY training_id, user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add live-training open-attendance index: duplicate open rows exist. Review and reconcile them before retrying.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS live_training_participants_one_open_session_idx
  ON public.live_training_participants (training_id, user_id)
  WHERE left_at IS NULL;
