-- Battle assignment and change notifications with exact deep links.
ALTER TABLE public.gx_event_match_notification_log DROP CONSTRAINT IF EXISTS gx_event_match_notification_log_notification_kind_check;
ALTER TABLE public.gx_event_match_notification_log ADD CONSTRAINT gx_event_match_notification_log_notification_kind_check CHECK (notification_kind = ANY (ARRAY['assigned'::text, 'updated'::text, 'result'::text]));

CREATE OR REPLACE FUNCTION public.gx_events_notify_match(p_match_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event_id uuid;
  v_title text;
  v_scheduled_at timestamptz;
  v_needs_opponent boolean;
  v_opponent_mode text;
  v_count integer := 0;
  v_when text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede notificar batallas.' USING ERRCODE='42501';
  END IF;

  SELECT e.id, e.title, m.scheduled_at, m.needs_opponent, m.opponent_mode
    INTO v_event_id, v_title, v_scheduled_at, v_needs_opponent, v_opponent_mode
  FROM public.gx_event_matches m
  JOIN public.gx_events e ON e.id = m.event_id
  WHERE m.id = p_match_id AND m.status = 'scheduled';

  IF v_event_id IS NULL THEN RETURN 0; END IF;
  IF v_scheduled_at IS NOT NULL THEN
    v_when := to_char(v_scheduled_at AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY "a las" HH12:MI AM');
  END IF;

  WITH candidates AS (
    SELECT m.id AS match_id, a.user_id,
      CASE
        WHEN m.opponent_mode = 'random_tiktok' THEN 'una cuenta al azar en TikTok'
        WHEN m.needs_opponent OR m.participant_b_id IS NULL THEN 'un contrincante pendiente'
        ELSE coalesce(nullif(b.tiktok_username,''), nullif(pb.username,''), 'tu rival')
      END AS opponent
    FROM public.gx_event_matches m
    JOIN public.gx_event_participants a ON a.id = m.participant_a_id
    LEFT JOIN public.gx_event_participants b ON b.id = m.participant_b_id
    LEFT JOIN public.profiles pb ON pb.id = b.user_id
    WHERE m.id = p_match_id AND m.status = 'scheduled'
    UNION ALL
    SELECT m.id, b.user_id,
      coalesce(nullif(a.tiktok_username,''), nullif(pa.username,''), 'tu rival')
    FROM public.gx_event_matches m
    JOIN public.gx_event_participants a ON a.id = m.participant_a_id
    JOIN public.gx_event_participants b ON b.id = m.participant_b_id
    LEFT JOIN public.profiles pa ON pa.id = a.user_id
    WHERE m.id = p_match_id AND m.status = 'scheduled'
  ), fresh AS (
    INSERT INTO public.gx_event_match_notification_log(match_id, user_id, notification_kind)
    SELECT match_id, user_id, 'assigned' FROM candidates
    ON CONFLICT DO NOTHING
    RETURNING match_id, user_id
  ), inserted AS (
    INSERT INTO public.notifications(user_id, type, title, message, link_page, link_target)
    SELECT f.user_id, 'event_match',
      CASE
        WHEN v_needs_opponent THEN 'Actualización de tu batalla en ' || left(v_title, 90)
        WHEN v_scheduled_at IS NOT NULL THEN '¡Tu batalla en ' || left(v_title, 90) || ' ya está programada!'
        ELSE '¡Tienes una batalla asignada en ' || left(v_title, 90) || '!'
      END,
      left(CASE
        WHEN v_needs_opponent THEN 'Tu batalla quedó pendiente de un nuevo contrincante. Administración te avisará cuando se actualice.'
        WHEN v_opponent_mode = 'random_tiktok' THEN 'Te asignaron la modalidad de batalla al azar en TikTok. Registra tu participación en el evento.'
        WHEN v_scheduled_at IS NOT NULL THEN 'Tu batalla contra @' || c.opponent || ' es el ' || v_when || '. Toca aquí para abrir directamente tu enfrentamiento en Grayxon.'
        ELSE 'Tu batalla contra @' || c.opponent || ' quedó asignada. El horario aún está pendiente; te avisaremos cuando se programe.'
      END, 450),
      'event-match', f.match_id::text
    FROM fresh f JOIN candidates c ON c.match_id=f.match_id AND c.user_id=f.user_id
    RETURNING id
  )
  SELECT count(*)::integer INTO v_count FROM inserted;
  RETURN coalesce(v_count,0);
END;
$function$


CREATE OR REPLACE FUNCTION public.gx_events_notify_match_update(p_match_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event_id uuid;
  v_title text;
  v_scheduled_at timestamptz;
  v_needs_opponent boolean;
  v_opponent_mode text;
  v_count integer := 0;
  v_when text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede notificar cambios de batallas.' USING ERRCODE='42501';
  END IF;

  SELECT e.id, e.title, m.scheduled_at, m.needs_opponent, m.opponent_mode
    INTO v_event_id, v_title, v_scheduled_at, v_needs_opponent, v_opponent_mode
  FROM public.gx_event_matches m
  JOIN public.gx_events e ON e.id=m.event_id
  WHERE m.id=p_match_id AND m.status='scheduled';
  IF v_event_id IS NULL THEN RETURN 0; END IF;
  IF v_scheduled_at IS NOT NULL THEN
    v_when := to_char(v_scheduled_at AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY "a las" HH12:MI AM');
  END IF;

  DELETE FROM public.gx_event_match_notification_log
  WHERE match_id=p_match_id AND notification_kind='updated';

  WITH candidates AS (
    SELECT m.id AS match_id, a.user_id,
      CASE
        WHEN m.opponent_mode='random_tiktok' THEN 'una cuenta al azar en TikTok'
        WHEN m.needs_opponent OR m.participant_b_id IS NULL THEN NULL
        ELSE coalesce(nullif(b.tiktok_username,''),nullif(pb.username,''),'tu rival')
      END AS opponent
    FROM public.gx_event_matches m
    JOIN public.gx_event_participants a ON a.id=m.participant_a_id
    LEFT JOIN public.gx_event_participants b ON b.id=m.participant_b_id
    LEFT JOIN public.profiles pb ON pb.id=b.user_id
    WHERE m.id=p_match_id AND m.status='scheduled'
    UNION ALL
    SELECT m.id,b.user_id,coalesce(nullif(a.tiktok_username,''),nullif(pa.username,''),'tu rival')
    FROM public.gx_event_matches m
    JOIN public.gx_event_participants a ON a.id=m.participant_a_id
    JOIN public.gx_event_participants b ON b.id=m.participant_b_id
    LEFT JOIN public.profiles pa ON pa.id=a.user_id
    WHERE m.id=p_match_id AND m.status='scheduled'
  ), fresh AS (
    INSERT INTO public.gx_event_match_notification_log(match_id,user_id,notification_kind)
    SELECT match_id,user_id,'updated' FROM candidates
    ON CONFLICT DO NOTHING
    RETURNING match_id,user_id
  ), inserted AS (
    INSERT INTO public.notifications(user_id,type,title,message,link_page,link_target)
    SELECT f.user_id,'event_match',
      'Cambió tu batalla en ' || left(v_title,100),
      left(CASE
        WHEN v_needs_opponent THEN 'Tu batalla quedó pendiente de un nuevo contrincante. Administración te avisará cuando se actualice.'
        WHEN v_opponent_mode='random_tiktok' THEN 'Tu batalla fue actualizada a la modalidad al azar en TikTok.'
        WHEN v_scheduled_at IS NOT NULL THEN 'Tu contrincante o programación cambió. Ahora tu batalla contra @' || coalesce(c.opponent,'tu rival') || ' está prevista para el ' || v_when || '.'
        ELSE 'Tu contrincante fue actualizado a @' || coalesce(c.opponent,'tu rival') || '. El horario está pendiente de programación.'
      END,450),
      'event-match',f.match_id::text
    FROM fresh f JOIN candidates c ON c.match_id=f.match_id AND c.user_id=f.user_id
    RETURNING id
  )
  SELECT count(*)::integer INTO v_count FROM inserted;
  RETURN coalesce(v_count,0);
END;
$function$


CREATE OR REPLACE FUNCTION public.gx_events_schedule_matches(p_event_id uuid, p_schedules jsonb)
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
  v_sent integer := 0;
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
  ) THEN RAISE EXCEPTION 'Cada batalla debe tener identificador, fecha y hora.' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(DISTINCT x.match_id) FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid, scheduled_at timestamptz)) <> v_input_count THEN
    RAISE EXCEPTION 'La programación contiene batallas repetidas.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid, scheduled_at timestamptz)
    LEFT JOIN public.gx_event_matches m ON m.id=x.match_id
    LEFT JOIN public.gx_event_rounds r ON r.id=m.round_id
    WHERE m.id IS NULL OR m.event_id<>p_event_id OR m.status<>'scheduled' OR m.participant_b_id IS NULL OR r.id IS NULL
  ) THEN RAISE EXCEPTION 'Una o más batallas no pertenecen a este evento o ya no se pueden programar.' USING ERRCODE='22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid,scheduled_at timestamptz)
    JOIN public.gx_event_matches m ON m.id=x.match_id
    JOIN public.gx_event_rounds r ON r.id=m.round_id
    JOIN public.gx_event_phases p ON p.id=r.phase_id
    WHERE (p.starts_at IS NOT NULL AND x.scheduled_at<p.starts_at) OR (p.ends_at IS NOT NULL AND x.scheduled_at>p.ends_at)
  ) THEN RAISE EXCEPTION 'La fecha y hora de cada batalla deben quedar dentro del rango de su fase.' USING ERRCODE='22023'; END IF;

  FOR v_row IN SELECT x.match_id,x.scheduled_at FROM jsonb_to_recordset(p_schedules) AS x(match_id uuid,scheduled_at timestamptz) ORDER BY x.match_id LOOP
    UPDATE public.gx_event_matches SET scheduled_at=v_row.scheduled_at,updated_at=now()
    WHERE id=v_row.match_id AND event_id=p_event_id AND status='scheduled';
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo guardar una de las fechas; se canceló toda la programación.'; END IF;
    v_scheduled:=v_scheduled+1;
    v_sent:=public.gx_events_notify_match_update(v_row.match_id);
    v_notifications:=v_notifications+coalesce(v_sent,0);
  END LOOP;

  RETURN jsonb_build_object('matches_scheduled',v_scheduled,'notifications_created',v_notifications,'expected_notifications',v_input_count*2);
