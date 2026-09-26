-- GRAYXON GROUP — Managers + manager tasks + secure assignment access
-- Ejecutar una sola vez en Supabase SQL Editor.

-- 1) Vincular la cuenta de acceso con el registro operativo del manager.
alter table public.managers add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.managers add column if not exists username text;
alter table public.managers add column if not exists active boolean not null default true;
create unique index if not exists managers_user_id_uidx on public.managers(user_id) where user_id is not null;
create unique index if not exists managers_username_uidx on public.managers(lower(username)) where username is not null;

-- 2) Permitir que el perfil tenga el rol manager.
-- No cambia los roles existentes: admin / creator siguen funcionando igual.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','creator','manager'));

-- 3) Helpers de seguridad. Son SECURITY DEFINER para poder resolver el manager
-- actual sin quedar bloqueados por las propias políticas RLS.
create or replace function public.current_manager_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.manager_id
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'manager'
    and p.active = true
  limit 1;
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'manager' and p.active = true
  );
$$;

grant execute on function public.current_manager_id() to authenticated, anon;
grant execute on function public.is_manager() to authenticated, anon;

-- 4) RLS de lectura para managers. Solo ven creadores que actualmente
-- tienen asignado ese manager.
drop policy if exists managers_select_assigned_creators on public.profiles;
create policy managers_select_assigned_creators
on public.profiles for select to authenticated
using (
  role = 'creator'
  and manager_id = public.current_manager_id()
);

drop policy if exists managers_select_own_manager on public.managers;
create policy managers_select_own_manager
on public.managers for select to authenticated
using (id = public.current_manager_id());

drop policy if exists managers_select_own_team on public.teams;
create policy managers_select_own_team
on public.teams for select to authenticated
using (manager_id = public.current_manager_id());

drop policy if exists managers_select_creator_details on public.profile_details;
create policy managers_select_creator_details
on public.profile_details for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_details.user_id
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
);

drop policy if exists managers_select_creator_payments on public.payment_methods;
create policy managers_select_creator_payments
on public.payment_methods for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = payment_methods.user_id
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
);

drop policy if exists managers_select_creator_lesson_progress on public.lesson_progress;
create policy managers_select_creator_lesson_progress
on public.lesson_progress for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = lesson_progress.user_id
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
);

-- 5) Misiones: managers pueden ver/crear/editar/eliminar SOLO las de sus creadores.
alter table public.missions add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.missions add column if not exists created_by_role text;

