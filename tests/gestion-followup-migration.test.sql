do $$
declare
 v_manager_user uuid:='10000000-0000-0000-0000-000000000001';
 v_creator uuid:='20000000-0000-0000-0000-000000000001';
 v_manager_id uuid:='30000000-0000-0000-0000-000000000001';
 v_team_id uuid:='40000000-0000-0000-0000-000000000001';
 v_import uuid;
 v_payload jsonb;
begin
 insert into auth.users(id) values(v_manager_user),(v_creator);
 insert into public.managers(id,user_id,active) values(v_manager_id,v_manager_user,true);
 insert into public.teams(id) values(v_team_id);
 insert into public.profiles(id,role,active,manager_id,team_id,username)
 values(v_manager_user,'manager',true,v_manager_id,v_team_id,'manager_test'),
       (v_creator,'creator',true,v_manager_id,v_team_id,'creator_test');
 insert into storage.objects(bucket_id,name,owner_id)
 values('gx-creator-followup-reports',v_manager_user::text||'/test.xlsx',v_manager_user::text);
 perform set_config('request.jwt.claim.sub',v_manager_user::text,true);
 v_payload:=jsonb_build_array(jsonb_build_object(
  'creator_user_id',v_creator,'username','creator_test','join_date','2026-01-01',
  'evaluated_start','2026-11-01','evaluated_end','2026-11-07','evaluable_days',7,
  'valid_live_days',5,'live_seconds',64800,'diamonds',1000,'target_valid_days',5.1333,
  'target_live_seconds',75600,'valid_days_pct',97.4026,'live_hours_pct',85.7143,
  'classification','on_track','raw_metrics','{}'::jsonb
 ));
 v_import:=public.gx_save_creator_followup_import('test.xlsx',v_manager_user::text||'/test.xlsx',
  repeat('a',64),'2026-11-01','2026-11-07','2026-11-01','2026-11-07','daily',v_payload);
 if not exists(select 1 from public.gx_creator_followup_evaluations where import_id=v_import and creator_user_id=v_creator) then
  raise exception 'Expected evaluation row was not persisted';
 end if;
 if to_regprocedure('public.gx_manager_update_creator_phone(uuid,text)') is not null then
  raise exception 'La RPC de edición de teléfono para managers debe estar eliminada';
 end if;
 -- Add a second creator assigned to another manager; manager A must not read it.
 insert into auth.users(id) values('10000000-0000-0000-0000-000000000002'),('20000000-0000-0000-0000-000000000002');
 insert into public.managers(id,user_id,active) values('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',true);
 insert into public.profiles(id,role,active,manager_id,username)
 values('10000000-0000-0000-0000-000000000002','manager',true,'30000000-0000-0000-0000-000000000002','manager_b'),
       ('20000000-0000-0000-0000-000000000002','creator',true,'30000000-0000-0000-0000-000000000002','creator_b');
 insert into storage.objects(bucket_id,name,owner_id)
 values('gx-creator-followup-reports','10000000-0000-0000-0000-000000000002/foreign.xlsx','10000000-0000-0000-0000-000000000002');
 insert into public.gx_creator_followup_imports(
  uploaded_by,manager_id,file_name,storage_path,file_sha256,selected_start_date,selected_end_date,
  source_start_date,source_end_date,source_granularity,status
 ) values(
  '10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','foreign.xlsx',
  '10000000-0000-0000-0000-000000000002/foreign.xlsx',repeat('f',64),
  '2026-11-01','2026-11-07','2026-11-01','2026-11-07','daily','processed'
 );
 insert into public.gx_creator_action_plans(id,creator_user_id,manager_id,title,objective,created_by)
 values('50000000-0000-0000-0000-000000000001',v_creator,v_manager_id,'Plan test','Objetivo de prueba',v_manager_user);
 insert into public.gx_creator_action_plan_updates(id,plan_id,progress_summary,status)
 values('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Propuesta test','pending_manager_review');
 insert into public.gx_creator_followup_evaluations(
  import_id,creator_user_id,creator_username_snapshot,manager_id_snapshot,
  evaluated_start_date,evaluated_end_date,evaluable_days,valid_live_days,live_seconds,diamonds,
  target_valid_days,target_live_seconds,valid_days_pct,live_hours_pct,classification,raw_metrics
 )
 values(
  v_import,'20000000-0000-0000-0000-000000000002','creator_b','30000000-0000-0000-0000-000000000002',
  '2026-11-01','2026-11-07',7,5,64800,1000,
  5.1333,75600,97.4026,85.7143,'on_track','{}'::jsonb
 );
 -- A manager cannot import a creator assigned to another manager.
 begin
  perform public.gx_save_creator_followup_import('foreign.xlsx',v_manager_user::text||'/test.xlsx',
   repeat('b',64),'2026-11-01','2026-11-07','2026-11-01','2026-11-07','daily',
   jsonb_build_array(jsonb_build_object('creator_user_id','20000000-0000-0000-0000-000000000002','classification','on_track')));
  raise exception 'Cross-team creator import should have failed';
 exception when others then
  if sqlerrm='Cross-team creator import should have failed' then raise; end if;
 end;
 -- Selected dates must be covered by the source file period.
 begin
  perform public.gx_save_creator_followup_import('period.xlsx',v_manager_user::text||'/test.xlsx',
   repeat('c',64),'2026-11-01','2026-11-07','2026-11-02','2026-11-07','daily',v_payload);
  raise exception 'Out-of-source period should have failed';
 exception when others then
  if sqlerrm='Out-of-source period should have failed' then raise; end if;
 end;
 -- Aggregate files cannot be used to evaluate a smaller selected window.
 begin
  perform public.gx_save_creator_followup_import('aggregate.xlsx',v_manager_user::text||'/test.xlsx',
   repeat('d',64),'2026-11-01','2026-11-07','2026-11-01','2026-11-03','period_aggregate',
   jsonb_set(v_payload,'{0,evaluated_end}','"2026-11-03"'::jsonb));
  raise exception 'Partial aggregate evaluation should have failed';
 exception when others then
  if sqlerrm='Partial aggregate evaluation should have failed' then raise; end if;
 end;
 -- Unknown source granularity must not be usable to bypass the daily-data guard.
 begin
  perform public.gx_save_creator_followup_import('unknown.xlsx',v_manager_user::text||'/test.xlsx',
   repeat('e',64),'2026-11-01','2026-11-07',null,null,'unknown',v_payload);
  raise exception 'Unknown source granularity must not permit a classified evaluation';
 exception when others then
  if sqlerrm='Unknown source granularity must not permit a classified evaluation' then raise; end if;
 end;
 begin
  perform public.gx_save_creator_followup_import('test.xlsx',v_manager_user::text||'/test.xlsx',
   repeat('a',64),'2026-11-01','2026-11-07','2026-11-01','2026-11-07','daily',v_payload);
  raise exception 'Duplicate import should have failed';
 exception when others then
  if sqlerrm='Duplicate import should have failed' then raise; end if;
 end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
