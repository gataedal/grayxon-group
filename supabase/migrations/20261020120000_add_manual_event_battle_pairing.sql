-- Add an isolated admin-only RPC for manually pairing two event participants.
CREATE OR REPLACE FUNCTION public.gx_events_create_manual_match(
  p_event_id uuid,
  p_participant_a_id uuid,
  p_participant_b_id uuid,
  p_round_id uuid DEFAULT NULL,
  p_phase_id uuid DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event public.gx_events%rowtype;
  v_round public.gx_event_rounds%rowtype;
  v_round_id uuid;
  v_phase_id uuid;
  v_round_number integer;
  v_match_id uuid;
  v_notifications integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede crear batallas manuales.' USING ERRCODE='42501';
  END IF;
  IF p_event_id IS NULL OR p_participant_a_id IS NULL OR p_participant_b_id IS NULL
     OR p_participant_a_id = p_participant_b_id THEN
    RAISE EXCEPTION 'Selecciona dos participantes diferentes.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_event FROM public.gx_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El evento no existe.' USING ERRCODE='P0002';
  END IF;
  IF v_event.battle_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Este evento no tiene habilitado el sistema de batallas.' USING ERRCODE='22023';
  END IF;

  PERFORM 1
  FROM public.gx_event_participants ep
  JOIN public.gx_event_responses er
    ON er.event_id = ep.event_id AND er.user_id = ep.user_id AND er.response = 'yes'
  WHERE ep.event_id = p_event_id
    AND ep.id IN (p_participant_a_id, p_participant_b_id)
    AND ep.status IN ('registered', 'confirmed')
  FOR UPDATE OF ep;
  IF (SELECT count(DISTINCT ep.id)
      FROM public.gx_event_participants ep
      JOIN public.gx_event_responses er
        ON er.event_id = ep.event_id AND er.user_id = ep.user_id AND er.response = 'yes'
      WHERE ep.event_id = p_event_id
        AND ep.id IN (p_participant_a_id, p_participant_b_id)
        AND ep.status IN ('registered', 'confirmed')) <> 2 THEN
    RAISE EXCEPTION 'Ambos creadores deben estar inscritos, activos y haber confirmado su participación.' USING ERRCODE='22023';
  END IF;

  IF p_round_id IS NOT NULL THEN
    SELECT * INTO v_round FROM public.gx_event_rounds
    WHERE id = p_round_id AND event_id = p_event_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La ronda seleccionada no pertenece a este evento.' USING ERRCODE='22023';
    END IF;
    v_round_id := v_round.id;
    v_phase_id := v_round.phase_id;
  ELSE
    v_phase_id := p_phase_id;
    IF v_phase_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.gx_event_phases WHERE id = v_phase_id AND event_id = p_event_id
    ) THEN
      RAISE EXCEPTION 'La fase seleccionada no pertenece a este evento.' USING ERRCODE='22023';
    END IF;
    SELECT COALESCE(MAX(round_number), 0) + 1 INTO v_round_number
    FROM public.gx_event_rounds WHERE event_id = p_event_id;
    INSERT INTO public.gx_event_rounds(event_id, round_number, title, status, created_by, phase_id)
    VALUES (p_event_id, v_round_number, 'Enfrentamientos manuales · ' || v_round_number, 'scheduled', auth.uid(), v_phase_id)
    RETURNING id INTO v_round_id;
  END IF;

  IF p_scheduled_at IS NOT NULL AND v_phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.gx_event_phases p
    WHERE p.id = v_phase_id AND p.event_id = p_event_id
      AND (p_scheduled_at < p.starts_at OR p_scheduled_at > p.ends_at)
  ) THEN
    RAISE EXCEPTION 'La fecha y hora deben estar dentro del rango de la fase.' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gx_event_matches m
    WHERE m.round_id = v_round_id
      AND m.status = 'scheduled'
      AND m.participant_b_id IS NOT NULL
      AND (
        m.participant_a_id IN (p_participant_a_id, p_participant_b_id)
        OR m.participant_b_id IN (p_participant_a_id, p_participant_b_id)
      )
  ) THEN
    RAISE EXCEPTION 'Uno de estos creadores ya tiene una batalla programada en esa ronda.' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.gx_event_matches(
    event_id, round_id, participant_a_id, participant_b_id, status, scheduled_at,
    needs_opponent, opponent_mode
  )
  VALUES (
    p_event_id, v_round_id, p_participant_a_id, p_participant_b_id, 'scheduled', p_scheduled_at,
    false, 'event'
  )
  RETURNING id INTO v_match_id;

  IF p_scheduled_at IS NULL THEN
    BEGIN
      PERFORM public.gx_events_notify_match(v_match_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'La batalla manual % fue creada, pero no se pudo enviar la notificación: %', v_match_id, SQLERRM;
    END;
  END IF;

  SELECT count(*)::integer INTO v_notifications
  FROM public.notifications
  WHERE type = 'event_match' AND link_target = v_match_id::text;

  RETURN jsonb_build_object(
    'ok', true,
    'match_id', v_match_id,
    'round_id', v_round_id,
    'round_number', COALESCE(v_round.round_number, v_round_number),
    'notifications_created', COALESCE(v_notifications, 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.gx_events_create_manual_match(uuid, uuid, uuid, uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gx_events_create_manual_match(uuid, uuid, uuid, uuid, uuid, timestamptz) TO authenticated;
