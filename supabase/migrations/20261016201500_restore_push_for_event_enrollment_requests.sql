CREATE OR REPLACE FUNCTION public.gx_event_enrollment_request_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ev_title text;
  is_new_pending boolean := false;
BEGIN
  SELECT title INTO ev_title FROM public.gx_events WHERE id=NEW.event_id;

  IF TG_OP='INSERT' THEN
    is_new_pending := NEW.status='pending';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    is_new_pending := NEW.status='pending';
  END IF;

  IF is_new_pending THEN
    INSERT INTO public.notifications(user_id,type,title,message,link_page,link_target)
    VALUES (
      NEW.manager_user_id,'event','Solicitud enviada para aprobación',
      'Tu solicitud para inscribir a un creador en "'||coalesce(ev_title,'un evento')||'" está pendiente de revisión.',
      'events',NEW.event_id::text
    );

    INSERT INTO public.notifications(user_id,type,title,message,link_page,link_target)
    SELECT p.id,'event','Nueva solicitud de inscripción',
      'Un manager solicitó inscribir a un creador en "'||coalesce(ev_title,'un evento')||'". Entra para revisar y aprobar o rechazar la solicitud.',
      'events',NEW.event_id::text
    FROM public.profiles p
    WHERE p.role='admin' AND p.active=true;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.notifications(user_id,type,title,message,link_page,link_target)
    VALUES (
      NEW.manager_user_id,'event',
      CASE WHEN NEW.status='approved' THEN 'Inscripción aprobada' ELSE 'Inscripción rechazada' END,
      'La solicitud para "'||coalesce(ev_title,'el evento')||'" fue '||
      CASE WHEN NEW.status='approved' THEN 'aprobada.' ELSE 'rechazada.' END,
      'events',NEW.event_id::text
    );
  END IF;
  RETURN NEW;
END;
$function$;