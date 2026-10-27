-- Admin-only attendance tracking for event battles.
-- This table is additive: it does not change existing match results or mission scores.
create table if not exists public.gx_event_match_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gx_events(id) on delete cascade,
  match_id uuid not null references public.gx_event_matches(id) on delete cascade,
  participant_id uuid not null references public.gx_event_participants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'attended', 'absent')),
  note text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, participant_id)
);

create index if not exists gx_event_match_attendance_event_user_idx
  on public.gx_event_match_attendance (event_id, user_id);
create index if not exists gx_event_match_attendance_match_idx
  on public.gx_event_match_attendance (match_id);

alter table public.gx_event_match_attendance enable row level security;

drop policy if exists gx_event_match_attendance_admin_select on public.gx_event_match_attendance;
create policy gx_event_match_attendance_admin_select
  on public.gx_event_match_attendance for select to authenticated
  using (public.is_admin());

drop policy if exists gx_event_match_attendance_admin_insert on public.gx_event_match_attendance;
create policy gx_event_match_attendance_admin_insert
  on public.gx_event_match_attendance for insert to authenticated
  with check (
    public.is_admin()
    and (recorded_by is null or recorded_by = auth.uid())
    and exists (
      select 1
      from public.gx_event_matches m
      join public.gx_event_participants ep
        on ep.id = gx_event_match_attendance.participant_id
      where m.id = gx_event_match_attendance.match_id
        and m.event_id = gx_event_match_attendance.event_id
        and ep.event_id = gx_event_match_attendance.event_id
        and ep.user_id = gx_event_match_attendance.user_id
        and gx_event_match_attendance.participant_id in (m.participant_a_id, m.participant_b_id)
    )
  );

drop policy if exists gx_event_match_attendance_admin_update on public.gx_event_match_attendance;
create policy gx_event_match_attendance_admin_update
  on public.gx_event_match_attendance for update to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    and (recorded_by is null or recorded_by = auth.uid())
    and exists (
      select 1
      from public.gx_event_matches m
      join public.gx_event_participants ep
        on ep.id = gx_event_match_attendance.participant_id
      where m.id = gx_event_match_attendance.match_id
        and m.event_id = gx_event_match_attendance.event_id
        and ep.event_id = gx_event_match_attendance.event_id
        and ep.user_id = gx_event_match_attendance.user_id
        and gx_event_match_attendance.participant_id in (m.participant_a_id, m.participant_b_id)
    )
  );

drop policy if exists gx_event_match_attendance_admin_delete on public.gx_event_match_attendance;
create policy gx_event_match_attendance_admin_delete
  on public.gx_event_match_attendance for delete to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.gx_event_match_attendance to authenticated;
