begin;
drop policy gx_followup_storage_read on storage.objects;
create policy gx_followup_storage_read on storage.objects for select to authenticated using (
 bucket_id='gx-creator-followup-reports' and exists (
  select 1 from public.gx_creator_followup_imports i
  where i.storage_path=name and (public.is_admin() or i.manager_id=public.current_manager_id())
 )
);

create policy gx_followup_contacts_insert on public.gx_creator_followup_contacts
for insert to authenticated with check (
 created_by=auth.uid() and (public.is_admin() or
 (manager_id=public.current_manager_id() and exists(select 1 from public.profiles p where p.id=creator_user_id and p.role='creator' and p.manager_id=public.current_manager_id())))
);
create policy gx_followup_contacts_update on public.gx_creator_followup_contacts
for update to authenticated using(public.is_admin() or manager_id=public.current_manager_id())
with check(public.is_admin() or (manager_id=public.current_manager_id() and exists(select 1 from public.profiles p where p.id=creator_user_id and p.role='creator' and p.manager_id=public.current_manager_id())));

create policy gx_followup_notes_insert on public.gx_creator_followup_notes
for insert to authenticated with check (
 created_by=auth.uid() and (public.is_admin() or
 (manager_id=public.current_manager_id() and exists(select 1 from public.profiles p where p.id=creator_user_id and p.role='creator' and p.manager_id=public.current_manager_id())))
);
create policy gx_followup_notes_update on public.gx_creator_followup_notes
for update to authenticated using(public.is_admin() or manager_id=public.current_manager_id())
with check(public.is_admin() or (manager_id=public.current_manager_id() and exists(select 1 from public.profiles p where p.id=creator_user_id and p.role='creator' and p.manager_id=public.current_manager_id())));

create policy gx_action_plans_insert on public.gx_creator_action_plans
for insert to authenticated with check (
 created_by=auth.uid() and (public.is_admin() or
 (manager_id=public.current_manager_id() and exists(select 1 from public.profiles p where p.id=creator_user_id and p.role='creator' and p.manager_id=public.current_manager_id())))
);
create policy gx_action_plans_update on public.gx_creator_action_plans
for update to authenticated using(public.is_admin() or manager_id=public.current_manager_id())
with check(public.is_admin() or (manager_id=public.current_manager_id() and exists(select 1 from public.profiles p where p.id=creator_user_id and p.role='creator' and p.manager_id=public.current_manager_id())));

create policy gx_action_plan_updates_insert on public.gx_creator_action_plan_updates
for insert to authenticated with check (
 exists(select 1 from public.gx_creator_action_plans p where p.id=plan_id and
 (public.is_admin() or p.manager_id=public.current_manager_id()))
);
create policy gx_action_plan_updates_update on public.gx_creator_action_plan_updates
for update to authenticated using (
 exists(select 1 from public.gx_creator_action_plans p where p.id=plan_id and
 (public.is_admin() or p.manager_id=public.current_manager_id()))
) with check (
 exists(select 1 from public.gx_creator_action_plans p where p.id=plan_id and
 (public.is_admin() or p.manager_id=public.current_manager_id()))
);

create policy gx_followup_reminders_insert on public.gx_creator_followup_reminders
for insert to authenticated with check (
 created_by=auth.uid() and (public.is_admin() or
 (manager_id=public.current_manager_id() and exists(select 1 from public.profiles p where p.id=creator_user_id and p.role='creator' and p.manager_id=public.current_manager_id())))
);
create policy gx_followup_reminders_update on public.gx_creator_followup_reminders
for update to authenticated using(public.is_admin() or manager_id=public.current_manager_id())
with check(public.is_admin() or (manager_id=public.current_manager_id() and exists(select 1 from public.profiles p where p.id=creator_user_id and p.role='creator' and p.manager_id=public.current_manager_id())));

grant insert,update on public.gx_creator_followup_contacts,public.gx_creator_followup_notes,
 public.gx_creator_action_plans,public.gx_creator_action_plan_updates,
 public.gx_creator_followup_reminders to authenticated;
commit;