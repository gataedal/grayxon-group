begin;

-- Prevent negative or impossible metrics from being persisted even if a client
-- submits a hand-crafted JSON payload instead of using the approved evaluator.
alter table public.gx_creator_followup_evaluations
  add constraint gx_followup_valid_days_nonnegative
    check(valid_live_days is null or valid_live_days>=0),
  add constraint gx_followup_targets_nonnegative
    check((target_valid_days is null or target_valid_days>=0)
      and (target_live_seconds is null or target_live_seconds>=0)),
  add constraint gx_followup_percentages_nonnegative
    check((valid_days_pct is null or valid_days_pct>=0)
      and (live_hours_pct is null or live_hours_pct>=0));

create or replace function public.gx_validate_creator_followup_evaluation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_import public.gx_creator_followup_imports%rowtype;
  v_params jsonb;
  v_expected_days numeric(14,4):=0;
  v_expected_seconds numeric(18,2):=0;
  v_cursor date;
  v_segment_end date;
  v_days integer;
  v_segment_days integer;
  v_hours_pct numeric;
  v_days_pct numeric;
  v_classification text;
  v_min_days integer;
  v_high numeric;
  v_observation numeric;
begin
  select * into v_import from public.gx_creator_followup_imports where id=new.import_id;
  if not found then raise exception 'Importación de seguimiento inexistente'; end if;

  if new.evaluable_days<0
     or (new.valid_live_days is not null and new.valid_live_days<0)
     or (new.live_seconds is not null and new.live_seconds<0)
     or (new.diamonds is not null and new.diamonds<0)
     or (new.target_valid_days is not null and new.target_valid_days<0)
     or (new.target_live_seconds is not null and new.target_live_seconds<0)
     or (new.valid_days_pct is not null and new.valid_days_pct<0)
     or (new.live_hours_pct is not null and new.live_hours_pct<0) then
    raise exception 'Las métricas de evaluación no pueden ser negativas';
  end if;

  if new.evaluated_start_date is not null and
     (new.evaluated_start_date<v_import.selected_start_date or new.evaluated_end_date>v_import.selected_end_date) then
    raise exception 'Las fechas evaluadas están fuera del rango seleccionado';
  end if;

  if new.classification in ('high_risk','observation','on_track','early_review') then
    if new.evaluated_start_date is null or new.evaluated_end_date is null
       or new.valid_live_days is null or new.live_seconds is null then
      raise exception 'Una evaluación clasificada requiere fechas y métricas completas';
    end if;
    v_params:=v_import.parameters_snapshot;
    v_min_days:=coalesce((v_params->>'earlyReviewMinDays')::integer,5);
    v_high:=coalesce((v_params->>'highRiskThresholdPct')::numeric,50);
    v_observation:=coalesce((v_params->>'observationThresholdPct')::numeric,80);
    if v_min_days<0 or v_high<0 or v_high>100 or v_observation<0 or v_observation>100 or v_high>v_observation then
      raise exception 'Los parámetros históricos de evaluación no son válidos';
    end if;
    v_days:=0;
    v_cursor:=new.evaluated_start_date;
    while v_cursor<=new.evaluated_end_date loop
      v_segment_end:=least(v_import.selected_end_date,(date_trunc('month',v_cursor)::date+interval '1 month - 1 day')::date);
      v_segment_days:=(v_segment_end-v_cursor)+1;
      v_days:=v_days+v_segment_days;
      v_expected_days:=v_expected_days+
        coalesce((v_params->>'monthlyValidDays')::numeric,22)*v_segment_days/
        extract(day from (date_trunc('month',v_cursor)+interval '1 month - 1 day'))::numeric;
      v_expected_seconds:=v_expected_seconds+
        coalesce((v_params->>'monthlyLiveHours')::numeric,90)*3600*v_segment_days/
        extract(day from (date_trunc('month',v_cursor)+interval '1 month - 1 day'))::numeric;
      v_cursor:=v_segment_end+1;
    end loop;
    if new.evaluable_days<>v_days then raise exception 'Los días evaluables no coinciden con el rango'; end if;
    if new.target_valid_days is distinct from round(v_expected_days,4)
       or new.target_live_seconds is distinct from round(v_expected_seconds,2) then
      raise exception 'Las metas calculadas no coinciden con los parámetros guardados';
    end if;
    v_days_pct:=case when v_expected_days>0 then new.valid_live_days/v_expected_days*100 else 100 end;
    v_hours_pct:=case when v_expected_seconds>0 then new.live_seconds/v_expected_seconds*100 else 100 end;
    if new.valid_days_pct is distinct from round(v_days_pct,4)
       or new.live_hours_pct is distinct from round(v_hours_pct,4) then
      raise exception 'Los porcentajes no coinciden con las métricas guardadas';
    end if;
    v_classification:=case
      when v_days<v_min_days then 'early_review'
      when v_days_pct<v_high or v_hours_pct<v_high then 'high_risk'
      when v_days_pct<v_observation or v_hours_pct<v_observation then 'observation'
      else 'on_track' end;
    if new.classification<>v_classification then
      raise exception 'La clasificación no coincide con las reglas vigentes para esta importación';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists gx_validate_creator_followup_evaluation on public.gx_creator_followup_evaluations;
create trigger gx_validate_creator_followup_evaluation
before insert on public.gx_creator_followup_evaluations
for each row execute function public.gx_validate_creator_followup_evaluation();

revoke all on function public.gx_validate_creator_followup_evaluation() from public,anon,authenticated;
commit;
