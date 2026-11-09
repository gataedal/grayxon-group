-- ROLLBACK EXCLUSIVO DE GRAYXON TRABAJO.
-- ADVERTENCIA: elimina todas las tareas, solicitudes, comentarios, evidencias y actividad
-- del módulo. Antes de ejecutarlo en un entorno con uso real, exporta esos datos y archivos.
-- No modifica perfiles, managers, creator_tasks, manager_tasks, calendario ni otras tablas.

begin;

drop policy if exists gx_internal_task_files_read on storage.objects;
drop policy if exists gx_internal_task_files_insert on storage.objects;
drop policy if exists gx_internal_task_files_delete on storage.objects;

delete from storage.objects where bucket_id = 'gx-internal-task-files';
delete from storage.buckets where id = 'gx-internal-task-files';

delete from public.notifications
where type in (
  'internal_task',
  'internal_task_review',
  'internal_task_update',
  'internal_request',
  'internal_request_update'
);

alter table if exists public.gx_tasks
  drop constraint if exists gx_tasks_source_request_fkey;
alter table if exists public.gx_task_requests
  drop constraint if exists gx_task_requests_converted_task_fkey;

drop table if exists public.gx_task_attachments;
drop table if exists public.gx_task_activity;
drop table if exists public.gx_task_comments;
drop table if exists public.gx_tasks;
drop table if exists public.gx_task_requests;
drop table if exists public.gx_internal_members;
drop table if exists public.gx_departments;

drop function if exists public.gx_task_convert_request(uuid,uuid,text,timestamptz,timestamptz);
drop function if exists public.gx_task_review(uuid,boolean,text);
drop function if exists public.gx_task_member_update(uuid,text,text);
drop function if exists public.gx_notify_task_requests();
drop function if exists public.gx_notify_task_changes();
drop function if exists public.gx_log_task_activity();
drop function if exists public.gx_log_task_comment_activity();
drop function if exists public.gx_log_task_attachment_activity();
drop function if exists public.gx_validate_task_assignment();
drop function if exists public.gx_set_updated_at();
drop function if exists public.gx_is_internal_member();

commit;
