-- Grayxon Trabajo: estructura aislada para gestión operativa interna.
-- Esta migración solo crea objetos gx_* nuevos y un bucket privado propio.
-- No modifica profiles, managers, creator_tasks, manager_tasks, notifications ni el calendario existente.

create table public.gx_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gx_departments_name_check check (length(btrim(name)) between 2 and 80),
  constraint gx_departments_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.gx_internal_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  email text,
  display_name text not null,
  access_level text not null default 'operational',
  job_title text not null default 'Colaborador',
  department_id uuid references public.gx_departments(id) on delete set null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gx_internal_members_access_level_check check (access_level in ('admin','operational')),
  constraint gx_internal_members_display_name_check check (length(btrim(display_name)) between 2 and 120),
  constraint gx_internal_members_job_title_check check (length(btrim(job_title)) between 2 and 80)
);

create unique index gx_internal_members_email_uidx
  on public.gx_internal_members (lower(email))
  where email is not null;

create index gx_internal_members_department_idx
  on public.gx_internal_members (department_id, active);

create table public.gx_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  priority text not null default 'normal',
  status text not null default 'pending',
  department_id uuid references public.gx_departments(id) on delete set null,
  created_by uuid not null references public.gx_internal_members(user_id) on delete restrict,
  assigned_to uuid not null references public.gx_internal_members(user_id) on delete restrict,
  reviewed_by uuid references public.gx_internal_members(user_id) on delete set null,
  source_request_id uuid unique,
  starts_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gx_tasks_title_check check (length(btrim(title)) between 2 and 180),
  constraint gx_tasks_priority_check check (priority in ('low','normal','high','urgent')),
  constraint gx_tasks_status_check check (status in ('pending','in_progress','blocked','submitted','completed')),
  constraint gx_tasks_dates_check check (starts_at is null or due_at is null or due_at >= starts_at)
);

create index gx_tasks_assigned_due_idx on public.gx_tasks (assigned_to, due_at);
create index gx_tasks_status_due_idx on public.gx_tasks (status, due_at);
create index gx_tasks_department_idx on public.gx_tasks (department_id, status);

create table public.gx_task_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.gx_internal_members(user_id) on delete restrict,
  department_id uuid references public.gx_departments(id) on delete set null,
  title text not null,
  description text,
  urgency text not null default 'normal',
  status text not null default 'pending',
  reviewed_by uuid references public.gx_internal_members(user_id) on delete set null,
  reviewed_at timestamptz,
  admin_note text,
  converted_task_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gx_task_requests_title_check check (length(btrim(title)) between 2 and 180),
  constraint gx_task_requests_urgency_check check (urgency in ('normal','high','urgent')),
  constraint gx_task_requests_status_check check (status in ('pending','approved','rejected','converted'))
);

alter table public.gx_tasks
  add constraint gx_tasks_source_request_fkey
  foreign key (source_request_id) references public.gx_task_requests(id) on delete set null;

alter table public.gx_task_requests
  add constraint gx_task_requests_converted_task_fkey
  foreign key (converted_task_id) references public.gx_tasks(id) on delete set null;

create index gx_task_requests_requester_idx on public.gx_task_requests (requester_id, created_at desc);
create index gx_task_requests_status_idx on public.gx_task_requests (status, created_at desc);

create table public.gx_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gx_tasks(id) on delete cascade,
  author_id uuid not null references public.gx_internal_members(user_id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  constraint gx_task_comments_body_check check (length(btrim(body)) between 1 and 5000)
);

create index gx_task_comments_task_idx on public.gx_task_comments (task_id, created_at);

create table public.gx_task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gx_tasks(id) on delete cascade,
  actor_id uuid references public.gx_internal_members(user_id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index gx_task_activity_task_idx on public.gx_task_activity (task_id, created_at desc);

create table public.gx_task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gx_tasks(id) on delete cascade,
  uploaded_by uuid not null references public.gx_internal_members(user_id) on delete restrict,
  object_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  constraint gx_task_attachments_size_check check (size_bytes is null or size_bytes between 1 and 20971520)
);

create index gx_task_attachments_task_idx on public.gx_task_attachments (task_id, created_at);

-- Helper: solo comprueba la membresía del usuario autenticado actual.
-- SECURITY DEFINER evita recursión de RLS al consultar gx_internal_members.
create or replace function public.gx_is_internal_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.gx_internal_members m
    where m.user_id = auth.uid()
      and m.active is true
  );
$$;

create or replace function public.gx_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger gx_departments_set_updated_at
before update on public.gx_departments
for each row execute function public.gx_set_updated_at();

create trigger gx_internal_members_set_updated_at
before update on public.gx_internal_members
for each row execute function public.gx_set_updated_at();

