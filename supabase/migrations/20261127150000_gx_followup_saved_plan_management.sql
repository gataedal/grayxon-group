-- Allow the assigned manager (or an administrator) to edit/delete their own plan reminders and delete plans.
drop policy if exists gx_action_plans_delete on public.gx_creator_action_plans;
create policy gx_action_plans_delete
on public.gx_creator_action_plans
for delete
to authenticated
using (
  is_admin()
  or exists (
    select 1 from public.profiles c
    where c.id = gx_creator_action_plans.creator_user_id
      and c.role = 'creator'
      and c.manager_id = current_manager_id()
  )
);

drop policy if exists gx_followup_reminders_update on public.gx_creator_followup_reminders;
create policy gx_followup_reminders_update
on public.gx_creator_followup_reminders
for update
to authenticated
using (
  created_by = auth.uid()
  and (
    is_admin()
    or (
      manager_id = current_manager_id()
      and exists (
        select 1 from public.profiles c
        where c.id = gx_creator_followup_reminders.creator_user_id
          and c.role = 'creator'
          and c.manager_id = current_manager_id()
      )
    )
  )
)
with check (
  created_by = auth.uid()
  and (
    is_admin()
    or (
      manager_id = current_manager_id()
      and exists (
        select 1 from public.profiles c
        where c.id = gx_creator_followup_reminders.creator_user_id
          and c.role = 'creator'
          and c.manager_id = current_manager_id()
      )
    )
  )
);

drop policy if exists gx_followup_reminders_delete on public.gx_creator_followup_reminders;
create policy gx_followup_reminders_delete
on public.gx_creator_followup_reminders
for delete
to authenticated
using (
  created_by = auth.uid()
  and (
    is_admin()
    or (
      manager_id = current_manager_id()
      and exists (
        select 1 from public.profiles c
        where c.id = gx_creator_followup_reminders.creator_user_id
          and c.role = 'creator'
          and c.manager_id = current_manager_id()
      )
    )
  )
);
