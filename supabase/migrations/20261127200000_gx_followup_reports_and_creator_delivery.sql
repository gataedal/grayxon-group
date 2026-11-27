begin;

-- Los planes nuevos se guardan primero para el manager y solo aparecen en Mis entregas
-- después de que el manager pulse Enviar. Los planes existentes conservan su visibilidad.
alter table public.gx_creator_action_plans
  add column if not exists sent_to_creator_at timestamptz;

update public.gx_creator_action_plans
set sent_to_creator_at = coalesce(sent_to_creator_at, created_at, now())
where sent_to_creator_at is null;

drop policy if exists gx_action_plans_creator_read on public.gx_creator_action_plans;
create policy gx_action_plans_creator_read
  on public.gx_creator_action_plans
  for select to authenticated
  using (
    creator_user_id = (select auth.uid())
    and status <> 'cancelled'
    and sent_to_creator_at is not null
  );

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

  select count(*),
         count(*) filter (where not exists (
           select 1
           from public.gx_creator_action_plans ap
           where ap.creator_user_id = p.id
             and ap.manager_id = v_manager
             and ap.status <> 'cancelled'
             and ap.created_at >= v_start
             and ap.created_at < (v_end + 1)
         ) and not exists (
           select 1
           from public.gx_creator_followup_notes n
           where n.creator_user_id = p.id
             and n.manager_id = v_manager
             and n.created_at >= v_start
             and n.created_at < (v_end + 1)
         )),
         (array_agg(p.team_id) filter (where p.team_id is not null))[1]
  into v_total, v_missing, v_team
  from public.profiles p
  where p.role = 'creator'
    and p.active = true
    and p.manager_id = v_manager;

  if v_total = 0 then
    raise exception 'No tienes creadores activos asignados para incluir en el informe';
  end if;

  if v_missing > 0 then
    raise exception 'Aún tienes % creador(es) sin seguimiento del mes. Crea un plan de trabajo o reporta sus novedades antes de generar el informe.', v_missing;
  end if;

  insert into public.gx_creator_followup_general_reports
    (manager_id, team_id, generated_by, creator_count, period_start, period_end)
  values
    (v_manager, v_team, v_uid, v_total, v_start, v_end)
  on conflict (manager_id, period_start, period_end)
  do update set team_id=excluded.team_id, generated_by=excluded.generated_by,
    creator_count=excluded.creator_count, generated_at=now(), updated_at=now()
  returning id into v_report_id;

  return v_report_id;
end;
$$;

revoke all on function public.gx_manager_generate_general_followup_report() from public, anon;
grant execute on function public.gx_manager_generate_general_followup_report() to authenticated;

commit;
