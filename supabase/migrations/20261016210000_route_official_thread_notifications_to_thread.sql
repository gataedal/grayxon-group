CREATE OR REPLACE FUNCTION public.gx_event_post_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE ev_title text;
BEGIN
  SELECT title INTO ev_title FROM public.gx_events WHERE id=NEW.event_id;
  INSERT INTO public.notifications(user_id,type,title,message,link_page,link_target)
  SELECT DISTINCT recipient.user_id, 'event', 'Nueva publicación en el Hilo oficial',
    left('Hay una nueva publicación en el Hilo oficial de "'||coalesce(ev_title,'un evento')||'": '||coalesce(NEW.body,''),180),
    'event-thread', NEW.event_id::text
  FROM (
    SELECT ep.user_id FROM public.gx_event_participants ep
      WHERE ep.event_id=NEW.event_id AND ep.status IN ('registered','confirmed')
    UNION
    SELECT p.id FROM public.profiles p WHERE p.role='manager' AND p.active=true
      AND EXISTS (SELECT 1 FROM public.profiles c WHERE c.role='creator' AND c.active=true
        AND (c.manager_id=p.id OR (p.team_id IS NOT NULL AND c.team_id=p.team_id))
        AND EXISTS (SELECT 1 FROM public.gx_event_participants ep WHERE ep.event_id=NEW.event_id AND ep.user_id=c.id AND ep.status IN ('registered','confirmed')))
    UNION
    SELECT p.id FROM public.profiles p WHERE p.role='admin' AND p.active=true
  ) recipient
  WHERE recipient.user_id<>NEW.user_id;
  RETURN NEW;
END;
$function$;