-- Allow soft deletion of referrals while preserving their attribution and commission history.
-- Creators can still see the state of their own referral through the existing owner-select RLS policy.
alter table public.gx_referrals
  drop constraint if exists gx_referrals_status_check;

alter table public.gx_referrals
  add constraint gx_referrals_status_check
  check (status = any (array['pending'::text, 'approved'::text, 'rejected'::text, 'deleted'::text]));
