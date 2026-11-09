-- Rollback exclusivo de Grayxon creator delivery approval flow.
-- Ejecutar solo si se decide retirar esta funcionalidad.

drop trigger if exists gx_tasks_notify_creator_delivery_review on public.gx_tasks;
drop trigger if exists gx_task_requests_validate_creator_scope on public.gx_task_requests;
drop policy if exists gx_creator_delivery_request_files_read on storage.objects;
drop policy if exists gx_creator_delivery_task_files_read on storage.objects;
drop policy if exists gx_creator_delivery_files_related_read on public.gx_creator_delivery_files;
drop policy if exists gx_creator_deliveries_related_read on public.gx_creator_deliveries;

drop function if exists public.gx_creator_delivery_review(uuid,boolean,text);
drop function if exists public.gx_notify_creator_delivery_review();
drop function if exists public.gx_validate_request_creator_scope();

drop table if exists public.gx_creator_delivery_files;
drop table if exists public.gx_creator_deliveries;

-- Restore the original request conversion function before removing its new columns.
create or replace function public.gx_task_convert_request(
  p_request_id uuid,
  p_assigned_to uuid,
  p_priority text default 'normal',
  p_starts_at timestamptz default null,
  p_due_at timestamptz default null
)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_request public.gx_task_requests%rowtype; v_task_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Solo administración puede convertir solicitudes en tareas.' using errcode = '42501';
  end if;
  select * into v_request from public.gx_task_requests where id=p_request_id for update;
  if not found then raise exception 'La solicitud no existe.' using errcode = 'P0002'; end if;
  if v_request.status not in ('pending','approved') then
    raise exception 'La solicitud ya fue resuelta.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.gx_internal_members where user_id=p_assigned_to and active is true) then
    raise exception 'Selecciona un integrante operativo activo.' using errcode = '22023';
  end if;
  insert into public.gx_tasks(title,description,priority,department_id,created_by,assigned_to,source_request_id,starts_at,due_at)
  values(v_request.title,v_request.description,p_priority,v_request.department_id,auth.uid(),p_assigned_to,v_request.id,p_starts_at,p_due_at)
  returning id into v_task_id;
  update public.gx_task_requests set status='converted',reviewed_by=auth.uid(),reviewed_at=now(),converted_task_id=v_task_id
  where id=v_request.id;
  return v_task_id;
end;
$$;
grant execute on function public.gx_task_convert_request(uuid,uuid,text,timestamptz,timestamptz) to authenticated;

revoke insert (creator_user_id) on public.gx_task_requests from authenticated;
alter table public.gx_task_requests drop column if exists creator_user_id;
alter table public.gx_tasks drop column if exists requester_id;
alter table public.gx_tasks drop column if exists creator_user_id;
drop index if exists public.gx_task_requests_creator_user_idx;
drop index if exists public.gx_tasks_requester_creator_idx;
