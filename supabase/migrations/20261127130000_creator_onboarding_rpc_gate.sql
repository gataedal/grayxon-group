-- SECURITY DEFINER RPCs must honor the creator onboarding gate too.
-- Direct table RLS is not sufficient for functions that execute with owner privileges.
DO $onboarding_rpc_gate$
BEGIN
  IF to_regprocedure('public.get_my_published_missions()') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.get_my_published_missions()
 RETURNS TABLE(id uuid, title text, description text, type text, target numeric, week_start date, week_end date, assigned_to uuid, published boolean, link_url text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        m.id,
        m.title,
        m.description,
        m.type,
        m.target,
        m.week_start,
        m.week_end,
        m.assigned_to,
        m.published,
        m.link_url,
        m.created_at
    FROM public.missions m
    WHERE m.published = true
      AND m.assigned_to = auth.uid()
      AND NOT public.gx_creator_onboarding_pending();
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.grayxon_announcement_visible(uuid)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.grayxon_announcement_visible(p_announcement_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role text; v_team uuid; v_target text; v_author uuid;
begin
  if public.gx_creator_onboarding_pending() then return false; end if;
  select role, team_id into v_role,v_team from public.profiles where id=auth.uid();
  if auth.uid() is null or v_role is null then return false; end if;
  if v_role='admin' then return true; end if;
  select target_type,author_id into v_target,v_author from public.announcements where id=p_announcement_id;
  if v_target is null then return false; end if;
  if v_author=auth.uid() then return true; end if;
  if v_target='agency' then return true; end if;
  if v_target='managers' then return v_role='manager'; end if;
  if v_target='teams' then
    if v_team is not null and exists(select 1 from public.announcement_teams at where at.announcement_id=p_announcement_id and at.team_id=v_team) then return true; end if;
    return exists(select 1 from public.announcement_teams at join public.teams t on t.id=at.team_id join public.managers m on m.id=t.manager_id where at.announcement_id=p_announcement_id and m.user_id=auth.uid());
  end if;
  return false;
end $function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.gx_create_own_push_test_notification()') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_create_own_push_test_notification()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_payment_id uuid;
  v_notification_id uuid;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para enviar una prueba.' using errcode = '28000';
  end if;
  if public.gx_creator_onboarding_pending() then
    raise exception 'Completa tus primeros pasos antes de usar esta función.' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  -- Administradores pueden consultar todos los pagos en Grayxon.
  -- Los demás perfiles solo prueban con un pago dirigido a su propia cuenta.
  if lower(coalesce(v_role, '')) = 'admin' then
    select p.id into v_payment_id
    from public.gx_payments p
    order by p.created_at desc nulls last, p.payment_date desc nulls last
    limit 1;
  else
    select p.id into v_payment_id
    from public.gx_payments p
    where p.recipient_user_id = v_user_id
    order by p.created_at desc nulls last, p.payment_date desc nulls last
    limit 1;
  end if;

  if v_payment_id is null then
    raise exception 'No encontramos un pago al que esta cuenta tenga acceso. Para probar el enlace directo, primero debe existir un pago dirigido a esta cuenta (o inicia la prueba con una cuenta administradora).'
      using errcode = 'P0002';
  end if;

  insert into public.notifications
    (user_id, type, title, message, link_page, link_target)
  values
    (v_user_id,
     'push_test',
     'Prueba de enlace a pago',
     'Esta prueba debe abrir directamente el detalle de tu pago más reciente disponible.',
     'payments',
     v_payment_id::text)
  returning id into v_notification_id;

  return v_notification_id;
end;
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.gx_event_can_view(uuid)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_event_can_view(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.gx_events e
    join public.profiles p on p.id = auth.uid()
    where e.id = p_event_id
      and not public.gx_creator_onboarding_pending()
      and p.active is true
      and (
        public.is_admin()
        or (
          e.status <> 'draft'
          and public.gx_event_audience_matches(e.id, p.id)
        )
      )
  );
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.gx_event_unread_count(uuid)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_event_unread_count(p_event_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer
  from public.gx_event_posts p
  join public.gx_events e on e.id = p.event_id
  where auth.uid() is not null
    and not public.gx_creator_onboarding_pending()
    and p.event_id = p_event_id
    and e.status in ('published','in_progress')
    and (e.ends_at is null or e.ends_at >= now())
    and public.gx_event_audience_matches(e.id, auth.uid())
    and p.user_id <> auth.uid()
    and not exists (
      select 1
      from public.gx_event_post_reads r
      where r.user_id = auth.uid()
        and r.post_id = p.id
    );
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.gx_events_latest_unread_post()') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_events_latest_unread_post()
 RETURNS TABLE(post_id uuid, event_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  if public.gx_creator_onboarding_pending() then return; end if;

  return query
  select p.id, p.event_id, p.created_at
  from public.gx_event_posts p
  join public.gx_events e on e.id = p.event_id
  where e.status in ('published','in_progress')
    and (e.ends_at is null or e.ends_at >= now())
    and public.gx_event_audience_matches(e.id, v_user)
    and p.user_id <> v_user
    and not exists (
      select 1 from public.gx_event_post_reads r
      where r.user_id = v_user and r.post_id = p.id
    )
  order by p.created_at desc
  limit 1;
end;
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.gx_events_unread_count()') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_events_unread_count()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then return 0; end if;
  if public.gx_creator_onboarding_pending() then return 0; end if;

  select count(*)::integer into v_count
  from public.gx_event_posts p
  join public.gx_events e on e.id = p.event_id
  where e.status in ('published','in_progress')
    and (e.ends_at is null or e.ends_at >= now())
    and public.gx_event_audience_matches(e.id, v_user)
    and p.user_id <> v_user
    and not exists (
      select 1 from public.gx_event_post_reads r
      where r.user_id = v_user and r.post_id = p.id
    );

  return coalesce(v_count, 0);
end;
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.gx_missions_unread_count()') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_missions_unread_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer
  from public.missions m
  where auth.uid() is not null
    and not public.gx_creator_onboarding_pending()
    and m.assigned_to = auth.uid()
    and m.published = true
    and not exists (
      select 1
      from public.mission_reads r
      where r.user_id = auth.uid()
        and r.mission_id = m.id
    );
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.gx_poll_results(uuid[])') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_poll_results(p_poll_ids uuid[])
 RETURNS TABLE(poll_id uuid, option_id uuid, vote_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select v.poll_id, v.option_id, count(*)::bigint
  from public.gx_poll_votes v
  join public.gx_polls q on q.id = v.poll_id
  where v.poll_id = any(coalesce(p_poll_ids, array[]::uuid[]))
    and not public.gx_creator_onboarding_pending()
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.active is true and p.role = 'admin')
      or q.author_id = auth.uid()
      or (
        public.gx_poll_visible(v.poll_id, auth.uid())
        and exists (
          select 1 from public.gx_poll_votes mine
          where mine.poll_id = v.poll_id and mine.user_id = auth.uid()
        )
      )
    )
  group by v.poll_id, v.option_id;
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.gx_poll_unread_count()') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_poll_unread_count()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer := 0;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING errcode = '42501';
  END IF;
  IF public.gx_creator_onboarding_pending() THEN RETURN 0; END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.active IS TRUE;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Perfil inactivo o inexistente.' USING errcode = '42501';
  END IF;

  -- El administrador gestiona encuestas pero no forma parte de la audiencia lectora.
  IF v_role = 'admin' THEN RETURN 0; END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.gx_polls p
  WHERE p.author_id <> auth.uid()
    AND public.gx_poll_visible(p.id, auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.gx_poll_views pv
      WHERE pv.poll_id = p.id AND pv.user_id = auth.uid()
    );

  RETURN COALESCE(v_count, 0);
END;
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.gx_poll_visible(uuid,uuid)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_poll_visible(p_poll_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_role text;
    v_active boolean;
    v_team uuid;
    v_target text;
    v_author uuid;
BEGIN
    IF public.gx_creator_onboarding_pending() THEN RETURN false; END IF;
    -- No permitir suplantar la identidad de otro usuario.
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
        RETURN false;
    END IF;

    SELECT role, active, team_id
    INTO v_role, v_active, v_team
    FROM public.profiles
    WHERE id = auth.uid();

    IF NOT FOUND
       OR v_active IS DISTINCT FROM true
       OR v_role = 'admin' THEN
        RETURN false;
    END IF;

    SELECT target_type, author_id
    INTO v_target, v_author
    FROM public.gx_polls
    WHERE id = p_poll_id;

    IF NOT FOUND THEN RETURN false; END IF;
    IF v_author = auth.uid() THEN RETURN true; END IF;
    IF v_target = 'agency' THEN RETURN true; END IF;
    IF v_target = 'managers' THEN
        RETURN v_role = 'manager';
    END IF;

    IF v_target = 'teams' THEN
        IF v_team IS NOT NULL AND EXISTS (
            SELECT 1
            FROM public.gx_poll_teams pt
            WHERE pt.poll_id = p_poll_id
              AND pt.team_id = v_team
        ) THEN
            RETURN true;
        END IF;

        RETURN EXISTS (
            SELECT 1
            FROM public.gx_poll_teams pt
            JOIN public.teams t ON t.id = pt.team_id
            JOIN public.managers m ON m.id = t.manager_id
            WHERE pt.poll_id = p_poll_id
              AND m.user_id = auth.uid()
              AND m.active IS TRUE
        );
    END IF;

    RETURN false;
END;
$function$
    $ddl$;
  END IF;


  IF to_regprocedure('public.gx_events_respond(uuid,text,text)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_events_respond(p_event_id uuid, p_response text, p_tiktok_username text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_user uuid:=auth.uid(); v_role text; v_profile_username text; v_event public.gx_events%rowtype; v_handle text; v_participant_id uuid;
begin
  if v_user is null then raise exception 'Debes iniciar sesión.' using errcode='28000'; end if;
  if public.gx_creator_onboarding_pending() then raise exception 'Completa tus primeros pasos antes de participar en eventos.' using errcode='42501'; end if;
  if p_response not in ('yes','no') then raise exception 'Respuesta no válida.' using errcode='22023'; end if;
  select * into v_event from public.gx_events where id=p_event_id;
  if not found then raise exception 'El evento no existe.' using errcode='P0002'; end if;
  select role,username into v_role,v_profile_username from public.profiles where id=v_user and active is true;
  if v_role is null or v_role not in ('creator','manager') then raise exception 'Tu cuenta no está habilitada para participar.' using errcode='42501'; end if;
  if v_event.status not in ('published','in_progress') or not v_event.registration_open then raise exception 'Las inscripciones de este evento están cerradas.' using errcode='22023'; end if;
  if v_event.ends_at is not null and v_event.ends_at<now() then raise exception 'El evento ya finalizó.' using errcode='22023'; end if;
  if not public.gx_event_audience_matches(p_event_id,v_user) then raise exception 'Este evento no está dirigido a tu cuenta.' using errcode='42501'; end if;
  if v_event.battle_enabled and v_role<>'creator' then raise exception 'Las batallas de este evento son para creadores.' using errcode='42501'; end if;
  v_handle:=nullif(regexp_replace(trim(coalesce(p_tiktok_username,v_profile_username,'')),'^@+',''),'');
  if v_handle is not null and v_handle !~ '^[A-Za-z0-9._]{2,24}$' then raise exception 'El usuario de tu perfil no tiene un formato de TikTok válido. Corrígelo en tu perfil de Grayxon.' using errcode='22023'; end if;
  insert into public.gx_event_responses(event_id,user_id,response,tiktok_username,responded_at)
  values(p_event_id,v_user,p_response,v_handle,now())
  on conflict(event_id,user_id) do update set response=excluded.response,tiktok_username=coalesce(excluded.tiktok_username,gx_event_responses.tiktok_username),responded_at=now();
  if p_response='yes' then
    insert into public.gx_event_participants(event_id,user_id,status,tiktok_username,registered_at)
    values(p_event_id,v_user,'registered',v_handle,now())
    on conflict(event_id,user_id) do update set status=case when gx_event_participants.status='withdrawn' then 'registered' else gx_event_participants.status end,tiktok_username=coalesce(excluded.tiktok_username,gx_event_participants.tiktok_username)
    returning id into v_participant_id;
  else
    update public.gx_event_participants set status='withdrawn',tiktok_username=coalesce(v_handle,tiktok_username) where event_id=p_event_id and user_id=v_user and status in ('registered','confirmed');
  end if;
  return jsonb_build_object('event_id',p_event_id,'response',p_response,'participant_id',v_participant_id,'tiktok_username',v_handle);
end;
$function$
    $ddl$;
  END IF;
  IF to_regprocedure('public.can_view_live_training(uuid)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.can_view_live_training(p_training_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  current_role text;
  training_creator uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    return false;
  end if;

  if public.gx_creator_onboarding_pending() then
    return false;
  end if;

  select
    p.role
  into
    current_role
  from public.profiles p
  where p.id = current_user_id
    and p.active = true
  limit 1;

  if current_role is null then
    return false;
  end if;

  -- ADMIN: puede ver cualquier entrenamiento
  if current_role = 'admin' then
    return exists (
      select 1
      from public.live_trainings t
      where t.id = p_training_id
    );
  end if;

  -- Obtener creador del entrenamiento
  select t.created_by
  into training_creator
  from public.live_trainings t
  where t.id = p_training_id;

  if training_creator is null then
    return false;
  end if;

  -- MANAGER:
  -- Puede ver sus propios entrenamientos.
  if current_role = 'manager' then

    if training_creator = current_user_id then
      return true;
    end if;

    -- También puede entrar si el entrenamiento está dirigido
    -- a todos los managers.
    if exists (
      select 1
      from public.live_trainings t
      join public.live_training_audience a
        on a.training_id = t.id
      where t.id = p_training_id
        and t.status = 'live'
        and a.target_type = 'all_managers'
    ) then
      return true;
    end if;

    -- O si está dirigido específicamente a este manager.
    if exists (
      select 1
      from public.managers m
      join public.live_training_audience a
        on a.target_type = 'manager'
       and a.target_id = m.id
      where m.user_id = current_user_id
        and m.active = true
        and a.training_id = p_training_id
    ) then
      return true;
    end if;

    return false;
  end if;

  -- CREATOR:
  -- Solo puede ver entrenamientos EN VIVO
  -- para los cuales está autorizado.
  if current_role = 'creator' then

    return exists (
      select 1
      from public.live_trainings t
      join public.live_training_audience a
        on a.training_id = t.id
      join public.profiles p
        on p.id = current_user_id
       and p.active = true
       and p.role = 'creator'
      where t.id = p_training_id
        and t.status = 'live'
        and (
          -- Creador específico
          (
            a.target_type = 'creator'
            and a.target_id = p.id
          )

          -- Equipo del creador
          or (
            a.target_type = 'team'
            and a.target_id = p.team_id
          )

          -- Manager del creador
          or (
            a.target_type = 'manager'
            and a.target_id = p.manager_id
          )

          -- Todos los creadores
          or a.target_type = 'all_creators'
        )
    );

  end if;

  return false;
end;
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.creator_can_view_live_training(uuid)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.creator_can_view_live_training(p_training_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  creator_profile public.profiles%rowtype;
begin
  if uid is null then
    return false;
  end if;

  if public.gx_creator_onboarding_pending() then
    return false;
  end if;

  select * into creator_profile
  from public.profiles
  where id = uid
    and role = 'creator'
    and active = true
  limit 1;

  if not found then
    return false;
  end if;

  return exists (
    select 1
    from public.live_trainings t
    join public.live_training_audience a
      on a.training_id = t.id
    where t.id = p_training_id
      and t.status in ('scheduled','live','finished')
      and (
        (a.target_type = 'creator' and a.target_id = creator_profile.id)
        or (a.target_type = 'team' and a.target_id = creator_profile.team_id)
        or (a.target_type = 'manager' and a.target_id = creator_profile.manager_id)
        or a.target_type = 'all_creators'
      )
  );
end;
$function$
    $ddl$;
  END IF;



  IF to_regprocedure('public.complete_creator_task(uuid)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.complete_creator_task(p_task_id uuid)
 RETURNS creator_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  row public.creator_tasks;
begin
  if public.gx_creator_onboarding_pending() then
    raise exception 'Completa tus primeros pasos antes de acceder a las tareas.' using errcode='42501';
  end if;

  update public.creator_tasks
  set completed = true,
      completed_at = coalesce(completed_at, now())
  where id = p_task_id
    and creator_id = auth.uid()
    and completed = false
  returning * into row;

  if row.id is null then
    raise exception 'Tarea no encontrada, ya completada o sin autorización';
  end if;

  return row;
end;
$function$
    $ddl$;
  END IF;


  IF to_regprocedure('public.gx_announcement_author_profiles(uuid[])') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_announcement_author_profiles(p_author_ids uuid[])
 RETURNS TABLE(author_id uuid, full_name text, username text, avatar_url text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private', 'auth'
AS $function$
  select author_id, full_name, username, avatar_url
  from private.gx_announcement_author_profiles(p_author_ids)
  where not public.gx_creator_onboarding_pending();
$function$
    $ddl$;
  END IF;
END;
$onboarding_rpc_gate$;
 then raise exception 'El usuario de tu perfil no tiene un formato de TikTok válido. Corrígelo en tu perfil de Grayxon.' using errcode='22023'; end if;
  insert into public.gx_event_responses(event_id,user_id,response,tiktok_username,responded_at)
  values(p_event_id,v_user,p_response,v_handle,now())
  on conflict(event_id,user_id) do update set response=excluded.response,tiktok_username=coalesce(excluded.tiktok_username,gx_event_responses.tiktok_username),responded_at=now();
  if p_response='yes' then
    insert into public.gx_event_participants(event_id,user_id,status,tiktok_username,registered_at)
    values(p_event_id,v_user,'registered',v_handle,now())
    on conflict(event_id,user_id) do update set status=case when gx_event_participants.status='withdrawn' then 'registered' else gx_event_participants.status end,tiktok_username=coalesce(excluded.tiktok_username,gx_event_participants.tiktok_username)
    returning id into v_participant_id;
  else
    update public.gx_event_participants set status='withdrawn',tiktok_username=coalesce(v_handle,tiktok_username) where event_id=p_event_id and user_id=v_user and status in ('registered','confirmed');
  end if;
  return jsonb_build_object('event_id',p_event_id,'response',p_response,'participant_id',v_participant_id,'tiktok_username',v_handle);
end;
$function$
    $ddl$;
  END IF;
  IF to_regprocedure('public.can_view_live_training(uuid)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.can_view_live_training(p_training_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  current_role text;
  training_creator uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    return false;
  end if;

  if public.gx_creator_onboarding_pending() then
    return false;
  end if;

  select
    p.role
  into
    current_role
  from public.profiles p
  where p.id = current_user_id
    and p.active = true
  limit 1;

  if current_role is null then
    return false;
  end if;

  -- ADMIN: puede ver cualquier entrenamiento
  if current_role = 'admin' then
    return exists (
      select 1
      from public.live_trainings t
      where t.id = p_training_id
    );
  end if;

  -- Obtener creador del entrenamiento
  select t.created_by
  into training_creator
  from public.live_trainings t
  where t.id = p_training_id;

  if training_creator is null then
    return false;
  end if;

  -- MANAGER:
  -- Puede ver sus propios entrenamientos.
  if current_role = 'manager' then

    if training_creator = current_user_id then
      return true;
    end if;

    -- También puede entrar si el entrenamiento está dirigido
    -- a todos los managers.
    if exists (
      select 1
      from public.live_trainings t
      join public.live_training_audience a
        on a.training_id = t.id
      where t.id = p_training_id
        and t.status = 'live'
        and a.target_type = 'all_managers'
    ) then
      return true;
    end if;

    -- O si está dirigido específicamente a este manager.
    if exists (
      select 1
      from public.managers m
      join public.live_training_audience a
        on a.target_type = 'manager'
       and a.target_id = m.id
      where m.user_id = current_user_id
        and m.active = true
        and a.training_id = p_training_id
    ) then
      return true;
    end if;

    return false;
  end if;

  -- CREATOR:
  -- Solo puede ver entrenamientos EN VIVO
  -- para los cuales está autorizado.
  if current_role = 'creator' then

    return exists (
      select 1
      from public.live_trainings t
      join public.live_training_audience a
        on a.training_id = t.id
      join public.profiles p
        on p.id = current_user_id
       and p.active = true
       and p.role = 'creator'
      where t.id = p_training_id
        and t.status = 'live'
        and (
          -- Creador específico
          (
            a.target_type = 'creator'
            and a.target_id = p.id
          )

          -- Equipo del creador
          or (
            a.target_type = 'team'
            and a.target_id = p.team_id
          )

          -- Manager del creador
          or (
            a.target_type = 'manager'
            and a.target_id = p.manager_id
          )

          -- Todos los creadores
          or a.target_type = 'all_creators'
        )
    );

  end if;

  return false;
end;
$function$
    $ddl$;
  END IF;

  IF to_regprocedure('public.creator_can_view_live_training(uuid)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.creator_can_view_live_training(p_training_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  creator_profile public.profiles%rowtype;
begin
  if uid is null then
    return false;
  end if;

  if public.gx_creator_onboarding_pending() then
    return false;
  end if;

  select * into creator_profile
  from public.profiles
  where id = uid
    and role = 'creator'
    and active = true
  limit 1;

  if not found then
    return false;
  end if;

  return exists (
    select 1
    from public.live_trainings t
    join public.live_training_audience a
      on a.training_id = t.id
    where t.id = p_training_id
      and t.status in ('scheduled','live','finished')
      and (
        (a.target_type = 'creator' and a.target_id = creator_profile.id)
        or (a.target_type = 'team' and a.target_id = creator_profile.team_id)
        or (a.target_type = 'manager' and a.target_id = creator_profile.manager_id)
        or a.target_type = 'all_creators'
      )
  );
end;
$function$
    $ddl$;
  END IF;



  IF to_regprocedure('public.complete_creator_task(uuid)') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.complete_creator_task(p_task_id uuid)
 RETURNS creator_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  row public.creator_tasks;
begin
  if public.gx_creator_onboarding_pending() then
    raise exception 'Completa tus primeros pasos antes de acceder a las tareas.' using errcode='42501';
  end if;

  update public.creator_tasks
  set completed = true,
      completed_at = coalesce(completed_at, now())
  where id = p_task_id
    and creator_id = auth.uid()
    and completed = false
  returning * into row;

  if row.id is null then
    raise exception 'Tarea no encontrada, ya completada o sin autorización';
  end if;

  return row;
end;
$function$
    $ddl$;
  END IF;


  IF to_regprocedure('public.gx_announcement_author_profiles(uuid[])') IS NOT NULL THEN
    EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.gx_announcement_author_profiles(p_author_ids uuid[])
 RETURNS TABLE(author_id uuid, full_name text, username text, avatar_url text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private', 'auth'
AS $function$
  select author_id, full_name, username, avatar_url
  from private.gx_announcement_author_profiles(p_author_ids)
  where not public.gx_creator_onboarding_pending();
$function$
    $ddl$;
  END IF;
END;
$onboarding_rpc_gate$;
