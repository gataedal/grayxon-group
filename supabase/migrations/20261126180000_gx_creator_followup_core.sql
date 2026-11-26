-- Seguimiento de creadores · almacenamiento inicial de importaciones y evaluaciones
-- Preparado para revisión. NO aplicado a Supabase.
-- Reutiliza los helpers y la asignación existentes: public.is_admin() y
-- public.current_manager_id(). No crea roles ni modifica permisos de tablas actuales.

create table if not exists public.gx_creator_followup_imports (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  manager_id uuid references public.managers(id) on delete restrict,
  team_id uuid references public.teams(id) on delete set null,
  file_name text not null,
  storage_bucket text not null default 'gx-followup-imports' check (storage_bucket = 'gx-followup-imports'),
  storage_path text not null unique,
  file_size_bytes bigint not null check (file_size_bytes between 1 and 20971520),
  mime_type text not null check (mime_type in ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/csv')),
  file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}
  selected_start_date date not null,
  selected_end_date date not null,
  source_start_date date,
  source_end_date date,
  source_granularity text not null default 'unknown'
    check (source_granularity in ('daily','period_aggregate','unknown')),
  status text not null default 'uploaded'
    check (status in ('uploaded','processed','needs_daily_data','failed','superseded')),
  supersedes_import_id uuid references public.gx_creator_followup_imports(id) on delete set null,
  row_count integer not null default 0 check (row_count >= 0),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error_summary text,
  constraint gx_creator_followup_imports_selected_dates_check
    check (selected_start_date <= selected_end_date),
  constraint gx_creator_followup_imports_source_dates_check
    check (source_start_date is null or source_end_date is null or source_start_date <= source_end_date)
);

create index if not exists gx_creator_followup_imports_manager_period_idx
  on public.gx_creator_followup_imports(manager_id, selected_start_date desc, selected_end_date desc);

create table if not exists public.gx_creator_followup_evaluations (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.gx_creator_followup_imports(id) on delete restrict,
  creator_user_id uuid not null references public.profiles(id) on delete restrict,
  creator_username_snapshot text not null,
  creator_name_snapshot text,
  team_id_snapshot uuid references public.teams(id) on delete set null,
  manager_id_snapshot uuid references public.managers(id) on delete set null,
  join_date_snapshot date,
  evaluated_start_date date not null,
  evaluated_end_date date not null,
  evaluable_days integer not null default 0 check (evaluable_days >= 0),
  valid_live_days numeric(8,2),
  live_seconds bigint,
  diamonds bigint,
  target_valid_days numeric(8,2),
  target_live_seconds bigint,
  valid_days_pct numeric(8,2),
  live_hours_pct numeric(8,2),
  classification text not null
    check (classification in ('high_risk','observation','on_track','early_review','not_evaluable','needs_daily_data')),
  raw_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint gx_creator_followup_evaluations_dates_check
    check (evaluated_start_date <= evaluated_end_date),
  unique(import_id, creator_user_id)
);

create index if not exists gx_creator_followup_evaluations_creator_history_idx
  on public.gx_creator_followup_evaluations(creator_user_id, evaluated_end_date desc);
create index if not exists gx_creator_followup_evaluations_manager_classification_idx
  on public.gx_creator_followup_evaluations(manager_id_snapshot, classification, evaluated_end_date desc);

-- Impide asociar una importación a un equipo que no corresponda al manager.
-- Los administradores pueden importar de forma global (manager_id/team_id NULL)
-- o seleccionar un manager activo y uno de sus equipos.
create or replace function public.gx_validate_creator_followup_import()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $
begin
  if public.is_admin() then
    if new.manager_id is null and new.team_id is not null then
      raise exception 'Una importación global no puede quedar asociada a un equipo.' using errcode = '22023';
    end if;
    if new.manager_id is not null and not exists (
      select 1 from public.managers m where m.id = new.manager_id and m.active is true
    ) then
      raise exception 'El manager seleccionado no está activo.' using errcode = '22023';
    end if;
  else
    if new.manager_id is distinct from public.current_manager_id() then
      raise exception 'Solo puedes registrar importaciones de tu propio equipo.' using errcode = '42501';
    end if;
  end if;

  if new.team_id is not null and not exists (
    select 1 from public.teams t where t.id = new.team_id and t.manager_id = new.manager_id
  ) then
    raise exception 'El equipo seleccionado no pertenece al manager indicado.' using errcode = '42501';
  end if;

  return new;
end;
$;

