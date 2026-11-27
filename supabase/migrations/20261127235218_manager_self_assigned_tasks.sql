drop policy if exists managers_insert_own_tasks on public.manager_tasks;
create policy managers_insert_own_tasks
on public.manager_tasks
for insert
to authenticated
with check (
  manager_id = public.current_manager_id()
  and assigned_by = (select auth.uid())
);
