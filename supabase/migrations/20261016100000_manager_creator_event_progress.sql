drop policy if exists gx_event_progress_read_managed_creators on public.gx_event_mission_progress;
create policy gx_event_progress_read_managed_creators
on public.gx_event_mission_progress
for select to authenticated
using (
  exists (
    select 1
    from public.profiles creator
    join public.managers manager_row on manager_row.id = creator.manager_id
    join public.gx_event_participants ep
      on ep.user_id = creator.id
     and ep.event_id = gx_event_mission_progress.event_id
     and ep.status in ('registered','confirmed')
    where creator.id = gx_event_mission_progress.user_id
      and creator.role = 'creator'
      and creator.active is true
      and manager_row.user_id = auth.uid()
      and manager_row.active is true
  )
  or exists (
    select 1
    from public.profiles manager_profile
    join public.profiles creator
      on creator.role = 'creator'
     and creator.active is true
     and creator.team_id = manager_profile.team_id
    join public.gx_event_participants ep
      on ep.user_id = creator.id
     and ep.event_id = gx_event_mission_progress.event_id
     and ep.status in ('registered','confirmed')
    where manager_profile.id = auth.uid()
      and manager_profile.role = 'manager'
      and manager_profile.active is true
      and manager_profile.team_id is not null
      and creator.id = gx_event_mission_progress.user_id
  )
);