drop trigger if exists gx_creator_followup_import_scope on public.gx_creator_followup_imports;
create trigger gx_creator_followup_import_scope
before insert on public.gx_creator_followup_imports
for each row execute function public.gx_validate_creator_followup_import();

alter table public.gx_creator_followup_imports enable row level security;
alter table public.gx_creator_followup_evaluations enable row level security;

drop policy if exists gx_creator_followup_imports_read_scope on public.gx_creator_followup_imports;
create policy gx_creator_followup_imports_read_scope
on public.gx_creator_followup_imports for select to authenticated
using (public.is_admin() or manager_id = public.current_manager_id());

drop policy if exists gx_creator_followup_imports_insert_scope on public.gx_creator_followup_imports;
create policy gx_creator_followup_imports_insert_scope
on public.gx_creator_followup_imports for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    (public.is_admin() and (manager_id is null or exists (
      select 1 from public.managers m where m.id = manager_id and m.active is true
    )))
    or (manager_id = public.current_manager_id())
  )
);

drop policy if exists gx_creator_followup_evaluations_read_scope on public.gx_creator_followup_evaluations;
create policy gx_creator_followup_evaluations_read_scope
on public.gx_creator_followup_evaluations for select to authenticated
using (public.is_admin() or manager_id_snapshot = public.current_manager_id());

-- El manager solo puede insertar evaluaciones para un creador que actualmente
-- tenga asignado. El import debe pertenecer al mismo manager.
create or replace function public.gx_validate_creator_followup_evaluation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_import public.gx_creator_followup_imports%rowtype;
  v_creator public.profiles%rowtype;
begin
  select * into v_import from public.gx_creator_followup_imports where id = new.import_id;
  if not found then
    raise exception 'La importación no existe.' using errcode = 'P0002';
  end if;

  select * into v_creator from public.profiles
  where id = new.creator_user_id and role = 'creator' and active is true;
  if not found then
    raise exception 'El perfil del creador no está activo.' using errcode = '22023';
  end if;

  if public.is_admin() then
    if v_import.manager_id is not null and v_creator.manager_id is distinct from v_import.manager_id then
      raise exception 'El creador no pertenece al manager seleccionado.' using errcode = '42501';
    end if;
  else
    if v_import.manager_id is distinct from public.current_manager_id()
       or v_creator.manager_id is distinct from public.current_manager_id() then
      raise exception 'Solo puedes evaluar creadores asignados a tu equipo.' using errcode = '42501';
    end if;
  end if;

  new.manager_id_snapshot := v_creator.manager_id;
  new.team_id_snapshot := v_creator.team_id;
  new.creator_username_snapshot := coalesce(nullif(new.creator_username_snapshot,''),v_creator.tiktok_username,v_creator.username);
  new.creator_name_snapshot := coalesce(nullif(new.creator_name_snapshot,''),v_creator.full_name);
  return new;
end;
$$;

drop trigger if exists gx_creator_followup_evaluation_scope on public.gx_creator_followup_evaluations;
create trigger gx_creator_followup_evaluation_scope
before insert on public.gx_creator_followup_evaluations
for each row execute function public.gx_validate_creator_followup_evaluation();

drop policy if exists gx_creator_followup_evaluations_insert_scope on public.gx_creator_followup_evaluations;
create policy gx_creator_followup_evaluations_insert_scope
on public.gx_creator_followup_evaluations for insert to authenticated
with check (
  public.is_admin()
  or (
    manager_id_snapshot = public.current_manager_id()
    and exists (
      select 1 from public.profiles p
      where p.id = creator_user_id
        and p.role = 'creator' and p.active is true
        and p.manager_id = public.current_manager_id()
    )
    and exists (
      select 1 from public.gx_creator_followup_imports i
      where i.id = import_id and i.manager_id = public.current_manager_id()
    )
  )
);

-- Las evaluaciones son snapshots históricos: no se permite UPDATE/DELETE directo.
revoke all on public.gx_creator_followup_imports from anon, public;
revoke all on public.gx_creator_followup_evaluations from anon, public;
grant select on public.gx_creator_followup_imports to authenticated;
grant select on public.gx_creator_followup_evaluations to authenticated;

