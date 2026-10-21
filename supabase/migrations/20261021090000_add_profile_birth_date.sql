-- Add an optional date of birth to the existing personal profile details.
-- Existing profile and payment data are left unchanged.
ALTER TABLE public.profile_details
  ADD COLUMN IF NOT EXISTS birth_date date;
