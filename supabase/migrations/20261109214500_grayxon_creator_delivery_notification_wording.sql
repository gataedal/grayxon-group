create or replace function public.gx_notify_task_changes()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    values(new.assigned_to,'internal_task','Nueva tarea asignada',left('Te asignaron la tarea: '||new.title,180),'grayxon-trabajo',new.id::text);
  elsif old.assigned_to is distinct from new.assigned_to then
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    values(new.assigned_to,'internal_task','Nueva asignación',left('Ahora eres responsable de: '||new.title,180),'grayxon-trabajo',new.id::text);
  elsif old.status is distinct from new.status and new.status='submitted' then
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    select p.id,'internal_task_review','Tarea entregada para revisión',left('La tarea "'||new.title||'" está lista para revisión.',180),'grayxon-trabajo',new.id::text
    from public.profiles p where p.role='admin' and p.active is true;
  elsif old.status is distinct from new.status and new.status='blocked' then
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    select p.id,'internal_task_blocked','Tarea bloqueada',left('El responsable marcó como bloqueada la tarea "'||new.title||'".',180),'grayxon-trabajo',new.id::text
    from public.profiles p where p.role='admin' and p.active is true;
  elsif old.status='submitted' and new.status='in_progress' then
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    values(new.assigned_to,'internal_task_update',
      case when new.creator_user_id is not null then 'El solicitante pidió ajustes' else 'Se solicitaron correcciones' end,
      left(case when new.creator_user_id is not null then 'El solicitante devolvió la propuesta "'||new.title||'" con observaciones.' else 'Administración devolvió la tarea "'||new.title||'" con observaciones.' end,180),
      'grayxon-trabajo',new.id::text);
  elsif old.status is distinct from new.status and new.status='completed' then
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    values(new.assigned_to,'internal_task_update',
      case when new.creator_user_id is not null then 'Propuesta aprobada y publicada' else 'Tarea aprobada' end,
      left(case when new.creator_user_id is not null then 'El solicitante aprobó la propuesta "'||new.title||'" y fue enviada al creador.' else 'Administración aprobó la tarea "'||new.title||'".' end,180),
      'grayxon-trabajo',new.id::text);
  end if;
  return new;
end;
$$;
revoke all on function public.gx_notify_task_changes() from public, anon, authenticated;