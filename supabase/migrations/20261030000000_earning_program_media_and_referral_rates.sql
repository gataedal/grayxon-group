-- Media and per-referral commission override for Gana más
alter table public.gx_earning_programs
  add column if not exists content_media_url text,
  add column if not exists content_media_type text,
  add column if not exists content_media_name text;
alter table public.gx_referrals
  add column if not exists commission_rate_override numeric(5,2)
  check (commission_rate_override is null or (commission_rate_override >= 0 and commission_rate_override <= 100));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gx-earning-program-media','gx-earning-program-media',true,104857600,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','application/pdf'])
on conflict (id) do update set public=true, file_size_limit=104857600, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists gx_earning_program_media_admin_insert on storage.objects;
create policy gx_earning_program_media_admin_insert on storage.objects for insert to authenticated with check (bucket_id='gx-earning-program-media' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.active=true));
drop policy if exists gx_earning_program_media_admin_update on storage.objects;
create policy gx_earning_program_media_admin_update on storage.objects for update to authenticated using (bucket_id='gx-earning-program-media' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.active=true)) with check (bucket_id='gx-earning-program-media' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.active=true));
drop policy if exists gx_earning_program_media_admin_delete on storage.objects;
create policy gx_earning_program_media_admin_delete on storage.objects for delete to authenticated using (bucket_id='gx-earning-program-media' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.active=true));
drop policy if exists gx_earning_program_media_public_read on storage.objects;
create policy gx_earning_program_media_public_read on storage.objects for select to public using (bucket_id='gx-earning-program-media');
-- Administrator inserts for referrals
DROP POLICY IF EXISTS gx_referrals_admin_insert ON public.gx_referrals;
CREATE POLICY gx_referrals_admin_insert ON public.gx_referrals FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='admin' AND p.active=true));
