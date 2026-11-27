begin;

create table if not exists public.gx_creator_followup_general_reports (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.managers(id),
  team_id uuid references public.teams(id),
  generated_by uuid not null references auth.users(id),
  creator_count integer not null check (creator_count > 0),
  period_start date not null,
  period_end date not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gx_followup_general_reports_manager_date
  on public.gx_creator_followup_general_reports(manager_id, generated_at desc);

alter table public.gx_creator_followup_general_reports enable row level security;

drop policy if exists gx_followup_general_reports_read on public.gx_creator_followup_general_reports;
create policy gx_followup_general_reports_read
  on public.gx_creator_followup_general_reports
  for select to authenticated
  using (public.is_admin() or manager_id = public.current_manager_id());

create or replace function public.gx_manager_generate_general_followup_report()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_manager uuid := public.current_manager_id();
  v_report_id uuid;
  v_total integer;
  v_missing integer;
  v_team uuid;
  v_start date := date_trunc('month', now() at time zone 'America/Bogota')::date;
  v_end date := (date_trunc('month', now() at time zone 'America/Bogota') + interval '1 month - 1 day')::date;
begin
  if v_uid is null or v_manager is null then
    raise exception 'Solo un manager autenticado puede generar este informe';
  end if;

  select count(*), count(*) filter (where not exists (
    select 1
    from public.gx_creator_action_plans ap
    where ap.creator_user_id = p.id
      and ap.manager_id = v_manager
      and ap.status <> 'cancelled'
  )), (array_agg(p.team_id) filter (where p.team_id is not null))[1]
  into v_total, v_missing, v_team
  from public.profiles p
  where p.role = 'creator'
    and p.active = true
    and p.manager_id = v_manager;

  if v_total = 0 then
    raise exception 'No tienes creadores activos asignados para incluir en el informe';
  end if;

  if v_missing > 0 then
    raise exception 'Aún tienes % creador(es) sin plan de trabajo. Gestiona a todo tu equipo antes de generar el informe.', v_missing;
  end if;

  insert into public.gx_creator_followup_general_reports
    (manager_id, team_id, generated_by, creator_count, period_start, period_end)
  values
    (v_manager, v_team, v_uid, v_total, v_start, v_end)
  returning id into v_report_id;

  return v_report_id;
end;
$$;

revoke all on function public.gx_manager_generate_general_followup_report() from public, anon;
grant execute on function public.gx_manager_generate_general_followup_report() to authenticated;

commit;
