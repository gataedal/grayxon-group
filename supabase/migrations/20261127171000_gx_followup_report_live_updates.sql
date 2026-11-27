begin;

create or replace function public.gx_touch_general_followup_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_manager uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'gx_creator_followup_evaluations' then
    v_manager := nullif(v_row->>'manager_id_snapshot','')::uuid;
  elsif tg_table_name = 'gx_creator_action_plan_updates' then
    select manager_id into v_manager
    from public.gx_creator_action_plans
    where id = nullif(v_row->>'plan_id','')::uuid;
  else
    v_manager := nullif(v_row->>'manager_id','')::uuid;
  end if;

  if v_manager is not null then
    update public.gx_creator_followup_general_reports
    set updated_at = now()
    where manager_id = v_manager;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists gx_followup_report_touch_plans on public.gx_creator_action_plans;
create trigger gx_followup_report_touch_plans after insert or update or delete on public.gx_creator_action_plans
for each row execute function public.gx_touch_general_followup_report();

drop trigger if exists gx_followup_report_touch_plan_updates on public.gx_creator_action_plan_updates;
create trigger gx_followup_report_touch_plan_updates after insert or update or delete on public.gx_creator_action_plan_updates
for each row execute function public.gx_touch_general_followup_report();

drop trigger if exists gx_followup_report_touch_notes on public.gx_creator_followup_notes;
create trigger gx_followup_report_touch_notes after insert or update or delete on public.gx_creator_followup_notes
for each row execute function public.gx_touch_general_followup_report();

drop trigger if exists gx_followup_report_touch_contacts on public.gx_creator_followup_contacts;
create trigger gx_followup_report_touch_contacts after insert or update or delete on public.gx_creator_followup_contacts
for each row execute function public.gx_touch_general_followup_report();

drop trigger if exists gx_followup_report_touch_reminders on public.gx_creator_followup_reminders;
create trigger gx_followup_report_touch_reminders after insert or update or delete on public.gx_creator_followup_reminders
for each row execute function public.gx_touch_general_followup_report();

drop trigger if exists gx_followup_report_touch_evaluations on public.gx_creator_followup_evaluations;
create trigger gx_followup_report_touch_evaluations after insert or update or delete on public.gx_creator_followup_evaluations
for each row execute function public.gx_touch_general_followup_report();

drop trigger if exists gx_followup_report_touch_imports on public.gx_creator_followup_imports;
create trigger gx_followup_report_touch_imports after insert or update or delete on public.gx_creator_followup_imports
for each row execute function public.gx_touch_general_followup_report();

commit;
