-- Roll back only the performance optimization while preserving the delivery feature.
drop index if exists public.gx_creator_deliveries_task_idx;
drop index if exists public.gx_creator_deliveries_request_idx;
drop index if exists public.gx_creator_deliveries_requester_idx;
drop index if exists public.gx_creator_deliveries_assignee_idx;

drop policy if exists gx_creator_deliveries_related_read on public.gx_creator_deliveries;
create policy gx_creator_deliveries_related_read on public.gx_creator_deliveries for select to authenticated
using (
  public.is_admin() or requester_id=auth.uid() or assigned_to=auth.uid()
  or (creator_user_id=auth.uid() and published_at is not null
      and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='creator' and p.active is true))
);
drop policy if exists gx_creator_delivery_files_related_read on public.gx_creator_delivery_files;
create policy gx_creator_delivery_files_related_read on public.gx_creator_delivery_files for select to authenticated
using (exists(select 1 from public.gx_creator_deliveries d where d.id=delivery_id and (
  public.is_admin() or d.requester_id=auth.uid() or d.assigned_to=auth.uid()
  or (d.creator_user_id=auth.uid() and d.published_at is not null)
)));
drop policy if exists gx_creator_delivery_request_files_read on storage.objects;
create policy gx_creator_delivery_request_files_read on storage.objects for select to authenticated
using (bucket_id='gx-internal-request-files' and exists(
  select 1 from public.gx_creator_delivery_files f join public.gx_creator_deliveries d on d.id=f.delivery_id
  where f.bucket_id=storage.objects.bucket_id and f.object_path=storage.objects.name
    and d.creator_user_id=auth.uid() and d.published_at is not null
));
drop policy if exists gx_creator_delivery_task_files_read on storage.objects;
create policy gx_creator_delivery_task_files_read on storage.objects for select to authenticated
using (bucket_id='gx-internal-task-files' and exists(
  select 1 from public.gx_creator_delivery_files f join public.gx_creator_deliveries d on d.id=f.delivery_id
  where f.bucket_id=storage.objects.bucket_id and f.object_path=storage.objects.name
    and d.creator_user_id=auth.uid() and d.published_at is not null
));