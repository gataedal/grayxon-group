begin;

-- Actualiza el estado y registra el avance en una sola transacción.
-- SECURITY DEFINER se limita a validar explícitamente admin/manager y pertenencia.
create or replace function public.gx_manager_update_creator_action_plan(
  p_plan_id uuid,
  p_progress_summary text,
  p_proposed_changes text,
  p_new_status text
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_manager uuid:=public.current_manager_id();
  v_admin boolean:=public.is_admin();
  v_plan public.gx_creator_action_plans%rowtype;
  v_update_id uuid;
begin
  if v_uid is null then raise exception 'Acceso no autorizado'; end if;
  if p_progress_summary is null or length(btrim(p_progress_summary)) not between 1 and 5000 then
    raise exception 'El avance debe contener entre 1 y 5000 caracteres';
  end if;
  if p_proposed_changes is not null and length(p_proposed_changes)>5000 then
    raise exception 'La actualización supera el máximo permitido';
  end if;
  if p_new_status is null or p_new_status not in ('active','paused','completed','cancelled') then
    raise exception 'Estado de plan inválido';
  end if;

  select * into v_plan
  from public.gx_creator_action_plans
  where id=p_plan_id
  for update;

  if not found then raise exception 'Plan inexistente'; end if;
  if not v_admin and (
    v_manager is null
    or v_plan.manager_id is distinct from v_manager
    or not exists (
      select 1 from public.profiles c
      where c.id=v_plan.creator_user_id
        and c.role='creator'
        and c.manager_id=v_manager
    )
  ) then
    raise exception 'El plan no pertenece a un creador de tu equipo';
  end if;

  insert into public.gx_creator_action_plan_updates(
    plan_id,progress_summary,proposed_changes,status,reviewed_by,reviewed_at
  ) values (
    p_plan_id,btrim(p_progress_summary),nullif(btrim(p_proposed_changes),''),'approved',v_uid,now()
  ) returning id into v_update_id;

  update public.gx_creator_action_plans
  set status=p_new_status,updated_at=now()
  where id=p_plan_id;

  return v_update_id;
end;
$$;

revoke all on function public.gx_manager_update_creator_action_plan(uuid,text,text,text) from public,anon;
grant execute on function public.gx_manager_update_creator_action_plan(uuid,text,text,text) to authenticated;

commit;
