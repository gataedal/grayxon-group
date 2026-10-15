-- Restrict tournament participant and match visibility to admins, a user's own
-- assigned battles, and managers of creators involved in those battles.
-- Applied to Supabase project vxyakhelhuikutepdjyn on 2026-10-15.

CREATE OR REPLACE FUNCTION public.gx_event_participant_visible(p_participant_id uuid, p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.gx_event_participants target
    WHERE target.id = p_participant_id
      AND target.event_id = p_event_id
      AND (
        target.user_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.profiles managed
          JOIN public.managers m ON m.id = managed.manager_id
          WHERE managed.id = target.user_id
            AND m.user_id = auth.uid()
            AND m.active IS TRUE
        )
        OR EXISTS (
          SELECT 1
          FROM public.gx_event_matches gm
          JOIN public.gx_event_participants ownp
            ON ownp.id = gm.participant_a_id OR ownp.id = gm.participant_b_id
          WHERE gm.event_id = target.event_id
            AND (gm.participant_a_id = target.id OR gm.participant_b_id = target.id)
            AND ownp.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.gx_event_matches gm
          JOIN public.gx_event_participants managedp
            ON managedp.id = gm.participant_a_id OR managedp.id = gm.participant_b_id
          JOIN public.profiles managedprofile ON managedprofile.id = managedp.user_id
          JOIN public.managers m ON m.id = managedprofile.manager_id
          WHERE gm.event_id = target.event_id
            AND (gm.participant_a_id = target.id OR gm.participant_b_id = target.id)
            AND m.user_id = auth.uid()
            AND m.active IS TRUE
        )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.gx_event_match_visible(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.gx_event_matches gm
    JOIN public.gx_event_participants pa ON pa.id = gm.participant_a_id
    LEFT JOIN public.gx_event_participants pb ON pb.id = gm.participant_b_id
    WHERE gm.id = p_match_id
      AND (
        public.is_admin()
        OR pa.user_id = auth.uid()
        OR pb.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.managers m ON m.id = p.manager_id
          WHERE p.id IN (pa.user_id, pb.user_id)
            AND m.user_id = auth.uid()
            AND m.active IS TRUE
        )
      )
  );
$function$;

DROP POLICY IF EXISTS gx_event_participants_visible_in_event ON public.gx_event_participants;
DROP POLICY IF EXISTS gx_event_participants_visible_to_related_users ON public.gx_event_participants;
CREATE POLICY gx_event_participants_visible_to_related_users
ON public.gx_event_participants
FOR SELECT TO authenticated
USING (public.gx_event_participant_visible(id, event_id));

DROP POLICY IF EXISTS gx_event_matches_view ON public.gx_event_matches;
DROP POLICY IF EXISTS gx_event_matches_related_users ON public.gx_event_matches;
CREATE POLICY gx_event_matches_related_users
ON public.gx_event_matches
FOR SELECT TO authenticated
USING (public.gx_event_match_visible(id));


-- Preserve the global rank calculation, but expose only the caller's own row
-- to non-admins. Admins retain the complete leaderboard.
CREATE OR REPLACE FUNCTION public.gx_event_leaderboard(p_event_id uuid)
RETURNS TABLE(
  participant_id uuid,
  user_id uuid,
  username text,
  tiktok_username text,
  points numeric,
  approved_missions integer,
  battles_played integer,
  wins integer,
  rank_position bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.gx_event_can_view(p_event_id) THEN
    RAISE EXCEPTION 'No tienes acceso al ranking de este evento.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH roster AS (
    SELECT ep.id,ep.user_id,
      COALESCE(NULLIF(p.username,''),NULLIF(p.full_name,''),'usuario') AS uname,
      COALESCE(NULLIF(ep.tiktok_username,''),NULLIF(p.tiktok_username,''),NULLIF(p.username,'')) AS tiktok_username
    FROM public.gx_event_participants ep
    JOIN public.profiles p ON p.id=ep.user_id
    WHERE ep.event_id=p_event_id AND ep.status IN ('registered','confirmed')
  ), mission_scores AS (
    SELECT mp.user_id,
      COALESCE(SUM((CASE WHEN m.score_over_target THEN mp.value ELSE LEAST(mp.value,m.target_value) END)*m.points_per_unit + CASE WHEN mp.value>=m.target_value THEN m.completion_bonus ELSE 0 END),0)::numeric AS pts,
      COUNT(*) FILTER(WHERE mp.value>=m.target_value)::integer AS done
    FROM public.gx_event_mission_progress mp
    JOIN public.gx_event_missions m ON m.id=mp.mission_id AND m.event_id=mp.event_id
    WHERE mp.event_id=p_event_id AND mp.status='approved' AND m.is_active=true
    GROUP BY mp.user_id
  ), battle_rows AS (
    SELECT ep.user_id,m.id,m.status,m.winner_participant_id,m.event_id,
      (m.status='completed' AND m.winner_participant_id=ep.id) AS won,
      (m.status='completed' AND m.winner_participant_id IS NULL) AS drawn,
      (m.status='completed' AND m.participant_b_id IS NOT NULL) AS played
    FROM public.gx_event_matches m
    JOIN public.gx_event_participants ep ON ep.id=m.participant_a_id
    WHERE m.event_id=p_event_id
    UNION ALL
    SELECT ep.user_id,m.id,m.status,m.winner_participant_id,m.event_id,
      (m.status='completed' AND m.winner_participant_id=ep.id) AS won,
      (m.status='completed' AND m.winner_participant_id IS NULL) AS drawn,
      (m.status='completed' AND m.participant_b_id IS NOT NULL) AS played
    FROM public.gx_event_matches m
    JOIN public.gx_event_participants ep ON ep.id=m.participant_b_id
    WHERE m.event_id=p_event_id AND m.participant_b_id IS NOT NULL
  ), battle_scores AS (
    SELECT br.user_id,
      COALESCE(SUM(CASE WHEN br.played THEN e.battle_participation_points+CASE WHEN br.won THEN e.battle_win_points WHEN br.drawn THEN e.battle_draw_points ELSE 0 END ELSE 0 END),0)::numeric AS pts,
      COUNT(*) FILTER(WHERE br.played)::integer AS played,
      COUNT(*) FILTER(WHERE br.won)::integer AS wins
    FROM battle_rows br JOIN public.gx_events e ON e.id=br.event_id
    GROUP BY br.user_id
  ), scores AS (
    SELECT r.id,r.user_id,r.uname,r.tiktok_username,
      (COALESCE(ms.pts,0)+COALESCE(bs.pts,0))::numeric AS total,
      COALESCE(ms.done,0)::integer AS done,
      COALESCE(bs.played,0)::integer AS played,
      COALESCE(bs.wins,0)::integer AS wins
    FROM roster r
    LEFT JOIN mission_scores ms ON ms.user_id=r.user_id
    LEFT JOIN battle_scores bs ON bs.user_id=r.user_id
  ), ranked AS (
    SELECT s.id,s.user_id,s.uname,s.tiktok_username,s.total,s.done,s.played,s.wins,
      ROW_NUMBER() OVER(ORDER BY s.total DESC,s.uname ASC)::bigint AS position
    FROM scores s
  )
  SELECT r.id,r.user_id,r.uname,r.tiktok_username,r.total,r.done,r.played,r.wins,r.position
  FROM ranked r
  WHERE public.is_admin() OR r.user_id=auth.uid()
  ORDER BY r.position;
END;
$function$;
