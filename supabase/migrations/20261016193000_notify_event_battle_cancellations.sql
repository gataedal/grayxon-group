-- Notify participants when an assigned battle is cancelled, too.
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
  v_status text;
  v_count integer := 0;
  v_when text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede notificar cambios de batallas.' USING ERRCODE='42501';
  END IF;

  SELECT e.id, e.title, m.scheduled_at, m.needs_opponent, m.opponent_mode, m.status
    INTO v_event_id, v_title, v_scheduled_at, v_needs_opponent, v_opponent_mode, v_status
  FROM public.gx_event_matches m
  JOIN public.gx_events e ON e.id=m.event_id
  WHERE m.id=p_match_id AND m.status IN ('scheduled','cancelled');
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
    WHERE m.id=p_match_id AND m.status IN ('scheduled','cancelled')
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
      CASE WHEN v_status='cancelled' THEN 'Batalla cancelada en ' || left(v_title,100) ELSE 'Cambió tu batalla en ' || left(v_title,100) END,
      left(CASE
        WHEN v_status='cancelled' THEN 'La administración canceló esta batalla. Entra al evento para consultar las novedades.'
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

