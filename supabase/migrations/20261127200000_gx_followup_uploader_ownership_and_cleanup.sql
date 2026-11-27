begin;

-- Cada manager puede consultar sus propias cargas aunque el reporte no haya
-- generado evaluaciones vinculadas. Los reportes de otros managers siguen aislados.
drop policy if exists gx_followup_imports_read on public.gx_creator_followup_imports;
create policy gx_followup_imports_read
on public.gx_creator_followup_imports
for select to authenticated
using (
  public.is_admin()
  or uploaded_by=(select auth.uid())
  or exists (
    select 1
    from public.gx_creator_followup_evaluations e
    join public.profiles c on c.id=e.creator_user_id
    where e.import_id=gx_creator_followup_imports.id
      and c.role='creator'
      and c.manager_id=public.current_manager_id()
  )
);

-- La eliminación del mes reconoce tanto la asignación manager_id como la
-- autoría del archivo. La segunda condición solo habilita al uploader a
-- eliminar sus propios reportes; no permite tocar cargas de otros managers.
create or replace function public.gx_manager_delete_followup_month(p_month date)
returns jsonb
language plpgsql
security definer
set search_path=public,storage,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_manager uuid:=public.current_manager_id();
  v_admin boolean:=public.is_admin();
  v_month date:=date_trunc('month',p_month)::date;
  v_next_month date:=(date_trunc('month',p_month)+interval '1 month')::date;
  v_import_ids uuid[]:='{}'::uuid[];
  v_evaluation_ids uuid[]:='{}'::uuid[];
  v_plan_ids uuid[]:='{}'::uuid[];
  v_contact_ids uuid[]:='{}'::uuid[];
  v_storage_paths text[]:='{}'::text[];
  v_deleted_imports integer:=0;
  v_deleted_plans integer:=0;
begin
  if v_uid is null or (not v_admin and v_manager is null) then
    raise exception 'Acceso no autorizado';
  end if;
  if p_month is null then raise exception 'Debes indicar el mes'; end if;

  select coalesce(array_agg(i.id),'{}'::uuid[]),
         coalesce(array_agg(i.storage_path),'{}'::text[])
    into v_import_ids,v_storage_paths
  from public.gx_creator_followup_imports i
  where coalesce(i.source_start_date,i.selected_start_date)>=v_month
    and coalesce(i.source_start_date,i.selected_start_date)<v_next_month
    and (
      v_admin
      or i.manager_id=v_manager
      or i.uploaded_by=v_uid
    );

  if not v_admin and cardinality(v_import_ids)=0 then
    raise exception 'No tienes reportes propios en ese mes para eliminar';
  end if;

  select coalesce(array_agg(e.id),'{}'::uuid[])
    into v_evaluation_ids
  from public.gx_creator_followup_evaluations e
  where e.import_id=any(v_import_ids);

  select coalesce(array_agg(p.id),'{}'::uuid[])
    into v_plan_ids
  from public.gx_creator_action_plans p
  where
    (
      v_admin
      and coalesce(p.source_period_start,p.start_date)>=v_month
      and coalesce(p.source_period_start,p.start_date)<v_next_month
    )
    or
    (
      not v_admin
      and (
        p.manager_id=v_manager
        or exists(
          select 1 from public.profiles c
          where c.id=p.creator_user_id
            and c.role='creator'
            and c.manager_id=v_manager
        )
      )
      and (
        p.source_import_id=any(v_import_ids)
        or (
          coalesce(p.source_period_start,p.start_date)>=v_month
          and coalesce(p.source_period_start,p.start_date)<v_next_month
        )
      )
    );

  select coalesce(array_agg(c.id),'{}'::uuid[])
    into v_contact_ids
  from public.gx_creator_followup_contacts c
  where c.evaluation_id=any(v_evaluation_ids);

  delete from public.gx_creator_followup_reminders r
  where r.action_plan_id=any(v_plan_ids)
     or r.evaluation_id=any(v_evaluation_ids)
     or r.contact_id=any(v_contact_ids);

  delete from public.gx_creator_followup_notes n
  where n.evaluation_id=any(v_evaluation_ids)
     or n.contact_id=any(v_contact_ids);

  delete from public.gx_creator_followup_contacts c
  where c.id=any(v_contact_ids);

  delete from public.gx_creator_action_plan_updates u
  where u.plan_id=any(v_plan_ids)
     or u.evaluation_id=any(v_evaluation_ids);

  delete from public.gx_creator_action_plans p
  where p.id=any(v_plan_ids);
  get diagnostics v_deleted_plans=row_count;

  delete from public.gx_creator_followup_evaluations e
  where e.id=any(v_evaluation_ids);

  delete from public.gx_creator_followup_imports i
  where i.id=any(v_import_ids);
  get diagnostics v_deleted_imports=row_count;

  return jsonb_build_object(
    'month',v_month,
    'deleted_imports',v_deleted_imports,
    'deleted_plans',v_deleted_plans,
    'storage_paths',to_jsonb(v_storage_paths)
  );
end;
$$;

revoke all on function public.gx_manager_delete_followup_month(date) from public,anon;
grant execute on function public.gx_manager_delete_followup_month(date) to authenticated;

commit;