END;
$function$


CREATE OR REPLACE FUNCTION public.gx_events_admin_set_participant(p_event_id uuid, p_user_id uuid, p_action text, p_tiktok_username text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event public.gx_events%rowtype;
  v_profile public.profiles%rowtype;
  v_id uuid;
  v_orphaned integer := 0;
  v_changed integer := 0;
  v_match record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede gestionar participantes.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_event FROM public.gx_events WHERE id=p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El evento no existe.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=p_user_id AND active IS TRUE;
  IF NOT FOUND OR v_profile.role NOT IN ('creator','manager') THEN
    RAISE EXCEPTION 'No se encontró un usuario activo elegible.' USING ERRCODE='P0002';
  END IF;
  IF v_event.battle_enabled AND v_profile.role<>'creator' THEN
    RAISE EXCEPTION 'Para un evento de batallas solo se admiten creadores.' USING ERRCODE='22023';
  END IF;
  IF NOT public.gx_event_audience_matches(p_event_id,p_user_id) THEN
    RAISE EXCEPTION 'La cuenta no pertenece a la audiencia seleccionada del evento.' USING ERRCODE='42501';
  END IF;
  IF p_action='add' THEN
    INSERT INTO public.gx_event_participants(event_id,user_id,status,tiktok_username,registered_at)
    VALUES(p_event_id,p_user_id,'registered',NULLIF(regexp_replace(trim(coalesce(p_tiktok_username,v_profile.username,'')),'^@+',''),''))
    ON CONFLICT(event_id,user_id) DO UPDATE SET status='registered',tiktok_username=coalesce(excluded.tiktok_username,gx_event_participants.tiktok_username)
    RETURNING id INTO v_id;
    INSERT INTO public.gx_event_responses(event_id,user_id,response,tiktok_username,responded_at)
    VALUES(p_event_id,p_user_id,'yes',NULLIF(regexp_replace(trim(coalesce(p_tiktok_username,v_profile.username,'')),'^@+',''),'') ,now())
    ON CONFLICT(event_id,user_id) DO UPDATE SET response='yes',tiktok_username=coalesce(excluded.tiktok_username,gx_event_responses.tiktok_username),responded_at=now();
  ELSIF p_action='remove' THEN
    SELECT id INTO v_id FROM public.gx_event_participants
    WHERE event_id=p_event_id AND user_id=p_user_id AND status<>'disqualified' FOR UPDATE;
    IF v_id IS NULL THEN RAISE EXCEPTION 'El participante no está activo en este evento.' USING ERRCODE='P0002'; END IF;
    UPDATE public.gx_event_matches SET participant_a_id=participant_b_id,participant_b_id=NULL,
      needs_opponent=true,opponent_mode='event',winner_participant_id=NULL,score_a=NULL,score_b=NULL,result_note=NULL,updated_at=now()
    WHERE event_id=p_event_id AND status='scheduled' AND participant_a_id=v_id AND participant_b_id IS NOT NULL;
    GET DIAGNOSTICS v_orphaned=ROW_COUNT;
    UPDATE public.gx_event_matches SET participant_b_id=NULL,needs_opponent=true,opponent_mode='event',
      winner_participant_id=NULL,score_a=NULL,score_b=NULL,result_note=NULL,updated_at=now()
    WHERE event_id=p_event_id AND status='scheduled' AND participant_b_id=v_id AND participant_a_id<>v_id;
    GET DIAGNOSTICS v_changed=ROW_COUNT;
    v_orphaned:=v_orphaned+v_changed;
    DELETE FROM public.gx_event_matches WHERE event_id=p_event_id AND status='scheduled' AND participant_a_id=v_id AND participant_b_id IS NULL;
    UPDATE public.gx_event_participants SET status='withdrawn' WHERE id=v_id;
    UPDATE public.gx_event_enrollment_requests SET status='cancelled',updated_at=now()
      WHERE event_id=p_event_id AND creator_user_id=p_user_id AND status='approved';
    FOR v_match IN SELECT id FROM public.gx_event_matches WHERE event_id=p_event_id AND status='scheduled' AND needs_opponent IS TRUE AND updated_at=now() LOOP
      PERFORM public.gx_events_notify_match_update(v_match.id);
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Acción no válida.' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('ok',true,'participant_id',v_id,'action',p_action,'battles_needing_opponent',v_orphaned);
END;
$function$


GRANT EXECUTE ON FUNCTION public.gx_events_notify_match_update(uuid) TO authenticated;
