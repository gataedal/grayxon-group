-- Grayxon Group · Programas para ganar más
-- Adds an administrative catalog for creator incentive programs.
create table if not exists public.gx_earning_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  description text not null default '',
  program_type text not null default 'referrals' check (program_type in ('referrals','monthly_bonus','missions','events','other')),
  reward_type text not null default 'percentage' check (reward_type in ('percentage','fixed_amount','points','custom')),
  reward_value numeric(12,2) not null default 0 check (reward_value >= 0),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  requirements text not null default '',
  starts_on date,
  ends_on date,
  hero_image_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
alter table public.gx_referrals add column if not exists program_id uuid references public.gx_earning_programs(id) on delete set null;
create index if not exists gx_earning_programs_status_idx on public.gx_earning_programs(status, created_at desc);
create index if not exists gx_referrals_program_id_idx on public.gx_referrals(program_id);
alter table public.gx_earning_programs enable row level security;
drop policy if exists gx_earning_programs_read_authenticated on public.gx_earning_programs;
create policy gx_earning_programs_read_authenticated on public.gx_earning_programs for select to authenticated
using (status = 'active' or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists gx_earning_programs_admin_insert on public.gx_earning_programs;
create policy gx_earning_programs_admin_insert on public.gx_earning_programs for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists gx_earning_programs_admin_update on public.gx_earning_programs;
create policy gx_earning_programs_admin_update on public.gx_earning_programs for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists gx_earning_programs_admin_delete on public.gx_earning_programs;
create policy gx_earning_programs_admin_delete on public.gx_earning_programs for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
