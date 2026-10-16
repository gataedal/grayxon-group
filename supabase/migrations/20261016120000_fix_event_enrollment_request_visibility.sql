create or replace function public.gx_event_manager_enrollment_requests(p_event_id uuid)
returns table (
  id uuid,
  event_id uuid,
  creator_user_id uuid,
  manager_user_id uuid,
  status text,
  note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.event_id, r.creator_user_id, r.manager_user_id,
         r.status, r.note, r.reviewed_by, r.reviewed_at, r.created_at, r.updated_at
  from public.gx_event_enrollment_requests r
  where r.event_id = p_event_id
    and auth.uid() is not null
    and (r.manager_user_id = auth.uid() or public.is_admin())
  order by r.created_at desc;
$$;

revoke all on function public.gx_event_manager_enrollment_requests(uuid) from public, anon;
grant execute on function public.gx_event_manager_enrollment_requests(uuid) to authenticated;
