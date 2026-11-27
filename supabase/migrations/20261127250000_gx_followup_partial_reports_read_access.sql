begin;

-- El informe es de solo lectura desde el cliente; RLS mantiene el alcance
-- de administradores y del manager actual del creador.
grant select on public.gx_creator_followup_general_reports to authenticated;
revoke all on public.gx_creator_followup_general_reports from anon;

-- Permite generar el informe parcial del equipo: los creadores pendientes
-- aparecen identificados en la tabla en lugar de bloquear el informe completo.
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
  where p.role = 'creator'
    and p.active = true
    and p.manager_id = v_manager;

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