set role authenticated;
do $$
declare v_count integer; v_rows integer;
begin
 select count(*) into v_count from public.gx_creator_followup_evaluations;
 if v_count<>1 then raise exception 'Manager RLS should expose only the assigned creator; got %',v_count; end if;
 perform public.gx_manager_update_creator_action_plan(
  '50000000-0000-0000-0000-000000000001','Avance registrado por manager',
  'Se actualizó el estado','completed'
 );
 if not exists(select 1 from public.gx_creator_action_plans
   where id='50000000-0000-0000-0000-000000000001' and status='completed') then
  raise exception 'La RPC debe actualizar el estado del plan';
 end if;
 if not exists(select 1 from public.gx_creator_action_plan_updates
   where plan_id='50000000-0000-0000-0000-000000000001'
     and progress_summary='Avance registrado por manager' and status='approved') then
  raise exception 'La RPC debe registrar el avance de forma atómica';
 end if;
 if (select count(*) from storage.objects where bucket_id='gx-creator-followup-reports')<>0 then
  raise exception 'Managers must not read source Excel files';
 end if;
 begin
  update public.profile_details set phone='+573001234567' where user_id='20000000-0000-0000-0000-000000000001';
  raise exception 'Manager must not update creator phone';
 exception when insufficient_privilege then
  null;
 end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