create trigger gx_tasks_set_updated_at
before update on public.gx_tasks
for each row execute function public.gx_set_updated_at();

create trigger gx_task_requests_set_updated_at
before update on public.gx_task_requests
for each row execute function public.gx_set_updated_at();

-- Solo se asignan tareas a miembros internos activos.
create or replace function public.gx_validate_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.gx_internal_members m
    where m.user_id = new.assigned_to
      and m.active is true
  ) then
    raise exception 'La persona asignada no es un integrante operativo activo.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger gx_tasks_validate_assignment
before insert or update of assigned_to on public.gx_tasks
for each row execute function public.gx_validate_task_assignment();

-- Historial automático de creación, estado y reasignación.
create or replace function public.gx_log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_details jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'created';
    v_details := jsonb_build_object(
      'status', new.status,
      'assigned_to', new.assigned_to,
      'title', new.title
    );
  else
    if old.status is distinct from new.status then
      v_action := 'status_changed';
      v_details := jsonb_build_object('from', old.status, 'to', new.status);
    elsif old.assigned_to is distinct from new.assigned_to then
      v_action := 'reassigned';
      v_details := jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to);
    else
      v_action := 'updated';
      v_details := jsonb_build_object('title', new.title);
    end if;
  end if;

  insert into public.gx_task_activity(task_id, actor_id, action, details)
  values (new.id, auth.uid(), v_action, v_details);

  return new;
end;
$$;

create trigger gx_tasks_log_activity
after insert or update on public.gx_tasks
for each row execute function public.gx_log_task_activity();

-- Reutiliza la tabla de notificaciones existente sin modificar su estructura ni sus políticas.
create or replace function public.gx_notify_task_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications(user_id, type, title, message, link_page, link_target)
    values (
      new.assigned_to,
      'internal_task',
      'Nueva tarea asignada',
      left('Te asignaron la tarea: ' || new.title, 180),
      'grayxon-trabajo',
      new.id::text
    );
  elsif old.assigned_to is distinct from new.assigned_to then
    insert into public.notifications(user_id, type, title, message, link_page, link_target)
    values (
      new.assigned_to,
      'internal_task',
      'Nueva asignación',
      left('Ahora eres responsable de: ' || new.title, 180),
      'grayxon-trabajo',
      new.id::text
    );
  elsif old.status is distinct from new.status and new.status = 'submitted' then
    insert into public.notifications(user_id, type, title, message, link_page, link_target)
    select p.id, 'internal_task_review', 'Tarea entregada para revisión',
      left('La tarea "' || new.title || '" está lista para revisión.', 180),
      'grayxon-trabajo', new.id::text
    from public.profiles p
    where p.role = 'admin' and p.active is true;
  elsif old.status is distinct from new.status and new.status in ('in_progress','completed') then
    insert into public.notifications(user_id, type, title, message, link_page, link_target)
    values (
      new.assigned_to,
      'internal_task_update',
      case when new.status = 'completed' then 'Tarea aprobada' else 'Se solicitaron ajustes' end,
      left('La tarea "' || new.title || '" cambió a ' || new.status || '.', 180),
      'grayxon-trabajo',
      new.id::text
    );
  end if;
  return new;
end;
$$;

create trigger gx_tasks_notify_changes
after insert or update on public.gx_tasks
for each row execute function public.gx_notify_task_changes();

create or replace function public.gx_notify_task_requests()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications(user_id, type, title, message, link_page, link_target)
    select p.id, 'internal_request', 'Nueva solicitud interna',
      left('Nueva solicitud: ' || new.title, 180),
      'grayxon-trabajo', new.id::text
    from public.profiles p
    where p.role = 'admin' and p.active is true;
  elsif old.status is distinct from new.status then
    insert into public.notifications(user_id, type, title, message, link_page, link_target)
    values (
      new.requester_id,
      'internal_request_update',
      case when new.status = 'rejected' then 'Solicitud no aprobada' else 'Solicitud actualizada' end,
      left('Tu solicitud "' || new.title || '" fue actualizada.', 180),
      'grayxon-trabajo',
      new.id::text
    );
  end if;
  return new;
end;
$$;

create trigger gx_task_requests_notify
after insert or update on public.gx_task_requests
for each row execute function public.gx_notify_task_requests();

