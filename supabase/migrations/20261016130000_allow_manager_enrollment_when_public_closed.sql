-- Managers can request creator enrollment even when public self-registration is closed.
-- When an admin removes a participant, retire any approved request so the manager can request again.
drop policy if exists gx_event_enrollment_requests_manager_insert on public.gx_event_enrollment_requests;
create policy gx_event_enrollment_requests_manager_insert
on public.gx_event_enrollment_requests
for insert
to authenticated
with check (
  manager_user_id = auth.uid()
  and exists (
    select 1
    from public.profiles m
    join public.managers mgr on mgr.user_id = m.id and mgr.active = true
    join public.profiles c on c.id = gx_event_enrollment_requests.creator_user_id
    where m.id = auth.uid()
      and m.role = 'manager'
      and m.active = true
      and c.role = 'creator'
      and c.active = true
      and (c.manager_id = mgr.id or (m.team_id is not null and c.team_id = m.team_id))
  )
  and exists (
    select 1 from public.gx_events e
    where e.id = gx_event_enrollment_requests.event_id
      and e.status in ('published','in_progress')
  )
  and public.gx_event_audience_matches(event_id, creator_user_id)
);

create or replace function public.gx_events_admin_set_participant(
  p_event_id uuid,
  p_user_id uuid,
  p_action text,
  p_tiktok_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_event public.gx_events%rowtype;
  v_profile public.profiles%rowtype;
  v_handle text;
  v_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Solo administración puede gestionar participantes.' using errcode='42501';
  end if;
  select * into v_event from public.gx_events where id=p_event_id;
  if not found then raise exception 'El evento no existe.' using errcode='P0002'; end if;
  select * into v_profile from public.profiles where id=p_user_id and active is true;
  if not found or v_profile.role not in ('creator','manager') then
    raise exception 'No se encontró un usuario activo elegible.' using errcode='P0002';
  end if;
  if v_event.battle_enabled and v_profile.role<>'creator' then
    raise exception 'Para un evento de batallas solo se admiten creadores.' using errcode='22023';
  end if;
  if not public.gx_event_audience_matches(p_event_id,p_user_id) then
    raise exception 'La cuenta no pertenece a la audiencia seleccionada del evento.' using errcode='42501';
  end if;
  v_handle:=nullif(regexp_replace(trim(coalesce(p_tiktok_username,v_profile.username,'')),'^@+',''),'');
  if v_handle is not null and v_handle !~ '^[A-Za-z0-9._]{2,24}$' then
    raise exception 'El usuario de TikTok del perfil no tiene un formato válido.' using errcode='22023';
  end if;
  if p_action='add' then
    insert into public.gx_event_participants(event_id,user_id,status,tiktok_username,registered_at)
    values(p_event_id,p_user_id,'registered',v_handle,now())
    on conflict(event_id,user_id) do update
      set status='registered',tiktok_username=coalesce(excluded.tiktok_username,gx_event_participants.tiktok_username)
    returning id into v_id;
    insert into public.gx_event_responses(event_id,user_id,response,tiktok_username,responded_at)
    values(p_event_id,p_user_id,'yes',v_handle,now())
    on conflict(event_id,user_id) do update
      set response='yes',tiktok_username=coalesce(excluded.tiktok_username,gx_event_responses.tiktok_username),responded_at=now();
  elsif p_action='remove' then
    update public.gx_event_participants
      set status='withdrawn'
      where event_id=p_event_id and user_id=p_user_id and status<>'disqualified'
      returning id into v_id;
    if v_id is null then raise exception 'El participante no está activo en este evento.' using errcode='P0002'; end if;
    update public.gx_event_enrollment_requests
      set status='cancelled', updated_at=now()
      where event_id=p_event_id and creator_user_id=p_user_id and status='approved';
  else
    raise exception 'Acción no válida.' using errcode='22023';
  end if;
  return jsonb_build_object('ok',true,'participant_id',v_id,'action',p_action);
end;
$function$;