set role authenticated;
do $$
begin
 begin
  perform public.gx_manager_update_creator_action_plan(
   '50000000-0000-0000-0000-000000000001','Intento ajeno',null,'completed'
  );
  raise exception 'Manager B must not update manager A plan';
 exception when others then
  if sqlerrm='Manager B must not update manager A plan' then raise; end if;
 end;
 if (select count(*) from storage.objects where bucket_id='gx-creator-followup-reports')<>0 then
  raise exception 'Managers must not read source Excel files';
 end if;
end $$;
reset role;


-- Crea historial para ambos creadores y comprueba que las referencias cruzadas se rechazan.
insert into public.gx_creator_followup_contacts(
 id,creator_user_id,manager_id,evaluation_id,created_by
) values
 ('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
  (select id from public.gx_creator_followup_evaluations where creator_user_id='20000000-0000-0000-0000-000000000001' limit 1),
  '10000000-0000-0000-0000-000000000001'),
 ('70000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002',
  (select id from public.gx_creator_followup_evaluations where creator_user_id='20000000-0000-0000-0000-000000000002' limit 1),
  '10000000-0000-0000-0000-000000000002');

insert into public.gx_creator_followup_notes(
 creator_user_id,manager_id,evaluation_id,contact_id,note_type,body,created_by
) values (
 '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
 (select id from public.gx_creator_followup_evaluations where creator_user_id='20000000-0000-0000-0000-000000000001' limit 1),
 '70000000-0000-0000-0000-000000000001','observation','Nota histórica de prueba',
 '10000000-0000-0000-0000-000000000001'
);

insert into public.gx_creator_followup_reminders(
 creator_user_id,manager_id,contact_id,evaluation_id,scheduled_at,created_by
) values (
 '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
 '70000000-0000-0000-0000-000000000001',
 (select id from public.gx_creator_followup_evaluations where creator_user_id='20000000-0000-0000-0000-000000000001' limit 1),
 now(),'10000000-0000-0000-0000-000000000001'
);

do $$
begin
 begin
  insert into public.gx_creator_followup_contacts(creator_user_id,manager_id,evaluation_id,created_by)
  values(
   '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   (select id from public.gx_creator_followup_evaluations where creator_user_id='20000000-0000-0000-0000-000000000002' limit 1),
   '10000000-0000-0000-0000-000000000001'
  );
  raise exception 'Cross-creator contact evaluation reference must fail';
 exception when others then
  if sqlerrm='Cross-creator contact evaluation reference must fail' then raise; end if;
 end;
 begin
  insert into public.gx_creator_followup_notes(creator_user_id,manager_id,contact_id,note_type,body,created_by)
  values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   '70000000-0000-0000-0000-000000000002','observation','Referencia cruzada',
   '10000000-0000-0000-0000-000000000001');
  raise exception 'Cross-creator note contact reference must fail';
 exception when others then
  if sqlerrm='Cross-creator note contact reference must fail' then raise; end if;
 end;
 begin
  insert into public.gx_creator_followup_reminders(
   creator_user_id,manager_id,contact_id,scheduled_at,created_by
  ) values(
   '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   '70000000-0000-0000-0000-000000000002',now(),'10000000-0000-0000-0000-000000000001'
  );
  raise exception 'Cross-creator reminder contact reference must fail';
 exception when others then
  if sqlerrm='Cross-creator reminder contact reference must fail' then raise; end if;
 end;
 begin
  insert into public.gx_creator_followup_reminders(
   creator_user_id,manager_id,evaluation_id,scheduled_at,created_by
  ) values(
   '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   (select id from public.gx_creator_followup_evaluations where creator_user_id='20000000-0000-0000-0000-000000000002' limit 1),
   now(),'10000000-0000-0000-0000-000000000001'
  );
  raise exception 'Cross-creator reminder evaluation reference must fail';
 exception when others then
  if sqlerrm='Cross-creator reminder evaluation reference must fail' then raise; end if;
 end;
 begin
  insert into public.gx_creator_action_plan_updates(plan_id,evaluation_id,progress_summary,status)
  values('50000000-0000-0000-0000-000000000001',
   (select id from public.gx_creator_followup_evaluations where creator_user_id='20000000-0000-0000-0000-000000000002' limit 1),
   'Referencia cruzada','draft');
  raise exception 'Cross-creator plan evaluation reference must fail';
 exception when others then
  if sqlerrm='Cross-creator plan evaluation reference must fail' then raise; end if;
 end;
