begin;
create table public.gx_creator_followup_parameters (
 id uuid primary key default gen_random_uuid(), version integer not null unique check(version>0),
 monthly_live_hours numeric(8,2) not null check(monthly_live_hours>=0),
 monthly_valid_days numeric(8,2) not null check(monthly_valid_days>=0),
 early_review_min_evaluable_days integer not null check(early_review_min_evaluable_days>=0),
 high_risk_threshold_pct numeric(5,2) not null check(high_risk_threshold_pct between 0 and 100),
 observation_threshold_pct numeric(5,2) not null check(observation_threshold_pct between 0 and 100),
 consistency_hours_per_day numeric(5,2) not null check(consistency_hours_per_day>=0),
 consistency_days_per_week integer not null check(consistency_days_per_week between 0 and 7),
 timezone text not null default 'America/Bogota', active boolean not null default true,
 created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create unique index gx_followup_one_active_parameters on public.gx_creator_followup_parameters(active) where active;
insert into public.gx_creator_followup_parameters(version,monthly_live_hours,monthly_valid_days,early_review_min_evaluable_days,high_risk_threshold_pct,observation_threshold_pct,consistency_hours_per_day,consistency_days_per_week)
values(1,90,22,5,50,80,2.5,6) on conflict(version) do nothing;

create table public.gx_creator_followup_imports (
 id uuid primary key default gen_random_uuid(), uploaded_by uuid not null references auth.users(id),
 manager_id uuid references public.managers(id), team_id uuid references public.teams(id),
 file_name text not null check(length(btrim(file_name)) between 1 and 255),
 storage_bucket text not null default 'gx-creator-followup-reports' check(storage_bucket='gx-creator-followup-reports'),
 storage_path text not null unique, file_sha256 text not null check(file_sha256 ~ '^[a-f0-9]{64}$'),
 selected_start_date date not null, selected_end_date date not null,
 source_start_date date, source_end_date date,
 source_granularity text not null check(source_granularity in ('daily','period_aggregate','unknown')),
 status text not null default 'processed' check(status in ('uploaded','processing','processed','needs_daily_data','failed','superseded')),
 parameters_snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 processed_at timestamptz, error_summary text, check(selected_start_date<=selected_end_date),
 check(source_start_date is null or source_end_date is null or source_start_date<=source_end_date)
);
create unique index gx_followup_import_dedupe on public.gx_creator_followup_imports(uploaded_by,file_sha256,selected_start_date,selected_end_date);

create table public.gx_creator_followup_evaluations (
 id uuid primary key default gen_random_uuid(), import_id uuid not null references public.gx_creator_followup_imports(id),
 creator_user_id uuid not null references public.profiles(id), creator_username_snapshot text not null,
 team_id_snapshot uuid references public.teams(id), manager_id_snapshot uuid references public.managers(id),
 join_date_snapshot date, evaluated_start_date date, evaluated_end_date date,
 evaluable_days integer not null default 0 check(evaluable_days>=0),
 valid_live_days numeric(8,2), live_seconds bigint check(live_seconds is null or live_seconds>=0),
 diamonds bigint check(diamonds is null or diamonds>=0), target_valid_days numeric(10,4),
 target_live_seconds numeric(14,2), valid_days_pct numeric(10,4), live_hours_pct numeric(10,4),
 classification text not null check(classification in ('high_risk','observation','on_track','early_review','not_evaluable','needs_daily_data')),
 raw_metrics jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 unique(import_id,creator_user_id), check(evaluated_start_date is null or evaluated_end_date is null or evaluated_start_date<=evaluated_end_date)
);
create index gx_followup_evaluations_creator_date on public.gx_creator_followup_evaluations(creator_user_id,created_at desc);

create table public.gx_creator_followup_contacts (
 id uuid primary key default gen_random_uuid(), creator_user_id uuid not null references public.profiles(id),
 manager_id uuid not null references public.managers(id), evaluation_id uuid references public.gx_creator_followup_evaluations(id),
 contact_status text not null default 'pending_contact' check(contact_status in ('pending_contact','initiated','confirmed','pending_response','responded')),
 channel text not null default 'whatsapp', message_text text, opened_at timestamptz, confirmed_at timestamptz,
 responded_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.gx_creator_followup_notes (
 id uuid primary key default gen_random_uuid(), creator_user_id uuid not null references public.profiles(id),
 manager_id uuid not null references public.managers(id), evaluation_id uuid references public.gx_creator_followup_evaluations(id),
 contact_id uuid references public.gx_creator_followup_contacts(id),
 note_type text not null check(note_type in ('observation','commitment','response','review')),
 body text not null check(length(btrim(body)) between 1 and 5000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), edited_by uuid references auth.users(id)
);
create table public.gx_creator_action_plans (
 id uuid primary key default gen_random_uuid(), creator_user_id uuid not null references public.profiles(id),
 manager_id uuid not null references public.managers(id), title text not null check(length(btrim(title)) between 2 and 180),
 objective text not null check(length(btrim(objective)) between 2 and 5000), success_criteria text,
 status text not null default 'active' check(status in ('active','paused','completed','cancelled')),
 start_date date not null default current_date, target_date date,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), check(target_date is null or target_date>=start_date)
);
create table public.gx_creator_action_plan_updates (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.gx_creator_action_plans(id),
 evaluation_id uuid references public.gx_creator_followup_evaluations(id),
 progress_summary text not null check(length(btrim(progress_summary)) between 1 and 5000),
 proposed_changes text, status text not null default 'draft' check(status in ('draft','pending_manager_review','approved','rejected')),
 created_at timestamptz not null default now(), reviewed_by uuid references auth.users(id), reviewed_at timestamptz, review_note text
);
create table public.gx_creator_followup_reminders (
 id uuid primary key default gen_random_uuid(), creator_user_id uuid not null references public.profiles(id),
 manager_id uuid not null references public.managers(id), contact_id uuid references public.gx_creator_followup_contacts(id),
 evaluation_id uuid references public.gx_creator_followup_evaluations(id), scheduled_at timestamptz not null,
 timezone text not null default 'America/Bogota',
 status text not null default 'pending' check(status in ('pending','responded','rescheduled','no_response','under_review','completed','cancelled')),
 note text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index gx_followup_reminders_due on public.gx_creator_followup_reminders(scheduled_at) where status='pending';

alter table public.gx_creator_followup_imports enable row level security;
alter table public.gx_creator_followup_evaluations enable row level security;
alter table public.gx_creator_followup_parameters enable row level security;
alter table public.gx_creator_followup_contacts enable row level security;
alter table public.gx_creator_followup_notes enable row level security;
alter table public.gx_creator_action_plans enable row level security;
alter table public.gx_creator_action_plan_updates enable row level security;
alter table public.gx_creator_followup_reminders enable row level security;

create policy gx_followup_imports_read on public.gx_creator_followup_imports for select to authenticated using(is_admin() or manager_id=current_manager_id());
create policy gx_followup_evaluations_read on public.gx_creator_followup_evaluations for select to authenticated using(is_admin() or exists(select 1 from public.profiles p where p.id=creator_user_id and p.role='creator' and p.manager_id=current_manager_id()));
create policy gx_followup_parameters_read on public.gx_creator_followup_parameters for select to authenticated using(is_admin() or current_manager_id() is not null);
create policy gx_followup_contacts_read on public.gx_creator_followup_contacts for select to authenticated using(is_admin() or manager_id=current_manager_id());
create policy gx_followup_notes_read on public.gx_creator_followup_notes for select to authenticated using(is_admin() or manager_id=current_manager_id());
create policy gx_action_plans_read on public.gx_creator_action_plans for select to authenticated using(is_admin() or manager_id=current_manager_id());
create policy gx_action_plan_updates_read on public.gx_creator_action_plan_updates for select to authenticated using(is_admin() or exists(select 1 from public.gx_creator_action_plans p where p.id=plan_id and p.manager_id=current_manager_id()));
create policy gx_followup_reminders_read on public.gx_creator_followup_reminders for select to authenticated using(is_admin() or manager_id=current_manager_id());

revoke all on public.gx_creator_followup_imports,public.gx_creator_followup_evaluations,public.gx_creator_followup_parameters,public.gx_creator_followup_contacts,public.gx_creator_followup_notes,public.gx_creator_action_plans,public.gx_creator_action_plan_updates,public.gx_creator_followup_reminders from anon,authenticated;
grant select on public.gx_creator_followup_imports,public.gx_creator_followup_evaluations,public.gx_creator_followup_parameters,public.gx_creator_followup_contacts,public.gx_creator_followup_notes,public.gx_creator_action_plans,public.gx_creator_action_plan_updates,public.gx_creator_followup_reminders to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gx-creator-followup-reports','gx-creator-followup-reports',false,20971520,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'])
on conflict(id) do nothing;
do $
begin
 if not exists(select 1 from storage.buckets where id='gx-creator-followup-reports' and public=false and file_size_limit=20971520 and allowed_mime_types @> array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel']::text[]) then
  raise exception 'El bucket gx-creator-followup-reports existe con una configuración incompatible';
 end if;
end $;
create policy gx_followup_storage_upload on storage.objects for insert to authenticated with check(bucket_id='gx-creator-followup-reports' and (storage.foldername(name))[1]=auth.uid()::text and (is_admin() or current_manager_id() is not null));
create policy gx_followup_storage_read on storage.objects for select to authenticated using(bucket_id='gx-creator-followup-reports' and (is_admin() or current_manager_id() is not null));

create or replace function public.gx_save_creator_followup_import(
 p_file_name text,p_storage_path text,p_file_sha256 text,p_selected_start date,p_selected_end date,
 p_source_start date,p_source_end date,p_granularity text,p_evaluations jsonb
) returns uuid language plpgsql security definer set search_path=public,storage,auth as $$
declare
 v_uid uuid:=auth.uid(); v_manager uuid:=public.current_manager_id(); v_admin boolean:=public.is_admin();
 v_id uuid; v_params jsonb; v_row jsonb; v_profile public.profiles%rowtype; v_saved integer;
begin
 if v_uid is null or (not v_admin and v_manager is null) then raise exception 'Acceso no autorizado'; end if;
 if p_file_name is null or length(btrim(p_file_name)) not between 1 and 255 then raise exception 'Nombre de archivo inválido'; end if;
 if p_file_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Hash SHA-256 inválido'; end if;
 if p_selected_start is null or p_selected_end is null or p_selected_start>p_selected_end then raise exception 'Periodo inválido'; end if;
 if p_granularity is null or p_granularity not in ('daily','period_aggregate','unknown') then raise exception 'Granularidad inválida'; end if;
 if jsonb_typeof(p_evaluations)<>'array' or jsonb_array_length(p_evaluations)=0 then raise exception 'No hay evaluaciones para guardar'; end if;
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
 insert into public.gx_creator_followup_imports(uploaded_by,manager_id,file_name,storage_path,file_sha256,selected_start_date,selected_end_date,source_start_date,source_end_date,source_granularity,status,parameters_snapshot,processed_at)
 values(v_uid,v_manager,p_file_name,p_storage_path,p_file_sha256,p_selected_start,p_selected_end,p_source_start,p_source_end,p_granularity,
 case when p_granularity='period_aggregate' and (p_source_start is distinct from p_selected_start or p_source_end is distinct from p_selected_end) then 'needs_daily_data' else 'processed' end,v_params,now()) returning id into v_id;
 insert into public.gx_creator_followup_evaluations(import_id,creator_user_id,creator_username_snapshot,team_id_snapshot,manager_id_snapshot,join_date_snapshot,evaluated_start_date,evaluated_end_date,evaluable_days,valid_live_days,live_seconds,diamonds,target_valid_days,target_live_seconds,valid_days_pct,live_hours_pct,classification,raw_metrics)
 select v_id,(e->>'creator_user_id')::uuid,coalesce(e->>'username',''),p.team_id,p.manager_id,nullif(e->>'join_date','')::date,nullif(e->>'evaluated_start','')::date,nullif(e->>'evaluated_end','')::date,
 greatest(coalesce((e->>'evaluable_days')::integer,0),0),nullif(e->>'valid_live_days','')::numeric,nullif(e->>'live_seconds','')::bigint,nullif(e->>'diamonds','')::bigint,nullif(e->>'target_valid_days','')::numeric,nullif(e->>'target_live_seconds','')::numeric,nullif(e->>'valid_days_pct','')::numeric,nullif(e->>'live_hours_pct','')::numeric,e->>'classification',coalesce(e->'raw_metrics','{}'::jsonb)
 from jsonb_array_elements(p_evaluations) e join public.profiles p on p.id=(e->>'creator_user_id')::uuid;
 get diagnostics v_saved=row_count;
 if v_saved<>jsonb_array_length(p_evaluations) then raise exception 'No se guardaron todas las evaluaciones'; end if;
 return v_id;
end $$;
revoke all on function public.gx_save_creator_followup_import(text,text,text,date,date,date,date,text,jsonb) from public,anon;
grant execute on function public.gx_save_creator_followup_import(text,text,text,date,date,date,date,text,jsonb) to authenticated;
commit;