-- El integrante asignado puede actualizar únicamente el avance/estado permitido.
-- No puede reasignar tareas, aprobar entregas ni marcar como completadas.
create or replace function public.gx_task_member_update(
  p_task_id uuid,
  p_status text,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.gx_tasks%rowtype;
begin
  if auth.uid() is null or not public.gx_is_internal_member() then
    raise exception 'No tienes acceso a Grayxon Trabajo.' using errcode = '42501';
  end if;

  if p_status not in ('in_progress','blocked','submitted') then
    raise exception 'Estado no permitido para el responsable.' using errcode = '22023';
  end if;

  select * into v_task
  from public.gx_tasks
  where id = p_task_id
  for update;

  if not found or v_task.assigned_to <> auth.uid() then
    raise exception 'Solo puedes actualizar tus propias tareas.' using errcode = '42501';
  end if;

  if v_task.status = 'completed' then
    raise exception 'La tarea ya fue completada por administración.' using errcode = '22023';
  end if;

  update public.gx_tasks
  set status = p_status
  where id = p_task_id;

  if nullif(btrim(coalesce(p_comment,'')), '') is not null then
    insert into public.gx_task_comments(task_id, author_id, body)
    values (p_task_id, auth.uid(), btrim(p_comment));
  end if;
end;
$$;

-- Solo administración puede aprobar una entrega o devolverla con correcciones.
create or replace function public.gx_task_review(
  p_task_id uuid,
  p_approved boolean,
  p_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.gx_tasks%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Solo administración puede revisar tareas.' using errcode = '42501';
  end if;

  select * into v_task
  from public.gx_tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'La tarea no existe.' using errcode = 'P0002';
  end if;

  if v_task.status <> 'submitted' then
    raise exception 'La tarea debe estar entregada para revisión.' using errcode = '22023';
  end if;

  update public.gx_tasks
  set status = case when p_approved then 'completed' else 'in_progress' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      completed_at = case when p_approved then now() else null end,
      review_note = nullif(btrim(coalesce(p_feedback,'')), '')
  where id = p_task_id;

  if nullif(btrim(coalesce(p_feedback,'')), '') is not null then
    insert into public.gx_task_comments(task_id, author_id, body)
    values (p_task_id, auth.uid(), btrim(p_feedback));
  end if;
end;
$$;

-- Convierte una solicitud aprobada en una tarea en una sola transacción.
create or replace function public.gx_task_convert_request(
  p_request_id uuid,
  p_assigned_to uuid,
  p_priority text default 'normal',
  p_starts_at timestamptz default null,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.gx_task_requests%rowtype;
  v_task_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Solo administración puede convertir solicitudes en tareas.' using errcode = '42501';
  end if;

  select * into v_request
  from public.gx_task_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;

  if v_request.status not in ('pending','approved') then
    raise exception 'La solicitud ya fue resuelta.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.gx_internal_members
    where user_id = p_assigned_to and active is true
  ) then
    raise exception 'Selecciona un integrante operativo activo.' using errcode = '22023';
  end if;

  insert into public.gx_tasks(
    title, description, priority, department_id,
    created_by, assigned_to, source_request_id, starts_at, due_at
  )
  values (
    v_request.title, v_request.description, p_priority, v_request.department_id,
    auth.uid(), p_assigned_to, v_request.id, p_starts_at, p_due_at
  )
  returning id into v_task_id;

  update public.gx_task_requests
  set status = 'converted',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      converted_task_id = v_task_id
  where id = v_request.id;

  return v_task_id;
end;
$$;

-- RLS: todas las tablas nuevas quedan protegidas desde su creación.
alter table public.gx_departments enable row level security;
alter table public.gx_internal_members enable row level security;
alter table public.gx_tasks enable row level security;
alter table public.gx_task_requests enable row level security;
alter table public.gx_task_comments enable row level security;
alter table public.gx_task_activity enable row level security;
alter table public.gx_task_attachments enable row level security;

create policy gx_departments_member_read
on public.gx_departments for select to authenticated
using (public.is_admin() or (active is true and public.gx_is_internal_member()));

create policy gx_departments_admin_manage
on public.gx_departments for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy gx_internal_members_read_own_or_admin
on public.gx_internal_members for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy gx_internal_members_admin_manage
on public.gx_internal_members for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy gx_tasks_read_assigned_or_admin
on public.gx_tasks for select to authenticated
using (public.is_admin() or (assigned_to = auth.uid() and public.gx_is_internal_member()));

create policy gx_tasks_admin_insert
on public.gx_tasks for insert to authenticated
with check (public.is_admin() and created_by = auth.uid());

create policy gx_tasks_admin_update
on public.gx_tasks for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy gx_tasks_admin_delete
on public.gx_tasks for delete to authenticated
using (public.is_admin());

create policy gx_task_requests_read_own_or_admin
on public.gx_task_requests for select to authenticated
using (public.is_admin() or (requester_id = auth.uid() and public.gx_is_internal_member()));

create policy gx_task_requests_member_insert
on public.gx_task_requests for insert to authenticated
with check (requester_id = auth.uid() and public.gx_is_internal_member());

create policy gx_task_requests_admin_update
on public.gx_task_requests for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy gx_task_requests_admin_delete
on public.gx_task_requests for delete to authenticated
using (public.is_admin());

create policy gx_task_comments_read_task_members
on public.gx_task_comments for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.gx_tasks t
    where t.id = task_id
      and t.assigned_to = auth.uid()
      and public.gx_is_internal_member()
  )
);

