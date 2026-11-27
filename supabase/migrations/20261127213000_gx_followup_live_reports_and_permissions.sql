begin;

-- La tabla solo puede leerse por usuarios autenticados; RLS conserva el
-- alcance de administración y del manager actual del equipo.
revoke all on table public.gx_creator_followup_general_reports from anon, authenticated;
grant select on table public.gx_creator_followup_general_reports to authenticated;

-- Un registro de seguimiento crea o actualiza automáticamente el informe
-- mensual del manager. No se espera a que todo el equipo esté gestionado.
create or replace function public.gx_touch_general_followup_report()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row jsonb;
  v_manager uuid;
  v_actor uuid;
  v_team uuid;
  v_total integer;
  v_start date := date_trunc('month', now() at time zone 'America/Bogota')::date;
  v_end date := (date_trunc('month', now() at time zone 'America/Bogota') + interval '1 month - 1 day')::date;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'gx_creator_followup_evaluations' then
    v_manager := nullif(v_row->>'manager_id_snapshot','')::uuid;
    select uploaded_by into v_actor
    from public.gx_creator_followup_imports
    where id = nullif(v_row->>'import_id','')::uuid;
  elsif tg_table_name = 'gx_creator_action_plan_updates' then
    select manager_id into v_manager
    from public.gx_creator_action_plans
    where id = nullif(v_row->>'plan_id','')::uuid;
    v_actor := nullif(v_row->>'created_by','')::uuid;
  else
    v_manager := nullif(v_row->>'manager_id','')::uuid;
    v_actor := nullif(v_row->>'created_by','')::uuid;
  end if;

  if v_manager is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_actor is null then
    select user_id into v_actor from public.managers where id = v_manager;
  end if;

  select count(*), (array_agg(p.team_id) filter (where p.team_id is not null))[1]
    into v_total, v_team
  from public.profiles p
  where p.role = 'creator' and p.active = true and p.manager_id = v_manager;

  if v_actor is not null and v_total > 0 then
    insert into public.gx_creator_followup_general_reports
      (manager_id, team_id, generated_by, creator_count, period_start, period_end, generated_at, updated_at)
    values
      (v_manager, v_team, v_actor, v_total, v_start, v_end, now(), now())
    on conflict (manager_id, period_start, period_end)
    do update set
      team_id = excluded.team_id,
      creator_count = excluded.creator_count,
      generated_by = excluded.generated_by,
      updated_at = now();

    update public.gx_creator_followup_general_reports
    set updated_at = now()
    where manager_id = v_manager;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.gx_touch_general_followup_report() from public, anon, authenticated;

-- El informe puede consultarse aunque existan creadores pendientes.
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
  v_team uuid;
  v_start date := date_trunc('month', now() at time zone 'America/Bogota')::date;
  v_end date := (date_trunc('month', now() at time zone 'America/Bogota') + interval '1 month - 1 day')::date;
begin
  if v_uid is null or v_manager is null then
    raise exception 'Solo un manager autenticado puede generar este informe';
  end if;

  select count(*), (array_agg(p.team_id) filter (where p.team_id is not null))[1]
    into v_total, v_team
  from public.profiles p
  where p.role = 'creator' and p.active = true and p.manager_id = v_manager;

  if v_total = 0 then
    raise exception 'No tienes creadores activos asignados para incluir en el informe';
  end if;

  insert into public.gx_creator_followup_general_reports
    (manager_id, team_id, generated_by, creator_count, period_start, period_end)
  values
    (v_manager, v_team, v_uid, v_total, v_start, v_end)
  on conflict (manager_id, period_start, period_end)
  do update set
    team_id = excluded.team_id,
    generated_by = excluded.generated_by,
    creator_count = excluded.creator_count,
    generated_at = now(),
    updated_at = now()
  returning id into v_report_id;

  return v_report_id;
end;
$$;

revoke all on function public.gx_manager_generate_general_followup_report() from public, anon;
grant execute on function public.gx_manager_generate_general_followup_report() to authenticated;

commit;
