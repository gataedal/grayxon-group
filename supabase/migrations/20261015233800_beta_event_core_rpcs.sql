-- Grayxon Beta only: core tournament RPCs.
-- The same definitions were applied to Supabase project wnflvxbxgrupggtzlblh.
CREATE OR REPLACE FUNCTION public.gx_events_generate_round(p_event_id uuid,p_round_number integer,p_title text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_round_id uuid; v_count integer:=0; v_byes integer:=0; v_a uuid; v_b uuid; v_ids uuid[]; i integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede generar rondas.' USING ERRCODE='42501'; END IF;
 IF p_round_number IS NULL OR p_round_number<1 OR NULLIF(btrim(p_title),'') IS NULL THEN RAISE EXCEPTION 'Número y título de ronda obligatorios.'; END IF;
 IF EXISTS(SELECT 1 FROM public.gx_event_rounds WHERE event_id=p_event_id AND round_number=p_round_number) THEN RAISE EXCEPTION 'Ya existe esa ronda.'; END IF;
 SELECT array_agg(id ORDER BY random()) INTO v_ids FROM public.gx_event_participants WHERE event_id=p_event_id AND status IN ('registered','confirmed');
 IF COALESCE(array_length(v_ids,1),0)<2 THEN RAISE EXCEPTION 'Se necesitan al menos dos participantes activos.'; END IF;
 INSERT INTO public.gx_event_rounds(event_id,round_number,title,status,created_by) VALUES(p_event_id,p_round_number,p_title,'scheduled',auth.uid()) RETURNING id INTO v_round_id;
 FOR i IN 1..(array_length(v_ids,1)/2) LOOP
  v_a:=v_ids[(i*2)-1]; v_b:=v_ids[i*2];
  INSERT INTO public.gx_event_matches(event_id,round_id,participant_a_id,participant_b_id,status) VALUES(p_event_id,v_round_id,v_a,v_b,'scheduled');
  v_count:=v_count+1;
 END LOOP;
 IF array_length(v_ids,1)%2=1 THEN
  v_a:=v_ids[array_length(v_ids,1)];
  INSERT INTO public.gx_event_matches(event_id,round_id,participant_a_id,participant_b_id,winner_participant_id,status,result_note)
  VALUES(p_event_id,v_round_id,v_a,NULL,v_a,'bye','Pase libre');
  v_byes:=1;
 END IF;
 RETURN jsonb_build_object('round_id',v_round_id,'matches',v_count,'byes',v_byes);
END; $$;
GRANT EXECUTE ON FUNCTION public.gx_events_generate_round(uuid,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gx_events_save_match_result(
 p_match_id uuid,p_winner_participant_id uuid,p_score_a numeric,p_score_b numeric,p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_match public.gx_event_matches%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede guardar resultados.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_match FROM public.gx_event_matches WHERE id=p_match_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Batalla no encontrada.'; END IF;
 IF p_winner_participant_id IS NOT NULL AND p_winner_participant_id NOT IN (v_match.participant_a_id,v_match.participant_b_id) THEN
  RAISE EXCEPTION 'El ganador debe ser uno de los participantes de la batalla.';
 END IF;
 UPDATE public.gx_event_matches SET winner_participant_id=p_winner_participant_id,score_a=p_score_a,score_b=p_score_b,
 result_note=p_notes,status='completed',updated_at=now() WHERE id=p_match_id;
 RETURN jsonb_build_object('success',true,'match_id',p_match_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.gx_events_save_match_result(uuid,uuid,numeric,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gx_event_leaderboard(p_event_id uuid)
RETURNS TABLE(user_id uuid,username text,tiktok_username text,points numeric,battles_played integer,wins integer,rank_position bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.gx_event_can_view(p_event_id) THEN RAISE EXCEPTION 'No tienes acceso al ranking de este evento.' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 WITH roster AS (
  SELECT ep.user_id,COALESCE(NULLIF(p.username,''),NULLIF(p.full_name,''),'usuario') AS uname,
   COALESCE(NULLIF(ep.tiktok_username,''),NULLIF(p.tiktok_username,''),NULLIF(p.username,'')) AS tiktok
  FROM public.gx_event_participants ep JOIN public.profiles p ON p.id=ep.user_id
  WHERE ep.event_id=p_event_id AND ep.status IN ('registered','confirmed')
 ), mission_scores AS (
  SELECT mp.user_id,COALESCE(SUM((CASE WHEN m.score_over_target THEN mp.value ELSE LEAST(mp.value,m.target_value) END)*m.points_per_unit+
    CASE WHEN mp.value>=m.target_value THEN m.completion_bonus ELSE 0 END),0)::numeric AS pts
  FROM public.gx_event_mission_progress mp JOIN public.gx_event_missions m ON m.id=mp.mission_id AND m.event_id=mp.event_id
  WHERE mp.event_id=p_event_id AND mp.status='approved' AND m.is_active GROUP BY mp.user_id
 ), battle_rows AS (
  SELECT ep.user_id,m.status,m.winner_participant_id,ep.id AS participant_id,m.event_id,
   (m.status='completed' AND m.winner_participant_id=ep.id) AS won,
   (m.status='completed' AND m.winner_participant_id IS NULL) AS drawn,
   (m.status='completed' AND m.participant_b_id IS NOT NULL) AS played
  FROM public.gx_event_matches m JOIN public.gx_event_participants ep ON ep.id=m.participant_a_id WHERE m.event_id=p_event_id
  UNION ALL
  SELECT ep.user_id,m.status,m.winner_participant_id,ep.id,m.event_id,
   (m.status='completed' AND m.winner_participant_id=ep.id),
   (m.status='completed' AND m.winner_participant_id IS NULL),
   (m.status='completed' AND m.participant_b_id IS NOT NULL)
  FROM public.gx_event_matches m JOIN public.gx_event_participants ep ON ep.id=m.participant_b_id
  WHERE m.event_id=p_event_id AND m.participant_b_id IS NOT NULL
 ), battle_scores AS (
  SELECT br.user_id,COALESCE(SUM(CASE WHEN br.played THEN e.battle_participation_points+
    CASE WHEN br.won THEN e.battle_win_points WHEN br.drawn THEN e.battle_draw_points ELSE 0 END ELSE 0 END),0)::numeric AS pts,
   COUNT(*) FILTER(WHERE br.played)::integer AS played,COUNT(*) FILTER(WHERE br.won)::integer AS wins
  FROM battle_rows br JOIN public.gx_events e ON e.id=br.event_id GROUP BY br.user_id
 ), scores AS (
  SELECT r.user_id,r.uname,r.tiktok,(COALESCE(ms.pts,0)+COALESCE(bs.pts,0))::numeric AS total,
   COALESCE(bs.played,0)::integer AS played,COALESCE(bs.wins,0)::integer AS wins
  FROM roster r LEFT JOIN mission_scores ms ON ms.user_id=r.user_id LEFT JOIN battle_scores bs ON bs.user_id=r.user_id
 ), ranked AS (
  SELECT s.*,ROW_NUMBER() OVER(ORDER BY s.total DESC,s.uname ASC)::bigint AS position FROM scores s
 )
 SELECT r.user_id,r.uname,r.tiktok,r.total,r.played,r.wins,r.position FROM ranked r
 WHERE public.is_admin() OR r.user_id=auth.uid() ORDER BY r.position;
END; $$;
GRANT EXECUTE ON FUNCTION public.gx_event_leaderboard(uuid) TO authenticated;