create policy gx_task_comments_insert_task_members
on public.gx_task_comments for insert to authenticated
with check (
  author_id = auth.uid()
  and (
    public.is_admin()
    or exists (
      select 1 from public.gx_tasks t
      where t.id = task_id
        and t.assigned_to = auth.uid()
        and public.gx_is_internal_member()
    )
  )
);

create policy gx_task_comments_admin_delete
on public.gx_task_comments for delete to authenticated
using (public.is_admin());

create policy gx_task_activity_read_task_members
on public.gx_task_activity for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.gx_tasks t
    where t.id = task_id
      and t.assigned_to = auth.uid()
      and public.gx_is_internal_member()
  )
);

create policy gx_task_attachments_read_task_members
on public.gx_task_attachments for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.gx_tasks t
    where t.id = task_id
      and t.assigned_to = auth.uid()
      and public.gx_is_internal_member()
  )
);

create policy gx_task_attachments_insert_task_members
on public.gx_task_attachments for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    public.is_admin()
    or exists (
      select 1 from public.gx_tasks t
      where t.id = task_id
        and t.assigned_to = auth.uid()
        and public.gx_is_internal_member()
    )
  )
);

create policy gx_task_attachments_admin_delete
on public.gx_task_attachments for delete to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.gx_departments to authenticated;
grant select, insert, update, delete on public.gx_internal_members to authenticated;
grant select, insert, update, delete on public.gx_tasks to authenticated;
grant select, insert, update, delete on public.gx_task_requests to authenticated;
grant select, insert, update, delete on public.gx_task_comments to authenticated;
grant select on public.gx_task_activity to authenticated;
grant select, insert, delete on public.gx_task_attachments to authenticated;

grant execute on function public.gx_is_internal_member() to authenticated;
grant execute on function public.gx_task_member_update(uuid,text,text) to authenticated;
grant execute on function public.gx_task_review(uuid,boolean,text) to authenticated;
grant execute on function public.gx_task_convert_request(uuid,uuid,text,timestamptz,timestamptz) to authenticated;

-- Áreas iniciales; administración podrá crear más sin nuevos roles técnicos.
insert into public.gx_departments(name, slug) values
  ('Administración','administracion'),
  ('Gestión','gestion'),
  ('Eventos','eventos'),
  ('Entrenamiento','entrenamiento'),
  ('Diseño','diseno'),
  ('Operaciones','operaciones')
on conflict (slug) do nothing;

-- Se incorporan al nuevo módulo únicamente las cuentas internas actuales:
-- administradores y managers. Los creadores quedan excluidos.
insert into public.gx_internal_members(
  user_id, email, display_name, access_level, job_title, department_id, active
)
select
  p.id,
  u.email,
  coalesce(nullif(btrim(p.full_name),''), p.username),
  case when p.role = 'admin' then 'admin' else 'operational' end,
  case when p.role = 'admin' then 'Administrador' else 'Manager' end,
  d.id,
  p.active
from public.profiles p
join auth.users u on u.id = p.id
join public.gx_departments d
  on d.slug = case when p.role = 'admin' then 'administracion' else 'gestion' end
where p.role in ('admin','manager')
on conflict (user_id) do nothing;

-- Bucket privado exclusivo para evidencias de Grayxon Trabajo.
insert into storage.buckets(id, name, public, file_size_limit)
values ('gx-internal-task-files','gx-internal-task-files',false,20971520)
on conflict (id) do nothing;

create policy gx_internal_task_files_read
on storage.objects for select to authenticated
using (
  bucket_id = 'gx-internal-task-files'
  and (
    public.is_admin()
    or exists (
      select 1 from public.gx_tasks t
      where t.id::text = (storage.foldername(name))[1]
        and t.assigned_to = auth.uid()
        and public.gx_is_internal_member()
    )
  )
);

create policy gx_internal_task_files_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'gx-internal-task-files'
  and (
    public.is_admin()
    or exists (
      select 1 from public.gx_tasks t
      where t.id::text = (storage.foldername(name))[1]
        and t.assigned_to = auth.uid()
        and public.gx_is_internal_member()
    )
  )
);

create policy gx_internal_task_files_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'gx-internal-task-files'
  and (
    public.is_admin()
    or exists (
      select 1 from public.gx_tasks t
      where t.id::text = (storage.foldername(name))[1]
        and t.assigned_to = auth.uid()
        and public.gx_is_internal_member()
    )
  )
);