drop policy if exists managers_select_assigned_missions on public.missions;
create policy managers_select_assigned_missions
on public.missions for select to authenticated
using (
  assigned_to is not null
  and exists (
    select 1 from public.profiles p
    where p.id = missions.assigned_to
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
);

drop policy if exists managers_insert_assigned_missions on public.missions;
create policy managers_insert_assigned_missions
on public.missions for insert to authenticated
with check (
  assigned_to is not null
  and created_by = auth.uid()
  and created_by_role = 'manager'
  and exists (
    select 1 from public.profiles p
    where p.id = missions.assigned_to
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
);

drop policy if exists managers_update_assigned_missions on public.missions;
create policy managers_update_assigned_missions
on public.missions for update to authenticated
using (
  assigned_to is not null
  and exists (
    select 1 from public.profiles p
    where p.id = missions.assigned_to
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
)
with check (
  assigned_to is not null
  and exists (
    select 1 from public.profiles p
    where p.id = missions.assigned_to
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
);

drop policy if exists managers_delete_assigned_missions on public.missions;
create policy managers_delete_assigned_missions
on public.missions for delete to authenticated
using (
  assigned_to is not null
  and exists (
    select 1 from public.profiles p
    where p.id = missions.assigned_to
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
);

-- 6) Progreso de misiones: el manager puede verlo para sus creadores,
-- pero no puede alterar lo que el creador registra.
drop policy if exists managers_select_creator_mission_progress on public.mission_progress;
create policy managers_select_creator_mission_progress
on public.mission_progress for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = mission_progress.user_id
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  )
);

-- 7) Notificaciones: manager puede leer/actualizar SOLO las suyas.
drop policy if exists users_read_own_notifications on public.notifications;
create policy users_read_own_notifications
on public.notifications for select to authenticated
using (user_id = auth.uid());

drop policy if exists users_update_own_notifications on public.notifications;
create policy users_update_own_notifications
on public.notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- 8) RPC para que admin o manager pueda avisar a un creador de una nueva
-- asignación de misiones.
create or replace function public.notify_creator_mission_week(
  p_creator_id uuid,
  p_title text,
  p_message text,
  p_week_start date default null,
  p_week_end date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_allowed boolean := false;
begin
  if exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and active = true) then
    v_allowed := true;
  elsif exists(
    select 1 from public.profiles p
    where p.id = p_creator_id
      and p.role = 'creator'
      and p.manager_id = public.current_manager_id()
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'No autorizado para notificar a este creador';
  end if;

  insert into public.notifications(
    user_id,type,title,message,link_page,related_week_start,related_week_end
  ) values (
    p_creator_id,'mission',p_title,p_message,'missions',p_week_start,p_week_end
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.notify_creator_mission_week(uuid,text,text,date,date) to authenticated;

-- 9) Notificación automática cuando un creador cambia de manager.
-- El antiguo manager recibe la salida y el nuevo la asignación.
create or replace function public.notify_manager_creator_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_uid uuid;
  new_uid uuid;
  creator_name text;
begin
  if coalesce(old.manager_id,'00000000-0000-0000-0000-000000000000') = coalesce(new.manager_id,'00000000-0000-0000-0000-000000000000') then
    return new;
  end if;

  creator_name := coalesce(new.full_name, new.username, 'Un creador');

  if old.manager_id is not null then
    select user_id into old_uid from public.managers where id = old.manager_id;
    if old_uid is not null then
      insert into public.notifications(user_id,type,title,message,link_page)
      values(old_uid,'manager_assignment','Creador retirado',
        creator_name || ' ya no está asignado a tu equipo.','manager');
    end if;
  end if;

  if new.manager_id is not null then
    select user_id into new_uid from public.managers where id = new.manager_id;
    if new_uid is not null then
      insert into public.notifications(user_id,type,title,message,link_page)
      values(new_uid,'manager_assignment','Nuevo creador asignado',
        creator_name || ' fue asignado a tu equipo.','manager');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_manager_creator_assignment on public.profiles;
create trigger trg_notify_manager_creator_assignment
after update of manager_id on public.profiles
for each row execute function public.notify_manager_creator_assignment();

-- 10) Tareas internas de managers.
create table if not exists public.manager_tasks (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.managers(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references auth.users(id),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists manager_tasks_manager_idx on public.manager_tasks(manager_id, assigned_at desc);

alter table public.manager_tasks enable row level security;

drop policy if exists managers_read_own_tasks on public.manager_tasks;
create policy managers_read_own_tasks
on public.manager_tasks for select to authenticated
using (manager_id = public.current_manager_id());

-- El manager no recibe UPDATE directo: solo puede finalizar mediante complete_manager_task().

-- El manager NO puede insertar, borrar ni modificar assigned_at/completed_at.
-- La marca de completado se hace mediante RPC para sellar completed_at en BD.
create or replace function public.complete_manager_task(p_task_id uuid)
returns public.manager_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.manager_tasks;
begin
  update public.manager_tasks
  set completed = true,
      completed_at = coalesce(completed_at, now())
  where id = p_task_id
    and manager_id = public.current_manager_id()
    and completed = false
  returning * into row;

  if row.id is null then
    raise exception 'Tarea no encontrada, ya completada o sin autorización';
  end if;

  return row;
end;
$$;

grant execute on function public.complete_manager_task(uuid) to authenticated;

-- Admin: lectura y escritura completa de tareas.
drop policy if exists admins_manage_manager_tasks on public.manager_tasks;
create policy admins_manage_manager_tasks
on public.manager_tasks for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Admin puede leer managers y equipos; estas políticas no cambian las existentes.
drop policy if exists admins_manage_managers on public.managers;
create policy admins_manage_managers
on public.managers for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admins_manage_teams on public.teams;
create policy admins_manage_teams
on public.teams for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 11) Grants necesarios para las consultas del portal.
grant select on public.managers to authenticated;
grant select on public.teams to authenticated;
grant select on public.manager_tasks to authenticated;
grant execute on function public.complete_manager_task(uuid) to authenticated;

-- 12) Evita que el manager pueda alterar sellos de tiempo aunque exista una
-- política UPDATE permisiva: un trigger rechaza cualquier intento de cambio.
create or replace function public.protect_manager_task_timestamps()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_at is distinct from old.assigned_at then
    raise exception 'assigned_at es inmutable';
  end if;
  if new.assigned_by is distinct from old.assigned_by then
    raise exception 'assigned_by es inmutable';
  end if;
  -- completed_at solo puede pasar una vez de NULL a un valor cuando
  -- completed cambia de false a true. Después queda sellado para siempre.
  if new.completed_at is distinct from old.completed_at
     and not (old.completed = false and new.completed = true and old.completed_at is null and new.completed_at is not null) then
    raise exception 'completed_at es inmutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_manager_task_timestamps on public.manager_tasks;
create trigger trg_protect_manager_task_timestamps
before update on public.manager_tasks
for each row execute function public.protect_manager_task_timestamps();

-- Recarga del esquema para PostgREST.
notify pgrst, 'reload schema';
