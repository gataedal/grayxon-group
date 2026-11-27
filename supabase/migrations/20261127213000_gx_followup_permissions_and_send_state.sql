begin;

-- Revert only the automatic backfill from the previous migration.
-- Explicit sends happen after creation, so their timestamps differ.
update public.gx_creator_action_plans
set sent_to_creator_at = null
where sent_to_creator_at = created_at;

-- Administrators may delete any reminder; managers may delete only
-- reminders they created for creators assigned to them.
drop policy if exists gx_followup_reminders_delete on public.gx_creator_followup_reminders;
create policy gx_followup_reminders_delete
  on public.gx_creator_followup_reminders
  for delete to authenticated
  using (
    public.is_admin()
    or (
      created_by = auth.uid()
      and manager_id = public.current_manager_id()
      and exists (
        select 1
        from public.profiles c
        where c.id = gx_creator_followup_reminders.creator_user_id
          and c.role = 'creator'
          and c.manager_id = public.current_manager_id()
      )
    )
  );

commit;
