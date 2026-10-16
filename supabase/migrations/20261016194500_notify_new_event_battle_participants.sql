-- Let new entrants know that battle assignment is pending when a round already exists.
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

    IF v_event.battle_enabled AND EXISTS (SELECT 1 FROM public.gx_event_rounds WHERE event_id=p_event_id) THEN
      INSERT INTO public.notifications(user_id,type,title,message,link_page,link_target)
      VALUES(p_user_id,'event','Tu inscripción está confirmada; batalla pendiente',
        'Ya formas parte de "'||left(v_event.title,100)||'". La administración te asignará un contrincante y te llegará otra notificación cuando quede listo tu enfrentamiento.',
        'events',p_event_id::text);
    END IF;
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

