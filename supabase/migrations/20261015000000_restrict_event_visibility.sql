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
