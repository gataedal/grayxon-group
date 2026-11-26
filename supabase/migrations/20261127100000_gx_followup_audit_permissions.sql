begin;
drop policy gx_followup_notes_update on public.gx_creator_followup_notes;
drop policy gx_followup_contacts_update on public.gx_creator_followup_contacts;
drop policy gx_action_plans_update on public.gx_creator_action_plans;
drop policy gx_followup_reminders_update on public.gx_creator_followup_reminders;
revoke update on public.gx_creator_followup_contacts,public.gx_creator_action_plans,public.gx_creator_followup_reminders from authenticated;
revoke update on public.gx_creator_followup_notes from authenticated;

drop policy gx_action_plan_updates_insert on public.gx_creator_action_plan_updates;
create policy gx_action_plan_updates_insert on public.gx_creator_action_plan_updates
for insert to authenticated with check (
 status in ('draft','pending_manager_review') and
 exists(select 1 from public.gx_creator_action_plans p where p.id=plan_id and
 (public.is_admin() or p.manager_id=public.current_manager_id()))
);
drop policy gx_action_plan_updates_update on public.gx_creator_action_plan_updates;
create policy gx_action_plan_updates_update on public.gx_creator_action_plan_updates
for update to authenticated using (public.is_admin()) with check (public.is_admin());
commit;