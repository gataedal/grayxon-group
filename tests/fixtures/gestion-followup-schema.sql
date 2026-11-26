create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,created_at timestamptz default now(),metadata jsonb);
create function storage.foldername(text) returns text[] language sql immutable as $$
 select string_to_array($1,'/')
$$;
create table public.managers(id uuid primary key,user_id uuid,active boolean default true);
create table public.teams(id uuid primary key);
create table public.profiles(id uuid primary key,role text not null,active boolean not null default true,manager_id uuid,team_id uuid,username text);
create function public.current_manager_id() returns uuid language sql stable security definer set search_path=public as $$
 select id from public.managers where user_id=auth.uid() and active limit 1
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active)
$$;
