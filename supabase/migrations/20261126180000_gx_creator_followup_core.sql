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
  file_sha256 text,
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
