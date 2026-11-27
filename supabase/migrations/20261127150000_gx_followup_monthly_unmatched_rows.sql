begin;

create table if not exists public.gx_creator_followup_import_unmatched_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.gx_creator_followup_imports(id) on delete cascade,
  creator_username_snapshot text not null check(length(btrim(creator_username_snapshot)) between 1 and 100),
  creator_id_snapshot text,
  reason text not null check(reason in ('agency_left','not_in_portal','ambiguous')),
  source_status text,
  raw_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gx_followup_unmatched_import_idx
  on public.gx_creator_followup_import_unmatched_rows(import_id,reason);

alter table public.gx_creator_followup_import_unmatched_rows enable row level security;

drop policy if exists gx_followup_imports_read on public.gx_creator_followup_imports;
create policy gx_followup_imports_read
  on public.gx_creator_followup_imports
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.gx_creator_followup_evaluations e
      join public.profiles c on c.id=e.creator_user_id
      where e.import_id=gx_creator_followup_imports.id
        and c.role='creator'
        and c.manager_id=public.current_manager_id()
    )
    or (
      uploaded_by=auth.uid()
      and not exists (
        select 1 from public.gx_creator_followup_evaluations e
        where e.import_id=gx_creator_followup_imports.id
      )
    )
  );


drop policy if exists gx_followup_unmatched_read on public.gx_creator_followup_import_unmatched_rows;
create policy gx_followup_unmatched_read
  on public.gx_creator_followup_import_unmatched_rows
  for select to authenticated
  using (
    exists (
      select 1 from public.gx_creator_followup_imports i
      where i.id=import_id and (public.is_admin() or i.manager_id=public.current_manager_id())
    )
  );

revoke all on public.gx_creator_followup_import_unmatched_rows from public,anon,authenticated;
grant select on public.gx_creator_followup_import_unmatched_rows to authenticated;

create or replace function public.gx_save_creator_followup_import_with_unmatched(
 p_file_name text,p_storage_path text,p_file_sha256 text,p_selected_start date,p_selected_end date,
 p_source_start date,p_source_end date,p_granularity text,p_evaluations jsonb,p_unmatched_rows jsonb
) returns uuid
language plpgsql security definer set search_path=public,auth,storage
as $$
declare
 v_uid uuid:=auth.uid();
 v_manager uuid:=public.current_manager_id();
 v_admin boolean:=public.is_admin();
 v_import_id uuid;
 v_params jsonb;
 v_row jsonb;
 v_profile public.profiles%rowtype;
 v_saved integer;
