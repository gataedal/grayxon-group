-- Keep the privileged lookup outside the exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.gx_announcement_author_profiles(p_author_ids uuid[])
returns table (
  author_id uuid,
  full_name text,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public, auth
as $function$
  select p.id, p.full_name, p.username, d.avatar_url
  from public.profiles p
  left join public.profile_details d on d.user_id = p.id
  where auth.uid() is not null
    and p.id = any(coalesce(p_author_ids, array[]::uuid[]))
    and exists (
      select 1
      from public.announcements a
      where a.author_id = p.id
        and (a.author_id = auth.uid() or public.grayxon_announcement_visible(a.id))
    );
$function$;

revoke all on function private.gx_announcement_author_profiles(uuid[]) from public, anon;
grant execute on function private.gx_announcement_author_profiles(uuid[]) to authenticated;

-- PostgREST calls this public wrapper; it delegates to the scoped private lookup.
create or replace function public.gx_announcement_author_profiles(p_author_ids uuid[])
returns table (
  author_id uuid,
  full_name text,
  username text,
  avatar_url text
)
language sql
stable
security invoker
set search_path = public, private, auth
as $function$
  select * from private.gx_announcement_author_profiles(p_author_ids);
$function$;

revoke all on function public.gx_announcement_author_profiles(uuid[]) from public, anon;
grant execute on function public.gx_announcement_author_profiles(uuid[]) to authenticated;
