-- Grayxon Trabajo: seguimiento compartido de solicitudes y archivos privados.
-- Acceso limitado al solicitante y administración; no amplía la visibilidad de otras solicitudes.

create table public.gx_task_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.gx_task_requests(id) on delete cascade,
  author_id uuid not null references public.gx_internal_members(user_id) on delete restrict,
  author_name text not null default 'Integrante',
  body text not null,
  created_at timestamptz not null default now(),
  constraint gx_task_request_comments_body_check check (length(btrim(body)) between 1 and 5000)
);
create index gx_task_request_comments_request_idx
  on public.gx_task_request_comments(request_id, created_at);

create table public.gx_task_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.gx_task_requests(id) on delete cascade,
  uploaded_by uuid not null references public.gx_internal_members(user_id) on delete restrict,
  object_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  constraint gx_task_request_attachments_size_check check (size_bytes is null or size_bytes between 1 and 20971520)
);
create index gx_task_request_attachments_request_idx
  on public.gx_task_request_attachments(request_id, created_at);

alter table public.gx_task_request_comments enable row level security;
alter table public.gx_task_request_attachments enable row level security;

create policy gx_task_request_comments_related_read
on public.gx_task_request_comments for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.gx_task_requests r
    where r.id = request_id and r.requester_id = auth.uid()
      and public.gx_is_internal_member()
  )
);

create policy gx_task_request_comments_related_insert
on public.gx_task_request_comments for insert to authenticated
with check (
  author_id = auth.uid()
  and (
    public.is_admin()
    or exists (
      select 1 from public.gx_task_requests r
      where r.id = request_id and r.requester_id = auth.uid()
        and public.gx_is_internal_member()
    )
  )
);

create policy gx_task_request_attachments_related_read
on public.gx_task_request_attachments for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.gx_task_requests r
    where r.id = request_id and r.requester_id = auth.uid()
      and public.gx_is_internal_member()
  )
);

create policy gx_task_request_attachments_related_insert
on public.gx_task_request_attachments for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    public.is_admin()
    or exists (
      select 1 from public.gx_task_requests r
      where r.id = request_id and r.requester_id = auth.uid()
        and public.gx_is_internal_member()
    )
  )
);

grant select on public.gx_task_request_comments, public.gx_task_request_attachments to authenticated;
revoke insert, update, delete on public.gx_task_request_comments from authenticated;
revoke insert, update, delete on public.gx_task_request_attachments from authenticated;
grant insert (request_id, author_id, body) on public.gx_task_request_comments to authenticated;
grant insert (request_id, uploaded_by, object_path, file_name, mime_type, size_bytes)
  on public.gx_task_request_attachments to authenticated;

create or replace function public.gx_set_request_comment_author_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $gx$
begin
  select display_name into new.author_name
  from public.gx_internal_members
  where user_id = new.author_id;
  new.author_name := coalesce(new.author_name, 'Integrante');
  return new;
end;
$gx$;

create trigger gx_task_request_comments_set_author_name
before insert on public.gx_task_request_comments
for each row execute function public.gx_set_request_comment_author_name();

create or replace function public.gx_notify_request_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $gx$
declare
  v_request public.gx_task_requests%rowtype;
  v_author_name text;
begin
  select * into v_request from public.gx_task_requests where id = new.request_id;
  select display_name into v_author_name from public.gx_internal_members where user_id = new.author_id;

  if public.is_admin() then
    insert into public.notifications(user_id, type, title, message, link_page, link_target)
    values (
      v_request.requester_id, 'internal_request_comment',
      'Nuevo comentario en tu solicitud',
      left(coalesce(v_author_name,'Administración') || ' comentó: ' || new.body, 180),
      'grayxon-trabajo', v_request.id::text
    );
  else
    insert into public.notifications(user_id, type, title, message, link_page, link_target)
    select p.id, 'internal_request_comment',
      'Nuevo comentario en una solicitud',
      left(coalesce(v_author_name,'Un integrante') || ' comentó en la solicitud: ' || v_request.title, 180),
      'grayxon-trabajo', v_request.id::text
    from public.profiles p
    where p.role = 'admin' and p.active is true;
  end if;
  return new;
end;
$gx$;

create trigger gx_task_request_comments_notify
after insert on public.gx_task_request_comments
for each row execute function public.gx_notify_request_comment();

revoke all on function public.gx_set_request_comment_author_name() from public, anon, authenticated;
revoke all on function public.gx_notify_request_comment() from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit)
values ('gx-internal-request-files','gx-internal-request-files',false,20971520)
on conflict (id) do nothing;

create policy gx_internal_request_files_read
on storage.objects for select to authenticated
using (
  bucket_id = 'gx-internal-request-files'
  and (
    public.is_admin()
    or exists (
      select 1 from public.gx_task_requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.requester_id = auth.uid()
        and public.gx_is_internal_member()
    )
  )
);

create policy gx_internal_request_files_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'gx-internal-request-files'
  and (
    public.is_admin()
    or exists (
      select 1 from public.gx_task_requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.requester_id = auth.uid()
        and public.gx_is_internal_member()
    )
  )
);

create policy gx_internal_request_files_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'gx-internal-request-files'
  and (
    public.is_admin()
    or exists (
      select 1 from public.gx_task_requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.requester_id = auth.uid()
        and public.gx_is_internal_member()
    )
  )
);
