-- Grayxon: activity presence for admin user management
-- Apply this migration in the Supabase SQL Editor before using the presence indicator.

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;

grant select, insert, update on public.user_presence to authenticated;

drop policy if exists "Users can manage own presence" on public.user_presence;
create policy "Users can manage own presence"
  on public.user_presence
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Admins can read all presence" on public.user_presence;
create policy "Admins can read all presence"
  on public.user_presence
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
