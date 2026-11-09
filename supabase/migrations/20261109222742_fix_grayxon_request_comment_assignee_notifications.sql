-- Ensure request conversation messages notify both the requester and the assigned task member.
-- Keep the existing admin notifications and avoid notifying the author.
create or replace function public.gx_notify_request_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_request public.gx_task_requests%rowtype;
  v_task public.gx_tasks%rowtype;
  v_author_name text;
begin
  select * into v_request
  from public.gx_task_requests
  where id = new.request_id;

  select * into v_task
  from public.gx_tasks
  where source_request_id = new.request_id
  limit 1;

  select display_name into v_author_name
  from public.gx_internal_members
  where user_id = new.author_id;

  if public.is_admin() then
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    select distinct recipients.user_id,
      'internal_request_comment',
      'Nuevo comentario en tu solicitud',
      left(coalesce(v_author_name,'Administración') || ' comentó en: ' || v_request.title,180),
      'grayxon-trabajo',
      v_request.id::text
    from (
      select v_request.requester_id as user_id
      union
      select v_task.assigned_to where v_task.id is not null
    ) recipients
    where recipients.user_id is not null
      and recipients.user_id <> new.author_id;
  else
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    select distinct recipients.user_id,
      'internal_request_comment',
      'Nuevo comentario en una solicitud',
      left(coalesce(v_author_name,'Un integrante') || ' comentó en: ' || v_request.title,180),
      'grayxon-trabajo',
      v_request.id::text
    from (
      select p.id as user_id
      from public.profiles p
      where p.role = 'admin' and p.active is true
      union
      select v_request.requester_id
      union
      select v_task.assigned_to where v_task.id is not null
    ) recipients
    where recipients.user_id is not null
      and recipients.user_id <> new.author_id;
  end if;

  return new;
end;
$function$;