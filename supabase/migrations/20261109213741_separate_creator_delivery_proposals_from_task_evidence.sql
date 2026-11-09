-- Keep final deliverable files separate from internal chat/evidence attachments.
create table if not exists public.gx_creator_delivery_proposal_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gx_tasks(id) on delete cascade,
  uploaded_by uuid not null references public.gx_internal_members(user_id) on delete restrict,
  object_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  unique(task_id,object_path)
);
create index if not exists gx_creator_delivery_proposal_files_task_idx
  on public.gx_creator_delivery_proposal_files(task_id,created_at desc);
alter table public.gx_creator_delivery_proposal_files enable row level security;
drop policy if exists gx_creator_delivery_proposal_files_related_read on public.gx_creator_delivery_proposal_files;
create policy gx_creator_delivery_proposal_files_related_read
on public.gx_creator_delivery_proposal_files for select to authenticated
using ((select public.is_admin()) or exists(
  select 1 from public.gx_tasks t where t.id=task_id
  and (t.assigned_to=(select auth.uid()) or t.requester_id=(select auth.uid()))
));
drop policy if exists gx_creator_delivery_proposal_files_assignee_insert on public.gx_creator_delivery_proposal_files;
create policy gx_creator_delivery_proposal_files_assignee_insert
on public.gx_creator_delivery_proposal_files for insert to authenticated
with check (
  uploaded_by=(select auth.uid())
  and exists(select 1 from public.gx_tasks t where t.id=task_id and t.assigned_to=(select auth.uid()) and t.creator_user_id is not null)
  and (select public.gx_is_internal_member())
);
grant select,insert on public.gx_creator_delivery_proposal_files to authenticated;

create or replace function public.gx_creator_delivery_review(p_task_id uuid,p_approved boolean,p_feedback text default null)
returns uuid language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_task public.gx_tasks%rowtype; v_delivery_id uuid; v_version integer; v_file_count integer;
begin
  if auth.uid() is null or not public.gx_is_internal_member() then
    raise exception 'No tienes acceso a Grayxon Trabajo.' using errcode='42501';
  end if;
  if p_approved is null then raise exception 'Indica si apruebas la propuesta.' using errcode='22023'; end if;
  if p_approved is false and nullif(btrim(coalesce(p_feedback,'')),'') is null then
    raise exception 'Escribe qué debe corregirse antes de devolver la propuesta.' using errcode='22023';
  end if;
  select * into v_task from public.gx_tasks where id=p_task_id for update;
  if not found or v_task.requester_id is distinct from auth.uid() or v_task.creator_user_id is null then
    raise exception 'Solo quien solicitó este contenido puede revisarlo.' using errcode='42501';
  end if;
  if v_task.status<>'submitted' then raise exception 'La propuesta debe estar entregada para revisión.' using errcode='22023'; end if;
  if not p_approved then
    update public.gx_tasks set status='in_progress',reviewed_by=auth.uid(),reviewed_at=now(),completed_at=null,
      review_note=nullif(btrim(coalesce(p_feedback,'')),'') where id=p_task_id;
    insert into public.gx_task_comments(task_id,author_id,body)
    values(p_task_id,auth.uid(),'Correcciones solicitadas: '||btrim(p_feedback));
    return null;
  end if;
  select coalesce(max(version),0)+1 into v_version from public.gx_creator_deliveries where task_id=p_task_id;
  insert into public.gx_creator_deliveries(task_id,request_id,requester_id,assigned_to,creator_user_id,title,description,version,published_at)
  values(v_task.id,v_task.source_request_id,v_task.requester_id,v_task.assigned_to,v_task.creator_user_id,
    v_task.title,v_task.description,v_version,now()) returning id into v_delivery_id;
  -- Only explicitly uploaded final proposal files are published, never chat evidence.
  insert into public.gx_creator_delivery_files(delivery_id,bucket_id,object_path,file_name,mime_type,size_bytes,created_at)
  select v_delivery_id,'gx-internal-task-files',f.object_path,f.file_name,f.mime_type,f.size_bytes,f.created_at
  from public.gx_creator_delivery_proposal_files f
  where f.task_id=v_task.id and f.uploaded_by=v_task.assigned_to
    and f.created_at>coalesce(v_task.reviewed_at,v_task.created_at);
  select count(*) into v_file_count from public.gx_creator_delivery_files where delivery_id=v_delivery_id;
  if v_file_count=0 then
    raise exception 'El encargado debe adjuntar al menos un archivo en “Propuesta final” antes de que puedas aprobarlo.' using errcode='22023';
  end if;
  update public.gx_tasks set status='completed',reviewed_by=auth.uid(),reviewed_at=now(),completed_at=now(),review_note=null
  where id=p_task_id;
  insert into public.notifications(user_id,type,title,message,link_page,link_target)
  values(v_task.creator_user_id,'creator_delivery','¡Tienes nuevo contenido disponible!',
    left('Grayxon publicó "'||v_task.title||'". Ya puedes verlo y descargarlo desde Mis entregas.',180),
    'creator-delivery',v_delivery_id::text);
  return v_delivery_id;
end;
$$;
revoke all on function public.gx_creator_delivery_review(uuid,boolean,text) from public,anon;
grant execute on function public.gx_creator_delivery_review(uuid,boolean,text) to authenticated;