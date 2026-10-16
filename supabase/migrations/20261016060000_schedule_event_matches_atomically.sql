-- Atomically assign all battle times for an event.
-- Notifications are emitted by the existing trg_gx_events_notify_match_when_scheduled trigger.
CREATE OR REPLACE FUNCTION public.gx_events_schedule_matches(
  p_event_id uuid,
  p_schedules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_input_count integer;
  v_scheduled integer := 0;
  v_notifications integer := 0;
  v_row record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede programar batallas.' USING ERRCODE = '42501';
  END IF;
  IF p_event_id IS NULL OR p_schedules IS NULL OR jsonb_typeof(p_schedules) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Envía una lista de batallas con fecha y hora.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_schedules) = 0 THEN
    RAISE EXCEPTION 'Envía al menos una batalla con fecha y hora.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_input_count
  FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid, scheduled_at timestamptz);
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid, scheduled_at timestamptz)
    WHERE x.match_id IS NULL OR x.scheduled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cada batalla debe tener identificador, fecha y hora.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT x.match_id) FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid, scheduled_at timestamptz)) <> v_input_count THEN
    RAISE EXCEPTION 'La programación contiene batallas repetidas.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid, scheduled_at timestamptz)
    LEFT JOIN public.gx_event_matches m ON m.id = x.match_id
    LEFT JOIN public.gx_event_rounds r ON r.id = m.round_id
    WHERE m.id IS NULL OR m.event_id <> p_event_id OR m.status <> 'scheduled'
       OR m.participant_b_id IS NULL OR r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Una o más batallas no pertenecen a este evento o ya no se pueden programar.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid, scheduled_at timestamptz)
    JOIN public.gx_event_matches m ON m.id = x.match_id
    JOIN public.gx_event_rounds r ON r.id = m.round_id
    JOIN public.gx_event_phases p ON p.id = r.phase_id
    WHERE (p.starts_at IS NOT NULL AND x.scheduled_at < p.starts_at)
       OR (p.ends_at IS NOT NULL AND x.scheduled_at > p.ends_at)
  ) THEN
    RAISE EXCEPTION 'La fecha y hora de cada batalla deben quedar dentro del rango de su fase.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN
    SELECT x.match_id, x.scheduled_at
    FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid, scheduled_at timestamptz)
    ORDER BY x.match_id
  LOOP
    UPDATE public.gx_event_matches
       SET scheduled_at = v_row.scheduled_at,
           updated_at = now()
     WHERE id = v_row.match_id AND event_id = p_event_id AND status = 'scheduled';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se pudo guardar una de las fechas; se canceló toda la programación.';
    END IF;
    v_scheduled := v_scheduled + 1;
  END LOOP;

  SELECT count(*)::integer INTO v_notifications
  FROM public.notifications n
  WHERE n.type = 'event_match'
    AND n.link_target IN (
      SELECT x.match_id::text
      FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid, scheduled_at timestamptz)
    );

  RETURN jsonb_build_object(
    'matches_scheduled', v_scheduled,
    'notifications_created', v_notifications,
    'expected_notifications', v_input_count * 2
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.gx_events_schedule_matches(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gx_events_schedule_matches(uuid, jsonb) TO authenticated;
