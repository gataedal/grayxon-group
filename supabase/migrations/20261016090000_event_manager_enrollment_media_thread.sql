alter table public.gx_events
  add column if not exists description_video_url text,
  add column if not exists rules_video_url text;

create table if not exists public.gx_event_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gx_events(id) on delete cascade,
  creator_user_id uuid not null references public.profiles(id) on delete cascade,
  manager_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, creator_user_id)
);

alter table public.gx_event_enrollment_requests enable row level security;

drop policy if exists gx_event_enrollment_requests_read on public.gx_event_enrollment_requests;
create policy gx_event_enrollment_requests_read on public.gx_event_enrollment_requests
for select to authenticated using (
  public.is_admin() or manager_user_id = auth.uid() or creator_user_id = auth.uid()
);

drop policy if exists gx_event_enrollment_requests_manager_insert on public.gx_event_enrollment_requests;
create policy gx_event_enrollment_requests_manager_insert on public.gx_event_enrollment_requests
for insert to authenticated with check (
  manager_user_id = auth.uid()
  and exists (
    select 1 from public.profiles m join public.profiles c on c.id = creator_user_id
    where m.id = auth.uid() and m.role = 'manager' and m.active = true
      and c.role = 'creator' and c.active = true
      and (c.manager_id = m.id or (m.team_id is not null and c.team_id = m.team_id))
  )
  and exists (select 1 from public.gx_events e where e.id = event_id and e.status in ('published','in_progress') and e.registration_open = true)
);

drop policy if exists gx_event_enrollment_requests_manager_update on public.gx_event_enrollment_requests;
create policy gx_event_enrollment_requests_manager_update on public.gx_event_enrollment_requests
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists gx_event_enrollment_requests_manager_update_own on public.gx_event_enrollment_requests;
create policy gx_event_enrollment_requests_manager_update_own on public.gx_event_enrollment_requests
for update to authenticated using (
  manager_user_id = auth.uid() and status in ('pending','rejected','cancelled')
) with check (
  manager_user_id = auth.uid() and status = 'pending'
  and exists (
    select 1 from public.profiles m join public.profiles c on c.id = creator_user_id
    where m.id = auth.uid() and m.role='manager' and m.active=true
      and c.role='creator' and c.active=true
      and (c.manager_id=m.id or (m.team_id is not null and c.team_id=m.team_id))
  )
);

create or replace function public.gx_event_enrollment_request_notify()
returns trigger language plpgsql security definer set search_path = public
as $$
declare ev_title text;
begin
  select title into ev_title from public.gx_events where id = new.event_id;
  if tg_op = 'INSERT' then
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    values (new.manager_user_id,'event','Inscripción enviada para aprobación','La solicitud para inscribir a un creador en "'||coalesce(ev_title,'un evento')||'" está pendiente de revisión.','events',new.event_id::text);
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    select p.id,'event','Nueva solicitud de inscripción','Un manager solicitó inscribir a un creador en "'||coalesce(ev_title,'un evento')||'".','events',new.event_id::text
    from public.profiles p where p.role='admin' and p.active=true;
  elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    values (new.manager_user_id, 'event', case when new.status='approved' then 'Inscripción aprobada' else 'Inscripción rechazada' end,
      'La solicitud para "'||coalesce(ev_title,'el evento')||'" fue '||case when new.status='approved' then 'aprobada.' else 'rechazada.' end,'events',new.event_id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gx_event_enrollment_request_notify on public.gx_event_enrollment_requests;
create trigger trg_gx_event_enrollment_request_notify
after insert or update of status on public.gx_event_enrollment_requests
for each row execute function public.gx_event_enrollment_request_notify();

create or replace function public.gx_event_post_notify()
returns trigger language plpgsql security definer set search_path = public
as $$
declare ev_title text;
begin
  select title into ev_title from public.gx_events where id = new.event_id;
  insert into public.notifications(user_id,type,title,message,link_page,link_target)
  select distinct recipient.user_id, 'event', 'Novedad en un evento',
    left('Hay una nueva publicación en "'||coalesce(ev_title,'un evento')||'": '||coalesce(new.body,''),180),
    'events', new.event_id::text
  from (
    select ep.user_id from public.gx_event_participants ep
      where ep.event_id=new.event_id and ep.status in ('registered','confirmed')
    union
    select p.id from public.profiles p where p.role='manager' and p.active=true
      and exists (select 1 from public.profiles c where c.role='creator' and c.active=true
        and (c.manager_id=p.id or (p.team_id is not null and c.team_id=p.team_id))
        and exists (select 1 from public.gx_event_participants ep where ep.event_id=new.event_id and ep.user_id=c.id and ep.status in ('registered','confirmed')))
    union
    select p.id from public.profiles p where p.role='admin' and p.active=true
  ) recipient
  where recipient.user_id <> new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_gx_event_post_notify on public.gx_event_posts;
create trigger trg_gx_event_post_notify after insert on public.gx_event_posts
for each row execute function public.gx_event_post_notify();
