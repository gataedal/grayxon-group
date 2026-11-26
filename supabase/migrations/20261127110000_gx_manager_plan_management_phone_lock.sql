begin;

-- El avance y el estado del plan solo se modifican mediante la RPC atómica.
-- Se evita una actualización directa que pueda omitir el registro de historial.
drop policy if exists gx_action_plans_update on public.gx_creator_action_plans;
revoke update on public.gx_creator_action_plans from authenticated;

-- El manager puede registrar como aplicada una actualización de su propio plan.
-- Se conserva el registro en gx_creator_action_plan_updates como historial.
drop policy if exists gx_action_plan_updates_insert on public.gx_creator_action_plan_updates;
create policy gx_action_plan_updates_insert on public.gx_creator_action_plan_updates
for insert to authenticated
with check (
  exists (
    select 1
    from public.gx_creator_action_plans p
    where p.id=plan_id
      and (
        public.is_admin()
        or (
          p.manager_id=public.current_manager_id()
          and exists (
            select 1 from public.profiles c
            where c.id=p.creator_user_id
              and c.role='creator'
              and c.manager_id=public.current_manager_id()
          )
        )
      )
  )
  and (
    status in ('draft','pending_manager_review')
    or (
      status='approved'
      and reviewed_by=auth.uid()
      and reviewed_at is not null
    )
  )
);

-- El teléfono no se administra desde Seguimiento. Solo administración lo cambia
-- desde los datos del creador en el portal.
revoke all on function public.gx_manager_update_creator_phone(uuid,text) from public,anon,authenticated;
drop function if exists public.gx_manager_update_creator_phone(uuid,text);

commit;