-- Bucket privado y aislado para los Excel de Seguimiento (20 MB máximo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gx-followup-imports',
  'gx-followup-imports',
  false,
  20971520,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Antes de registrar la importación solo se permite subir a una carpeta
-- cuyo primer segmento sea el UID autenticado. La lectura exige importación
-- registrada y respeta el ámbito del manager/admin.
drop policy if exists gx_followup_storage_insert_own on storage.objects;
create policy gx_followup_storage_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'gx-followup-imports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists gx_followup_storage_select_scope on storage.objects;
create policy gx_followup_storage_select_scope
on storage.objects for select to authenticated
using (
  bucket_id = 'gx-followup-imports'
  and exists (
    select 1
    from public.gx_creator_followup_imports i
    where i.storage_bucket = bucket_id
      and i.storage_path = name
      and (public.is_admin() or i.manager_id = public.current_manager_id())
  )
);

-- Una sola operación transaccional: registra el archivo y todas las evaluaciones.
-- Si una fila falla, PostgreSQL revierte toda la operación.
create or replace function public.gx_save_creator_followup_import(
  p_import_id uuid,
  p_manager_id uuid,
  p_team_id uuid,
  p_file_name text,
  p_storage_path text,
  p_file_size_bytes bigint,
  p_mime_type text,
  p_file_sha256 text,
  p_selected_start_date date,
  p_selected_end_date date,
  p_source_start_date date,
  p_source_end_date date,
  p_source_granularity text,
  p_status text,
  p_row_count integer,
  p_evaluations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $
declare
  v_uid uuid := auth.uid();
  v_import_id uuid := coalesce(p_import_id, gen_random_uuid());
  v_eval_count integer;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión.' using errcode = '28000';
  end if;

  if p_status not in ('processed','needs_daily_data') then
    raise exception 'Estado de importación no permitido.' using errcode = '22023';
  end if;
  if p_source_granularity not in ('daily','period_aggregate','unknown') then
    raise exception 'Granularidad no válida.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_evaluations, '[]'::jsonb)) <> 'array' then
    raise exception 'Las evaluaciones deben enviarse como una lista.' using errcode = '22023';
  end if;
  if p_row_count < 0 or p_row_count <> jsonb_array_length(coalesce(p_evaluations, '[]'::jsonb)) then
    raise exception 'El número de filas no coincide con las evaluaciones.' using errcode = '22023';
  end if;

  if p_storage_path is null
     or split_part(p_storage_path, '/', 1) <> v_uid::text
     or split_part(p_storage_path, '/', 2) <> v_import_id::text
     or p_storage_path like '%..%' then
    raise exception 'Ruta de almacenamiento no válida.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'gx-followup-imports' and o.name = p_storage_path
  ) then
    raise exception 'No se encontró el archivo privado cargado.' using errcode = 'P0002';
  end if;

  if not public.is_admin() and p_manager_id is distinct from public.current_manager_id() then
    raise exception 'Solo puedes registrar importaciones de tu propio equipo.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.gx_creator_followup_imports i
    where i.file_sha256 = lower(p_file_sha256)
      and i.manager_id is not distinct from p_manager_id
      and i.selected_start_date = p_selected_start_date
      and i.selected_end_date = p_selected_end_date
  ) then
    raise exception 'Este archivo ya fue registrado para ese equipo y periodo.' using errcode = '23505';
  end if;

  insert into public.gx_creator_followup_imports (
    id, uploaded_by, manager_id, team_id, file_name, storage_bucket, storage_path,
    file_size_bytes, mime_type, file_sha256, selected_start_date, selected_end_date,
    source_start_date, source_end_date, source_granularity, status, row_count, processed_at
  ) values (
    v_import_id, v_uid, p_manager_id, p_team_id, p_file_name, 'gx-followup-imports', p_storage_path,
    p_file_size_bytes, p_mime_type, lower(p_file_sha256), p_selected_start_date, p_selected_end_date,
    p_source_start_date, p_source_end_date, p_source_granularity, p_status, p_row_count, now()
  );

  insert into public.gx_creator_followup_evaluations (
    import_id, creator_user_id, creator_username_snapshot, creator_name_snapshot,
    join_date_snapshot, evaluated_start_date, evaluated_end_date, evaluable_days,
    valid_live_days, live_seconds, diamonds, target_valid_days, target_live_seconds,
    valid_days_pct, live_hours_pct, classification, raw_metrics
  )
  select
    v_import_id, e.creator_user_id, coalesce(e.creator_username_snapshot,''),
    e.creator_name_snapshot, e.join_date_snapshot, e.evaluated_start_date,
    e.evaluated_end_date, coalesce(e.evaluable_days,0), e.valid_live_days,
    e.live_seconds, e.diamonds, e.target_valid_days, e.target_live_seconds,
    e.valid_days_pct, e.live_hours_pct, e.classification,
    coalesce(e.raw_metrics,'{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_evaluations, '[]'::jsonb)) as e(
    creator_user_id uuid,
    creator_username_snapshot text,
    creator_name_snapshot text,
    join_date_snapshot date,
    evaluated_start_date date,
    evaluated_end_date date,
    evaluable_days integer,
    valid_live_days numeric,
    live_seconds bigint,
    diamonds bigint,
    target_valid_days numeric,
    target_live_seconds bigint,
    valid_days_pct numeric,
    live_hours_pct numeric,
    classification text,
    raw_metrics jsonb
  );

  get diagnostics v_eval_count = row_count;
  if v_eval_count <> p_row_count then
    raise exception 'No se guardaron todas las evaluaciones.' using errcode = '22023';
  end if;

  return v_import_id;
