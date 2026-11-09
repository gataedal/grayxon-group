-- Grayxon Trabajo: aprobación por solicitante y publicación segura de entregas a creadores.
-- Solo amplía el flujo de solicitudes que explícitamente seleccionan un creador.

alter table public.gx_task_requests
  add column if not exists creator_user_id uuid references public.profiles(id) on delete set null;

alter table public.gx_tasks
  add column if not exists requester_id uuid references public.gx_internal_members(user_id) on delete set null,
  add column if not exists creator_user_id uuid references public.profiles(id) on delete set null;

create index if not exists gx_task_requests_creator_user_idx
  on public.gx_task_requests(creator_user_id) where creator_user_id is not null;
create index if not exists gx_tasks_requester_creator_idx
  on public.gx_tasks(requester_id, creator_user_id) where creator_user_id is not null;

create or replace function public.gx_validate_request_creator_scope()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_creator public.profiles%rowtype; v_manager_id uuid;
begin
  if new.creator_user_id is null then return new; end if;
  select * into v_creator from public.profiles
  where id = new.creator_user_id and role = 'creator' and active is true;
  if not found then raise exception 'Selecciona un creador activo.' using errcode = '22023'; end if;
  if public.is_admin() then return new; end if;
  v_manager_id := public.current_manager_id();
  if v_manager_id is null or v_creator.manager_id is distinct from v_manager_id then
    raise exception 'Solo puedes seleccionar creadores de tu propio equipo.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists gx_task_requests_validate_creator_scope on public.gx_task_requests;
create trigger gx_task_requests_validate_creator_scope
before insert or update of creator_user_id on public.gx_task_requests
for each row execute function public.gx_validate_request_creator_scope();

grant insert (creator_user_id) on public.gx_task_requests to authenticated;

create table if not exists public.gx_creator_deliveries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gx_tasks(id) on delete restrict,
  request_id uuid not null references public.gx_task_requests(id) on delete restrict,
  requester_id uuid not null references public.gx_internal_members(user_id) on delete restrict,
  assigned_to uuid not null references public.gx_internal_members(user_id) on delete restrict,
  creator_user_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  version integer not null check (version > 0),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(task_id, version)
);
create index if not exists gx_creator_deliveries_creator_published_idx
  on public.gx_creator_deliveries(creator_user_id, published_at desc);

create table if not exists public.gx_creator_delivery_files (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.gx_creator_deliveries(id) on delete cascade,
  bucket_id text not null check (bucket_id in ('gx-internal-request-files','gx-internal-task-files')),
  object_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  unique(delivery_id, bucket_id, object_path)
);
create index if not exists gx_creator_delivery_files_delivery_idx
  on public.gx_creator_delivery_files(delivery_id, created_at);

alter table public.gx_creator_deliveries enable row level security;
alter table public.gx_creator_delivery_files enable row level security;

drop policy if exists gx_creator_deliveries_related_read on public.gx_creator_deliveries;
create policy gx_creator_deliveries_related_read
on public.gx_creator_deliveries for select to authenticated
using (
  public.is_admin() or requester_id = auth.uid() or assigned_to = auth.uid()
  or (creator_user_id = auth.uid() and published_at is not null
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'creator' and p.active is true))
);

drop policy if exists gx_creator_delivery_files_related_read on public.gx_creator_delivery_files;
create policy gx_creator_delivery_files_related_read
on public.gx_creator_delivery_files for select to authenticated
using (
  exists (select 1 from public.gx_creator_deliveries d
    where d.id = delivery_id and (
      public.is_admin() or d.requester_id = auth.uid() or d.assigned_to = auth.uid()
      or (d.creator_user_id = auth.uid() and d.published_at is not null)
    ))
);
grant select on public.gx_creator_deliveries, public.gx_creator_delivery_files to authenticated;

drop policy if exists gx_creator_delivery_request_files_read on storage.objects;
create policy gx_creator_delivery_request_files_read
on storage.objects for select to authenticated
using (
  bucket_id = 'gx-internal-request-files'
  and exists (select 1 from public.gx_creator_delivery_files f
    join public.gx_creator_deliveries d on d.id = f.delivery_id
    where f.bucket_id = storage.objects.bucket_id and f.object_path = storage.objects.name
      and d.creator_user_id = auth.uid() and d.published_at is not null)
);

drop policy if exists gx_creator_delivery_task_files_read on storage.objects;
create policy gx_creator_delivery_task_files_read
on storage.objects for select to authenticated
using (
  bucket_id = 'gx-internal-task-files'
  and exists (select 1 from public.gx_creator_delivery_files f
    join public.gx_creator_deliveries d on d.id = f.delivery_id
    where f.bucket_id = storage.objects.bucket_id and f.object_path = storage.objects.name
      and d.creator_user_id = auth.uid() and d.published_at is not null)
);

create or replace function public.gx_task_convert_request(
  p_request_id uuid, p_assigned_to uuid, p_priority text default 'normal',
  p_starts_at timestamptz default null, p_due_at timestamptz default null
)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_request public.gx_task_requests%rowtype; v_task_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Solo administración puede convertir solicitudes en tareas.' using errcode = '42501';
  end if;
  select * into v_request from public.gx_task_requests where id = p_request_id for update;
  if not found then raise exception 'La solicitud no existe.' using errcode = 'P0002'; end if;
  if v_request.status not in ('pending','approved') then
    raise exception 'La solicitud ya fue resuelta.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.gx_internal_members where user_id = p_assigned_to and active is true) then
    raise exception 'Selecciona un integrante operativo activo.' using errcode = '22023';
  end if;
  insert into public.gx_tasks(
    title, description, priority, department_id, created_by, assigned_to,
    source_request_id, starts_at, due_at, requester_id, creator_user_id
  ) values (
    v_request.title, v_request.description, p_priority, v_request.department_id,
    auth.uid(), p_assigned_to, v_request.id, p_starts_at, p_due_at,
    v_request.requester_id, v_request.creator_user_id
  ) returning id into v_task_id;
  update public.gx_task_requests set status='converted', reviewed_by=auth.uid(),
    reviewed_at=now(), converted_task_id=v_task_id where id=v_request.id;
  return v_task_id;
