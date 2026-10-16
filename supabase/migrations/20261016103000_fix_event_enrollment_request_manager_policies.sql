drop policy if exists gx_event_enrollment_requests_manager_insert on public.gx_event_enrollment_requests;
create policy gx_event_enrollment_requests_manager_insert on public.gx_event_enrollment_requests
for insert to authenticated with check (
  manager_user_id = auth.uid()
  and exists (
    select 1
    from public.profiles m
    join public.managers mgr on mgr.user_id = m.id and mgr.active = true
    join public.profiles c on c.id = creator_user_id
    where m.id = auth.uid() and m.role = 'manager' and m.active = true
      and c.role = 'creator' and c.active = true
      and (c.manager_id = mgr.id or (m.team_id is not null and c.team_id = m.team_id))
  )
  and exists (
    select 1 from public.gx_events e
    where e.id = event_id and e.status in ('published','in_progress') and e.registration_open = true
  )
  and public.gx_event_audience_matches(event_id, creator_user_id)
);

drop policy if exists gx_event_enrollment_requests_manager_update_own on public.gx_event_enrollment_requests;
create policy gx_event_enrollment_requests_manager_update_own on public.gx_event_enrollment_requests
for update to authenticated
using (
  manager_user_id = auth.uid()
  and status in ('pending','rejected','cancelled')
)
with check (
  manager_user_id = auth.uid()
  and status in ('pending','cancelled')
  and exists (
    select 1
    from public.profiles m
    join public.managers mgr on mgr.user_id = m.id and mgr.active = true
    join public.profiles c on c.id = creator_user_id
    where m.id = auth.uid() and m.role = 'manager' and m.active = true
      and c.role = 'creator' and c.active = true
      and (c.manager_id = mgr.id or (m.team_id is not null and c.team_id = m.team_id))
  )
);