begin
 if v_uid is null or (not v_admin and v_manager is null) then raise exception 'Acceso no autorizado'; end if;
 if p_file_name is null or length(btrim(p_file_name)) not between 1 and 255 then raise exception 'Nombre de archivo inválido'; end if;
 if p_file_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Hash SHA-256 inválido'; end if;
 if p_selected_start is null or p_selected_end is null or p_selected_start>p_selected_end then raise exception 'Periodo inválido'; end if;
 if (p_source_start is null)<>(p_source_end is null) then raise exception 'El periodo de origen está incompleto'; end if;
 if p_source_start is not null and p_source_start>p_source_end then raise exception 'El periodo de origen no es válido'; end if;
 if p_source_start is not null and (p_selected_start<p_source_start or p_selected_end>p_source_end) then raise exception 'El rango elegido está fuera del periodo del archivo'; end if;
 if p_granularity is null or p_granularity not in ('daily','period_aggregate','unknown') then raise exception 'Granularidad inválida'; end if;
 if p_granularity in ('daily','period_aggregate') and p_source_start is null then raise exception 'Falta el periodo de origen del archivo'; end if;
 if jsonb_typeof(p_evaluations)<>'array' or jsonb_typeof(p_unmatched_rows)<>'array' then raise exception 'Los registros del reporte no tienen un formato válido'; end if;
 if jsonb_array_length(p_evaluations)+jsonb_array_length(p_unmatched_rows)=0 then raise exception 'No hay registros para guardar'; end if;
 if split_part(coalesce(p_storage_path,''),'/',1)<>v_uid::text then raise exception 'Ruta de archivo inválida'; end if;
 if not exists(select 1 from storage.objects where bucket_id='gx-creator-followup-reports' and name=p_storage_path and owner_id::text=v_uid::text) then raise exception 'No se encontró un archivo propio subido'; end if;
 select jsonb_build_object('version',version,'monthlyLiveHours',monthly_live_hours,'monthlyValidDays',monthly_valid_days,'earlyReviewMinDays',early_review_min_evaluable_days,'highRiskThresholdPct',high_risk_threshold_pct,'observationThresholdPct',observation_threshold_pct,'consistencyHoursPerDay',consistency_hours_per_day,'consistencyDaysPerWeek',consistency_days_per_week,'timezone',timezone)
 into v_params from public.gx_creator_followup_parameters where active order by version desc limit 1;
 if v_params is null then raise exception 'No hay parámetros activos'; end if;
 if exists(select 1 from public.gx_creator_followup_imports where uploaded_by=v_uid and file_sha256=p_file_sha256 and selected_start_date=p_selected_start and selected_end_date=p_selected_end) then raise exception 'Este archivo y periodo ya fueron importados'; end if;

 for v_row in select value from jsonb_array_elements(p_evaluations) loop
   select * into v_profile from public.profiles where id=(v_row->>'creator_user_id')::uuid;
   if not found or v_profile.role<>'creator' or not v_profile.active then raise exception 'Creador inexistente o inactivo'; end if;
   if not v_admin and v_profile.manager_id is distinct from v_manager then raise exception 'El creador no pertenece a tu equipo'; end if;
   if coalesce(v_row->>'classification','') not in ('high_risk','observation','on_track','early_review','not_evaluable','needs_daily_data') then raise exception 'Clasificación inválida'; end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p_unmatched_rows) loop
   if coalesce(v_row->>'username','')='' then raise exception 'Falta el usuario TikTok de un registro pendiente'; end if;
   if coalesce(v_row->>'reason','') not in ('agency_left','not_in_portal','ambiguous') then raise exception 'Motivo de registro pendiente inválido'; end if;
 end loop;

 insert into public.gx_creator_followup_imports(uploaded_by,manager_id,file_name,storage_path,file_sha256,selected_start_date,selected_end_date,source_start_date,source_end_date,source_granularity,status,parameters_snapshot,processed_at)
 values(v_uid,v_manager,p_file_name,p_storage_path,p_file_sha256,p_selected_start,p_selected_end,p_source_start,p_source_end,p_granularity,
 case when p_granularity='period_aggregate' and (p_source_start is distinct from p_selected_start or p_source_end is distinct from p_selected_end) then 'needs_daily_data' else 'processed' end,v_params,now()) returning id into v_import_id;

 insert into public.gx_creator_followup_evaluations(import_id,creator_user_id,creator_username_snapshot,team_id_snapshot,manager_id_snapshot,join_date_snapshot,evaluated_start_date,evaluated_end_date,evaluable_days,valid_live_days,live_seconds,diamonds,target_valid_days,target_live_seconds,valid_days_pct,live_hours_pct,classification,raw_metrics)
 select v_import_id,(e->>'creator_user_id')::uuid,coalesce(e->>'username',''),p.team_id,p.manager_id,nullif(e->>'join_date','')::date,nullif(e->>'evaluated_start','')::date,nullif(e->>'evaluated_end','')::date,
 greatest(coalesce((e->>'evaluable_days')::integer,0),0),nullif(e->>'valid_live_days','')::numeric,nullif(e->>'live_seconds','')::bigint,nullif(e->>'diamonds','')::bigint,nullif(e->>'target_valid_days','')::numeric,nullif(e->>'target_live_seconds','')::numeric,nullif(e->>'valid_days_pct','')::numeric,nullif(e->>'live_hours_pct','')::numeric,e->>'classification',coalesce(e->'raw_metrics','{}'::jsonb)
 from jsonb_array_elements(p_evaluations) e join public.profiles p on p.id=(e->>'creator_user_id')::uuid;
 get diagnostics v_saved=row_count;
 if v_saved<>jsonb_array_length(p_evaluations) then raise exception 'No se guardaron todas las evaluaciones'; end if;

 insert into public.gx_creator_followup_import_unmatched_rows(import_id,creator_username_snapshot,creator_id_snapshot,reason,source_status,raw_metrics)
 select v_import_id,left(btrim(e->>'username'),100),nullif(left(btrim(coalesce(e->>'creator_id','')),100),''),
 e->>'reason',nullif(left(coalesce(e->>'agency_status',''),500),''),coalesce(e->'raw_metrics','{}'::jsonb)
 from jsonb_array_elements(p_unmatched_rows) e;
 return v_import_id;
end;
$$;

revoke all on function public.gx_save_creator_followup_import_with_unmatched(text,text,text,date,date,date,date,text,jsonb,jsonb) from public,anon;
grant execute on function public.gx_save_creator_followup_import_with_unmatched(text,text,text,date,date,date,date,text,jsonb,jsonb) to authenticated;

commit;