end;
$$;

create or replace function public.gx_notify_creator_delivery_review()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from new.status and new.status='submitted'
     and new.creator_user_id is not null and new.requester_id is not null then
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    values(new.requester_id,'creator_delivery_review','Propuesta lista para revisar',
      left('La propuesta de "'||new.title||'" está lista. Revísala y decide si la envías al creador.',180),
      'grayxon-trabajo',new.id::text);
  end if;
  return new;
end;
$$;
drop trigger if exists gx_tasks_notify_creator_delivery_review on public.gx_tasks;
create trigger gx_tasks_notify_creator_delivery_review
after update of status on public.gx_tasks
for each row execute function public.gx_notify_creator_delivery_review();

create or replace function public.gx_creator_delivery_review(
  p_task_id uuid, p_approved boolean, p_feedback text default null
)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.gx_tasks%rowtype;
  v_delivery_id uuid;
  v_version integer;
  v_file_count integer;
begin
  if auth.uid() is null or not public.gx_is_internal_member() then
    raise exception 'No tienes acceso a Grayxon Trabajo.' using errcode = '42501';
  end if;
  if p_approved is null then raise exception 'Indica si apruebas la propuesta.' using errcode = '22023'; end if;
  if p_approved is false and nullif(btrim(coalesce(p_feedback,'')), '') is null then
    raise exception 'Escribe qué debe corregirse antes de devolver la propuesta.' using errcode = '22023';
  end if;
  select * into v_task from public.gx_tasks where id=p_task_id for update;
  if not found or v_task.requester_id is distinct from auth.uid() or v_task.creator_user_id is null then
    raise exception 'Solo quien solicitó este contenido puede revisarlo.' using errcode = '42501';
  end if;
  if v_task.status <> 'submitted' then
    raise exception 'La propuesta debe estar entregada para revisión.' using errcode = '22023';
  end if;

  if not p_approved then
    update public.gx_tasks set status='in_progress', reviewed_by=auth.uid(),
      reviewed_at=now(), completed_at=null, review_note=nullif(btrim(coalesce(p_feedback,'')), '')
    where id=p_task_id;
    insert into public.gx_task_comments(task_id,author_id,body)
    values(p_task_id,auth.uid(),'Correcciones solicitadas: '||btrim(p_feedback));
    return null;
  end if;

  select coalesce(max(version),0)+1 into v_version
  from public.gx_creator_deliveries where task_id=p_task_id;
  insert into public.gx_creator_deliveries(
    task_id,request_id,requester_id,assigned_to,creator_user_id,title,description,version,published_at
  ) values (
    v_task.id,v_task.source_request_id,v_task.requester_id,v_task.assigned_to,
    v_task.creator_user_id,v_task.title,v_task.description,v_version,now()
  ) returning id into v_delivery_id;

  insert into public.gx_creator_delivery_files(delivery_id,bucket_id,object_path,file_name,mime_type,size_bytes,created_at)
  select v_delivery_id,'gx-internal-request-files',a.object_path,a.file_name,a.mime_type,a.size_bytes,a.created_at
  from public.gx_task_request_attachments a
  where a.request_id=v_task.source_request_id and a.uploaded_by=v_task.assigned_to
    and a.created_at>=v_task.created_at;

  insert into public.gx_creator_delivery_files(delivery_id,bucket_id,object_path,file_name,mime_type,size_bytes,created_at)
  select v_delivery_id,'gx-internal-task-files',a.object_path,a.file_name,a.mime_type,a.size_bytes,a.created_at
  from public.gx_task_attachments a
  where a.task_id=v_task.id and a.uploaded_by=v_task.assigned_to and a.created_at>=v_task.created_at
  on conflict(delivery_id,bucket_id,object_path) do nothing;

  select count(*) into v_file_count from public.gx_creator_delivery_files where delivery_id=v_delivery_id;
  if v_file_count=0 then
    raise exception 'No hay archivos finales adjuntos por el encargado. No se puede publicar una entrega vacía.' using errcode = '22023';
  end if;

  update public.gx_tasks set status='completed',reviewed_by=auth.uid(),
    reviewed_at=now(),completed_at=now(),review_note=null where id=p_task_id;

  insert into public.notifications(user_id,type,title,message,link_page,link_target)
  values(v_task.creator_user_id,'creator_delivery','¡Tienes nuevo contenido disponible!',
    left('Grayxon publicó "'||v_task.title||'". Ya puedes verlo y descargarlo desde Mis entregas.',180),
    'creator-delivery',v_delivery_id::text);
  return v_delivery_id;
end;
$$;

revoke all on function public.gx_validate_request_creator_scope() from public, anon, authenticated;
revoke all on function public.gx_notify_creator_delivery_review() from public, anon, authenticated;
revoke all on function public.gx_creator_delivery_review(uuid,boolean,text) from public, anon;
revoke all on function public.gx_task_convert_request(uuid,uuid,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.gx_creator_delivery_review(uuid,boolean,text) to authenticated;
grant execute on function public.gx_task_convert_request(uuid,uuid,text,timestamptz,timestamptz) to authenticated;