end $$;

-- Al reasignar al creador, el manager anterior pierde todo acceso histórico
-- y el nuevo manager hereda el acceso a las evaluaciones y registros del creador.
update public.profiles
set manager_id='30000000-0000-0000-0000-000000000002'
where id='20000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
set role authenticated;
do $$
begin
 if (select count(*) from public.gx_creator_followup_evaluations)<>0 then
  raise exception 'Previous manager must lose evaluation access after reassignment';
 end if;
 if (select count(*) from public.gx_creator_followup_imports)<>0 then
  raise exception 'Previous manager must lose import metadata access after reassignment';
 end if;
 if (select count(*) from public.gx_creator_followup_contacts)<>0 then
  raise exception 'Previous manager must lose contact history after reassignment';
 end if;
 if (select count(*) from public.gx_creator_followup_notes)<>0 then
  raise exception 'Previous manager must lose note history after reassignment';
 end if;
 if (select count(*) from public.gx_creator_followup_reminders)<>0 then
  raise exception 'Previous manager must lose reminder history after reassignment';
 end if;
 if (select count(*) from public.gx_creator_action_plans)<>0 then
  raise exception 'Previous manager must lose action plan access after reassignment';
 end if;
 begin
  perform public.gx_manager_update_creator_action_plan(
   '50000000-0000-0000-0000-000000000001','Intento del manager anterior',null,'completed'
  );
  raise exception 'Previous manager must not update reassigned creator plan';
 exception when others then
  if sqlerrm='Previous manager must not update reassigned creator plan' then raise; end if;
 end;
end $$;
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
set role authenticated;
do $$
begin
 if (select count(*) from public.gx_creator_followup_evaluations)<>2 then
  raise exception 'Current manager must see historical evaluations for reassigned creators';
 end if;
 if (select count(*) from public.gx_creator_followup_imports)<>2 then
  raise exception 'Current manager must see historical import metadata for assigned creators';
 end if;
 if (select count(*) from public.gx_creator_followup_contacts)<>2 then
  raise exception 'Current manager must see historical contacts for reassigned creators';
 end if;
 if (select count(*) from public.gx_creator_followup_notes)<>1 then
  raise exception 'Current manager must see historical notes for reassigned creators';
 end if;
 if (select count(*) from public.gx_creator_followup_reminders)<>1 then
  raise exception 'Current manager must see historical reminders for reassigned creators';
 end if;
 if (select count(*) from public.gx_creator_action_plans)<>1 then
  raise exception 'Current manager must see historical action plans for reassigned creators';
 end if;
 begin
  insert into public.gx_creator_action_plan_updates(plan_id,progress_summary,status,reviewed_by,reviewed_at)
  values('50000000-0000-0000-0000-000000000001','Bypass directo','approved',auth.uid(),now());
  raise exception 'Direct approved plan update insert must be blocked';
 exception when insufficient_privilege then
  null;
 end;
 perform public.gx_manager_update_creator_action_plan(
  '50000000-0000-0000-0000-000000000001','Avance del nuevo manager',null,'active'
 );
 if not exists(select 1 from public.gx_creator_action_plan_updates
   where plan_id='50000000-0000-0000-0000-000000000001'
     and progress_summary='Avance del nuevo manager' and status='approved') then
  raise exception 'Current manager must update a reassigned creator plan through the RPC';
 end if;
end $$;
reset role;
