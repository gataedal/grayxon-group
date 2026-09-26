-- GRAYXON GROUP — v65: tareas de creadores
-- Ejecutar una sola vez en Supabase SQL Editor.
-- No elimina ni modifica las tablas, triggers o políticas existentes.

create table if not exists public.creator_tasks (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references auth.users(id),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists creator_tasks_creator_idx
  on public.creator_tasks(creator_id, assigned_at desc);

alter table public.creator_tasks enable row level security;

-- Manager: solo ve/crea tareas de creadores que actualmente están asignados a él.
drop policy if exists managers_select_assigned_creator_tasks on public.creator_tasks;
create policy managers_select_assigned_creator_tasks
on public.creator_tasks for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = creator_tasks.creator_id
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
);

drop policy if exists managers_insert_assigned_creator_tasks on public.creator_tasks;
create policy managers_insert_assigned_creator_tasks
on public.creator_tasks for insert to authenticated
with check (
  public.is_manager()
  and assigned_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = creator_tasks.creator_id
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
);

-- El creador solo puede consultar sus propias tareas.
drop policy if exists creators_select_own_tasks on public.creator_tasks;
create policy creators_select_own_tasks
on public.creator_tasks for select to authenticated
using (creator_id = auth.uid());

-- El creador no modifica directamente los sellos; completa mediante RPC.
create or replace function public.complete_creator_task(p_task_id uuid)
returns public.creator_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.creator_tasks;
begin
  update public.creator_tasks
  set completed = true,
      completed_at = coalesce(completed_at, now())
  where id = p_task_id
    and creator_id = auth.uid()
    and completed = false
  returning * into row;

  if row.id is null then
    raise exception 'Tarea no encontrada, ya completada o sin autorización';
  end if;

  return row;
end;
$$;

grant execute on function public.complete_creator_task(uuid) to authenticated;
grant select, insert on public.creator_tasks to authenticated;

-- Admin: gestión completa de tareas de creadores.
drop policy if exists admins_manage_creator_tasks on public.creator_tasks;
create policy admins_manage_creator_tasks
on public.creator_tasks for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant update, delete on public.creator_tasks to authenticated;

-- Notificación segura para avisar al creador cuando su manager le asigna una tarea.
create or replace function public.notify_creator_task(
  p_creator_id uuid,
  p_title text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_creator_id
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
      and public.is_manager()
  ) then
    raise exception 'No autorizado para notificar a este creador';
  end if;

  insert into public.notifications(
    user_id, type, title, message, link_page
  ) values (
    p_creator_id, 'creator_task', p_title, p_message, 'space'
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.notify_creator_task(uuid,text,text) to authenticated;

-- Reproducible grant needed by the existing admin manager-task form.
grant insert on public.manager_tasks to authenticated;
