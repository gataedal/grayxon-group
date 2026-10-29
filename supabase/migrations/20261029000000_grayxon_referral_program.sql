-- Grayxon Group · Programa Gana más / referidos

create table if not exists public.gx_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  referred_tiktok_username text not null check (length(btrim(referred_tiktok_username)) between 2 and 80),
  referred_display_name text,
  referred_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  admin_note text,
  constraint gx_referrals_unique_referrer_username unique (referrer_user_id, referred_tiktok_username)
);
create unique index if not exists gx_referrals_unique_referred_username_ci on public.gx_referrals (lower(referred_tiktok_username));
create index if not exists gx_referrals_referrer_created_idx on public.gx_referrals (referrer_user_id, created_at desc);
create table if not exists public.gx_referral_commissions (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.gx_referrals(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  agency_net_amount numeric(14,2) not null default 0 check (agency_net_amount >= 0),
  commission_rate numeric(5,2) not null check (commission_rate >= 0 and commission_rate <= 100),
  commission_amount numeric(14,2) not null check (commission_amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  unique (referral_id, period_month)
);
create index if not exists gx_referral_commissions_period_idx on public.gx_referral_commissions (period_month desc, status);
alter table public.gx_referrals enable row level security;
alter table public.gx_referral_commissions enable row level security;
drop policy if exists gx_referrals_select_owner_or_admin on public.gx_referrals;
create policy gx_referrals_select_owner_or_admin on public.gx_referrals for select to authenticated using (referrer_user_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true));
drop policy if exists gx_referrals_insert_owner on public.gx_referrals;
create policy gx_referrals_insert_owner on public.gx_referrals for insert to authenticated with check (referrer_user_id = (select auth.uid()) and status = 'pending' and reviewed_at is null and reviewed_by is null and referred_user_id is null);
drop policy if exists gx_referrals_admin_update on public.gx_referrals;
create policy gx_referrals_admin_update on public.gx_referrals for update to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true)) with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true));
drop policy if exists gx_referrals_admin_delete on public.gx_referrals;
create policy gx_referrals_admin_delete on public.gx_referrals for delete to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true));
drop policy if exists gx_referral_commissions_owner_or_admin_select on public.gx_referral_commissions;
create policy gx_referral_commissions_owner_or_admin_select on public.gx_referral_commissions for select to authenticated using (exists (select 1 from public.gx_referrals r where r.id = referral_id and (r.referrer_user_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true))));
drop policy if exists gx_referral_commissions_admin_insert on public.gx_referral_commissions;
create policy gx_referral_commissions_admin_insert on public.gx_referral_commissions for insert to authenticated with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true));
drop policy if exists gx_referral_commissions_admin_update on public.gx_referral_commissions;
create policy gx_referral_commissions_admin_update on public.gx_referral_commissions for update to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true)) with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true));
drop policy if exists gx_referral_commissions_admin_delete on public.gx_referral_commissions;
create policy gx_referral_commissions_admin_delete on public.gx_referral_commissions for delete to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true));
grant select, insert, update, delete on public.gx_referrals to authenticated;
grant select, insert, update, delete on public.gx_referral_commissions to authenticated;
