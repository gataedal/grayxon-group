begin;

-- La autorización histórica sigue la asignación ACTUAL del creador.
-- manager_id se conserva en cada registro como dato de auditoría, no como permiso.

drop policy if exists gx_followup_imports_read on public.gx_creator_followup_imports;
create policy gx_followup_imports_read on public.gx_creator_followup_imports
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.gx_creator_followup_evaluations e
    join public.profiles c on c.id=e.creator_user_id
    where e.import_id=gx_creator_followup_imports.id
      and c.role='creator'
      and c.manager_id=public.current_manager_id()
  )
);

drop policy if exists gx_followup_contacts_read on public.gx_creator_followup_contacts;
create policy gx_followup_contacts_read on public.gx_creator_followup_contacts
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.profiles c
    where c.id=creator_user_id and c.role='creator'
      and c.manager_id=public.current_manager_id()
  )
);

drop policy if exists gx_followup_notes_read on public.gx_creator_followup_notes;
create policy gx_followup_notes_read on public.gx_creator_followup_notes
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.profiles c
    where c.id=creator_user_id and c.role='creator'
      and c.manager_id=public.current_manager_id()
  )
);

drop policy if exists gx_action_plans_read on public.gx_creator_action_plans;
create policy gx_action_plans_read on public.gx_creator_action_plans
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.profiles c
    where c.id=creator_user_id and c.role='creator'
      and c.manager_id=public.current_manager_id()
  )
);

drop policy if exists gx_action_plan_updates_read on public.gx_creator_action_plan_updates;
create policy gx_action_plan_updates_read on public.gx_creator_action_plan_updates
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.gx_creator_action_plans p
    join public.profiles c on c.id=p.creator_user_id
    where p.id=plan_id and c.role='creator'
      and c.manager_id=public.current_manager_id()
  )
);

drop policy if exists gx_followup_reminders_read on public.gx_creator_followup_reminders;
create policy gx_followup_reminders_read on public.gx_creator_followup_reminders
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.profiles c
    where c.id=creator_user_id and c.role='creator'
      and c.manager_id=public.current_manager_id()
  )
);

-- El nuevo manager puede operar los planes vigentes de su equipo aunque el
-- manager_id histórico del plan corresponda al responsable anterior.
drop policy if exists gx_action_plans_update on public.gx_creator_action_plans;
create policy gx_action_plans_update on public.gx_creator_action_plans
for update to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.profiles c
    where c.id=creator_user_id and c.role='creator'
      and c.manager_id=public.current_manager_id()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.profiles c
    where c.id=creator_user_id and c.role='creator'
      and c.manager_id=public.current_manager_id()
  )
);

-- La hoja original puede contener datos de otros creadores/equipos.
-- Por seguridad, solo su uploader y administración pueden descargarla.
drop policy if exists gx_followup_storage_read on storage.objects;
create policy gx_followup_storage_read on storage.objects
for select to authenticated
using (
  bucket_id='gx-creator-followup-reports'
  and public.is_admin()
);

-- Un avance "approved" solo puede entrar mediante la RPC SECURITY DEFINER.
-- Los INSERT directos autenticados quedan limitados a borradores/propuestas.
drop policy if exists gx_action_plan_updates_insert on public.gx_creator_action_plan_updates;
create policy gx_action_plan_updates_insert on public.gx_creator_action_plan_updates
for insert to authenticated
with check (
  status in ('draft','pending_manager_review')
  and exists (
    select 1
    from public.gx_creator_action_plans p
    join public.profiles c on c.id=p.creator_user_id
    where p.id=plan_id and c.role='creator'
      and (
        public.is_admin()
        or c.manager_id=public.current_manager_id()
      )
  )
);

-- Validación relacional en base de datos: nunca se permite enlazar
-- una nota/contacto/recordatorio/evaluación de otro creador.
create or replace function public.gx_validate_followup_creator_references()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_creator_id uuid;
begin
  if tg_table_name='gx_creator_followup_contacts' then
    if new.evaluation_id is not null and not exists (
      select 1 from public.gx_creator_followup_evaluations e
      where e.id=new.evaluation_id and e.creator_user_id=new.creator_user_id
    ) then
      raise exception 'La evaluación no pertenece al creador del contacto';
    end if;
  elsif tg_table_name='gx_creator_followup_notes' then
    if new.evaluation_id is not null and not exists (
      select 1 from public.gx_creator_followup_evaluations e
      where e.id=new.evaluation_id and e.creator_user_id=new.creator_user_id
    ) then
      raise exception 'La evaluación no pertenece al creador de la nota';
    end if;
    if new.contact_id is not null and not exists (
      select 1 from public.gx_creator_followup_contacts c
      where c.id=new.contact_id and c.creator_user_id=new.creator_user_id
    ) then
      raise exception 'El contacto no pertenece al creador de la nota';
    end if;
  elsif tg_table_name='gx_creator_followup_reminders' then
    if new.evaluation_id is not null and not exists (
      select 1 from public.gx_creator_followup_evaluations e
      where e.id=new.evaluation_id and e.creator_user_id=new.creator_user_id
    ) then
      raise exception 'La evaluación no pertenece al creador del recordatorio';
    end if;
    if new.contact_id is not null and not exists (
      select 1 from public.gx_creator_followup_contacts c
      where c.id=new.contact_id and c.creator_user_id=new.creator_user_id
    ) then
      raise exception 'El contacto no pertenece al creador del recordatorio';
    end if;
  elsif tg_table_name='gx_creator_action_plan_updates' then
    select creator_user_id into v_creator_id
    from public.gx_creator_action_plans where id=new.plan_id;
    if not found then
      raise exception 'El plan asociado no existe';
    end if;
    if new.evaluation_id is not null and not exists (
      select 1 from public.gx_creator_followup_evaluations e
      where e.id=new.evaluation_id and e.creator_user_id=v_creator_id
    ) then
      raise exception 'La evaluación no pertenece al creador del plan';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists gx_validate_followup_contact_refs on public.gx_creator_followup_contacts;
create trigger gx_validate_followup_contact_refs
before insert or update of creator_user_id,evaluation_id
on public.gx_creator_followup_contacts
for each row execute function public.gx_validate_followup_creator_references();

drop trigger if exists gx_validate_followup_note_refs on public.gx_creator_followup_notes;
create trigger gx_validate_followup_note_refs
before insert or update of creator_user_id,evaluation_id,contact_id
on public.gx_creator_followup_notes
for each row execute function public.gx_validate_followup_creator_references();

drop trigger if exists gx_validate_followup_reminder_refs on public.gx_creator_followup_reminders;
create trigger gx_validate_followup_reminder_refs
before insert or update of creator_user_id,evaluation_id,contact_id
on public.gx_creator_followup_reminders
for each row execute function public.gx_validate_followup_creator_references();

drop trigger if exists gx_validate_action_plan_update_refs on public.gx_creator_action_plan_updates;
create trigger gx_validate_action_plan_update_refs
before insert or update of plan_id,evaluation_id
on public.gx_creator_action_plan_updates
for each row execute function public.gx_validate_followup_creator_references();

-- La RPC valida la asignación actual del creador; no exige que el manager_id
-- histórico del plan coincida con el manager actual.
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
