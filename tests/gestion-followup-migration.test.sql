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
 perform public.gx_manager_update_creator_phone(v_creator,'+573001234567');
 if not exists(select 1 from public.profile_details where user_id=v_creator and phone='+573001234567') then
  raise exception 'Manager phone RPC did not persist the creator phone';
 end if;
 -- Add a second creator assigned to another manager; manager A must not read it.
 insert into auth.users(id) values('10000000-0000-0000-0000-000000000002'),('20000000-0000-0000-0000-000000000002');
 insert into public.managers(id,user_id,active) values('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',true);
 insert into public.profiles(id,role,active,manager_id,username)
 values('10000000-0000-0000-0000-000000000002','manager',true,'30000000-0000-0000-0000-000000000002','manager_b'),
       ('20000000-0000-0000-0000-000000000002','creator',true,'30000000-0000-0000-0000-000000000002','creator_b');
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
   repeat('d',64),'2026-11-01','2026-11-07','2026-11-01','2026-11-03','period_aggregate',v_payload);
  raise exception 'Partial aggregate evaluation should have failed';
 exception when others then
  if sqlerrm='Partial aggregate evaluation should have failed' then raise; end if;
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
 begin
  update public.gx_creator_action_plan_updates set status='approved' where id='60000000-0000-0000-0000-000000000001';
  get diagnostics v_rows=row_count;
  if v_rows<>0 then raise exception 'Manager must not approve an action-plan proposal'; end if;
 end;
end $$;
reset role;
