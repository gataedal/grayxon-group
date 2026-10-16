create or replace function public.gx_event_admin_review_enrollment(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.gx_event_enrollment_requests%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Solo administración puede revisar solicitudes.' using errcode = '42501';
  end if;

  if p_status not in ('approved','rejected') then
    raise exception 'Estado de revisión no válido.' using errcode = '22023';
  end if;

  select * into v_request
  from public.gx_event_enrollment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Esta solicitud ya fue revisada.' using errcode = '22023';
  end if;

  if p_status = 'approved' then
    v_result := public.gx_events_admin_set_participant(
      v_request.event_id, v_request.creator_user_id, 'add', null
    );
  else
    v_result := jsonb_build_object('ok', true, 'action', 'reject');
  end if;

  update public.gx_event_enrollment_requests
  set status = p_status,
      note = case when p_status = 'rejected' then nullif(trim(coalesce(p_note,'')),'') else note end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'status', p_status,
    'participant_result', v_result
  );
end;
$$;

revoke all on function public.gx_event_admin_review_enrollment(uuid, text, text) from public, anon;
grant execute on function public.gx_event_admin_review_enrollment(uuid, text, text) to authenticated;