end;
$;

revoke all on function public.gx_save_creator_followup_import(
  uuid,uuid,uuid,text,text,bigint,text,text,date,date,date,date,text,text,integer,jsonb
) from public, anon;
grant execute on function public.gx_save_creator_followup_import(
  uuid,uuid,uuid,text,text,bigint,text,text,date,date,date,date,text,text,integer,jsonb
) to authenticated;
),
  selected_start_date date not null,
  selected_end_date date not null,
  source_start_date date,
  source_end_date date,
  source_granularity text not null default 'unknown'
    check (source_granularity in ('daily','period_aggregate','unknown')),
  status text not null default 'uploaded'
    check (status in ('uploaded','processed','needs_daily_data','failed','superseded')),
  supersedes_import_id uuid references public.gx_creator_followup_imports(id) on delete set null,
  row_count integer not null default 0 check (row_count >= 0),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error_summary text,
  constraint gx_creator_followup_imports_selected_dates_check
    check (selected_start_date <= selected_end_date),
  constraint gx_creator_followup_imports_source_dates_check
    check (source_start_date is null or source_end_date is null or source_start_date <= source_end_date)
);

create index if not exists gx_creator_followup_imports_manager_period_idx
  on public.gx_creator_followup_imports(manager_id, selected_start_date desc, selected_end_date desc);

create table if not exists public.gx_creator_followup_evaluations (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.gx_creator_followup_imports(id) on delete restrict,
  creator_user_id uuid not null references public.profiles(id) on delete restrict,
  creator_username_snapshot text not null,
  creator_name_snapshot text,
  team_id_snapshot uuid references public.teams(id) on delete set null,
  manager_id_snapshot uuid references public.managers(id) on delete set null,
  join_date_snapshot date,
  evaluated_start_date date not null,
  evaluated_end_date date not null,
  evaluable_days integer not null default 0 check (evaluable_days >= 0),
  valid_live_days numeric(8,2),
  live_seconds bigint,
  diamonds bigint,
  target_valid_days numeric(8,2),
  target_live_seconds bigint,
  valid_days_pct numeric(8,2),
  live_hours_pct numeric(8,2),
  classification text not null
    check (classification in ('high_risk','observation','on_track','early_review','not_evaluable','needs_daily_data')),
  raw_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint gx_creator_followup_evaluations_dates_check
    check (evaluated_start_date <= evaluated_end_date),
  unique(import_id, creator_user_id)
);

create index if not exists gx_creator_followup_evaluations_creator_history_idx
  on public.gx_creator_followup_evaluations(creator_user_id, evaluated_end_date desc);
create index if not exists gx_creator_followup_evaluations_manager_classification_idx
  on public.gx_creator_followup_evaluations(manager_id_snapshot, classification, evaluated_end_date desc);

-- Impide asociar una importación a un equipo que no corresponda al manager.
-- Los administradores pueden importar de forma global (manager_id/team_id NULL)
-- o seleccionar un manager activo y uno de sus equipos.
create or replace function public.gx_validate_creator_followup_import()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $
begin
  if public.is_admin() then
    if new.manager_id is null and new.team_id is not null then
      raise exception 'Una importación global no puede quedar asociada a un equipo.' using errcode = '22023';
    end if;
    if new.manager_id is not null and not exists (
      select 1 from public.managers m where m.id = new.manager_id and m.active is true
    ) then
      raise exception 'El manager seleccionado no está activo.' using errcode = '22023';
    end if;
  else
    if new.manager_id is distinct from public.current_manager_id() then
      raise exception 'Solo puedes registrar importaciones de tu propio equipo.' using errcode = '42501';
    end if;
  end if;

  if new.team_id is not null and not exists (
    select 1 from public.teams t where t.id = new.team_id and t.manager_id = new.manager_id
  ) then
    raise exception 'El equipo seleccionado no pertenece al manager indicado.' using errcode = '42501';
  end if;

  return new;
