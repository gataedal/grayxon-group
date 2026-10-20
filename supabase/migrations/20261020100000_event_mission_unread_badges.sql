-- Grayxon: unread event posts per event + unread regular missions for each creator.
-- Non-destructive: adds read receipts and narrowly scoped RPCs.
create table if not exists public.mission_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, mission_id)
);

alter table public.mission_reads enable row level security;

drop policy if exists "Users can read their own mission reads" on public.mission_reads;
create policy "Users can read their own mission reads"
  on public.mission_reads for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert their own mission reads" on public.mission_reads;
create policy "Users can insert their own mission reads"
  on public.mission_reads for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own mission reads" on public.mission_reads;
create policy "Users can update their own mission reads"
  on public.mission_reads for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.mission_reads to authenticated;

create or replace function public.gx_missions_unread_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(*)::integer
  from public.missions m
  where auth.uid() is not null
    and m.assigned_to = auth.uid()
    and m.published = true
    and not exists (
      select 1
      from public.mission_reads r
      where r.user_id = auth.uid()
        and r.mission_id = m.id
    );
$function$;

grant execute on function public.gx_missions_unread_count() to authenticated;

create or replace function public.gx_event_unread_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(*)::integer
  from public.gx_event_posts p
  join public.gx_events e on e.id = p.event_id
  where auth.uid() is not null
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
$function$;

grant execute on function public.gx_event_unread_count(uuid) to authenticated;
