create index if not exists gx_creator_deliveries_task_idx on public.gx_creator_deliveries(task_id);
create index if not exists gx_creator_deliveries_request_idx on public.gx_creator_deliveries(request_id);
create index if not exists gx_creator_deliveries_requester_idx on public.gx_creator_deliveries(requester_id);
create index if not exists gx_creator_deliveries_assignee_idx on public.gx_creator_deliveries(assigned_to);

drop policy if exists gx_creator_deliveries_related_read on public.gx_creator_deliveries;
create policy gx_creator_deliveries_related_read on public.gx_creator_deliveries for select to authenticated
using (
  (select public.is_admin()) or requester_id=(select auth.uid()) or assigned_to=(select auth.uid())
  or (creator_user_id=(select auth.uid()) and published_at is not null
      and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='creator' and p.active is true))
);
drop policy if exists gx_creator_delivery_files_related_read on public.gx_creator_delivery_files;
create policy gx_creator_delivery_files_related_read on public.gx_creator_delivery_files for select to authenticated
using (exists(select 1 from public.gx_creator_deliveries d where d.id=delivery_id and (
  (select public.is_admin()) or d.requester_id=(select auth.uid()) or d.assigned_to=(select auth.uid())
  or (d.creator_user_id=(select auth.uid()) and d.published_at is not null)
)));
drop policy if exists gx_creator_delivery_request_files_read on storage.objects;
create policy gx_creator_delivery_request_files_read on storage.objects for select to authenticated
using (bucket_id='gx-internal-request-files' and exists(
  select 1 from public.gx_creator_delivery_files f join public.gx_creator_deliveries d on d.id=f.delivery_id
  where f.bucket_id=storage.objects.bucket_id and f.object_path=storage.objects.name
    and d.creator_user_id=(select auth.uid()) and d.published_at is not null
));
drop policy if exists gx_creator_delivery_task_files_read on storage.objects;
create policy gx_creator_delivery_task_files_read on storage.objects for select to authenticated
using (bucket_id='gx-internal-task-files' and exists(
  select 1 from public.gx_creator_delivery_files f join public.gx_creator_deliveries d on d.id=f.delivery_id
  where f.bucket_id=storage.objects.bucket_id and f.object_path=storage.objects.name
    and d.creator_user_id=(select auth.uid()) and d.published_at is not null
));