end;
$;

drop trigger if exists gx_creator_followup_import_scope on public.gx_creator_followup_imports;
create trigger gx_creator_followup_import_scope
before insert on public.gx_creator_followup_imports
for each row execute function public.gx_validate_creator_followup_import();

alter table public.gx_creator_followup_imports enable row level security;
alter table public.gx_creator_followup_evaluations enable row level security;

drop policy if exists gx_creator_followup_imports_read_scope on public.gx_creator_followup_imports;
create policy gx_creator_followup_imports_read_scope
on public.gx_creator_followup_imports for select to authenticated
using (public.is_admin() or manager_id = public.current_manager_id());

drop policy if exists gx_creator_followup_imports_insert_scope on public.gx_creator_followup_imports;
create policy gx_creator_followup_imports_insert_scope
on public.gx_creator_followup_imports for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    (public.is_admin() and (manager_id is null or exists (
      select 1 from public.managers m where m.id = manager_id and m.active is true
    )))
    or (manager_id = public.current_manager_id())
  )
);

drop policy if exists gx_creator_followup_evaluations_read_scope on public.gx_creator_followup_evaluations;
create policy gx_creator_followup_evaluations_read_scope
on public.gx_creator_followup_evaluations for select to authenticated
using (public.is_admin() or manager_id_snapshot = public.current_manager_id());

-- El manager solo puede insertar evaluaciones para un creador que actualmente
-- tenga asignado. El import debe pertenecer al mismo manager.
create or replace function public.gx_validate_creator_followup_evaluation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_import public.gx_creator_followup_imports%rowtype;
  v_creator public.profiles%rowtype;
begin
  select * into v_import from public.gx_creator_followup_imports where id = new.import_id;
  if not found then
    raise exception 'La importación no existe.' using errcode = 'P0002';
  end if;

  select * into v_creator from public.profiles
  where id = new.creator_user_id and role = 'creator' and active is true;
  if not found then
    raise exception 'El perfil del creador no está activo.' using errcode = '22023';
  end if;

  if public.is_admin() then
    if v_import.manager_id is not null and v_creator.manager_id is distinct from v_import.manager_id then
      raise exception 'El creador no pertenece al manager seleccionado.' using errcode = '42501';
    end if;
  else
    if v_import.manager_id is distinct from public.current_manager_id()
       or v_creator.manager_id is distinct from public.current_manager_id() then
      raise exception 'Solo puedes evaluar creadores asignados a tu equipo.' using errcode = '42501';
    end if;
  end if;

  new.manager_id_snapshot := v_creator.manager_id;
  new.team_id_snapshot := v_creator.team_id;
  new.creator_username_snapshot := coalesce(nullif(new.creator_username_snapshot,''),v_creator.tiktok_username,v_creator.username);
  new.creator_name_snapshot := coalesce(nullif(new.creator_name_snapshot,''),v_creator.full_name);
  return new;
end;
$$;

drop trigger if exists gx_creator_followup_evaluation_scope on public.gx_creator_followup_evaluations;
create trigger gx_creator_followup_evaluation_scope
before insert on public.gx_creator_followup_evaluations
for each row execute function public.gx_validate_creator_followup_evaluation();

drop policy if exists gx_creator_followup_evaluations_insert_scope on public.gx_creator_followup_evaluations;
create policy gx_creator_followup_evaluations_insert_scope
on public.gx_creator_followup_evaluations for insert to authenticated
with check (
  public.is_admin()
  or (
    manager_id_snapshot = public.current_manager_id()
    and exists (
      select 1 from public.profiles p
      where p.id = creator_user_id
        and p.role = 'creator' and p.active is true
        and p.manager_id = public.current_manager_id()
    )
    and exists (
      select 1 from public.gx_creator_followup_imports i
      where i.id = import_id and i.manager_id = public.current_manager_id()
    )
  )
);

-- Las evaluaciones son snapshots históricos: no se permite UPDATE/DELETE directo.
revoke all on public.gx_creator_followup_imports from anon, public;
revoke all on public.gx_creator_followup_evaluations from anon, public;
grant select, insert on public.gx_creator_followup_imports to authenticated;
grant select, insert on public.gx_creator_followup_evaluations to authenticated;
