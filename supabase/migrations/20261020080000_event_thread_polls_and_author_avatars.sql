-- Encuestas y fotos de autor limitadas al Hilo oficial de Eventos.
-- No modifica Comunicados ni el sistema general de encuestas.

create table if not exists public.gx_event_post_polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gx_events(id) on delete cascade,
  post_id uuid not null unique references public.gx_event_posts(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.gx_event_post_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.gx_event_post_polls(id) on delete cascade,
  option_text text not null check (char_length(btrim(option_text)) between 1 and 200),
  position integer not null check (position between 1 and 4),
  created_at timestamptz not null default now(),
  unique (poll_id, position),
  unique (id, poll_id)
);

create table if not exists public.gx_event_post_poll_votes (
  poll_id uuid not null references public.gx_event_post_polls(id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id),
  foreign key (option_id, poll_id)
    references public.gx_event_post_poll_options(id, poll_id) on delete cascade
);

alter table public.gx_event_post_polls enable row level security;
alter table public.gx_event_post_poll_options enable row level security;
alter table public.gx_event_post_poll_votes enable row level security;

drop policy if exists gx_event_post_polls_select on public.gx_event_post_polls;
create policy gx_event_post_polls_select on public.gx_event_post_polls
for select to authenticated
using (public.gx_event_can_view(event_id));

drop policy if exists gx_event_post_poll_options_select on public.gx_event_post_poll_options;
create policy gx_event_post_poll_options_select on public.gx_event_post_poll_options
for select to authenticated
using (
  exists (
    select 1 from public.gx_event_post_polls q
    where q.id = poll_id and public.gx_event_can_view(q.event_id)
  )
);

drop policy if exists gx_event_post_poll_votes_select_own on public.gx_event_post_poll_votes;
create policy gx_event_post_poll_votes_select_own on public.gx_event_post_poll_votes
for select to authenticated
using (user_id = auth.uid() and exists (
  select 1 from public.gx_event_post_polls q
  where q.id = poll_id and public.gx_event_can_view(q.event_id)
));

drop policy if exists gx_event_post_poll_votes_insert_valid on public.gx_event_post_poll_votes;
create policy gx_event_post_poll_votes_insert_valid on public.gx_event_post_poll_votes
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.gx_event_post_polls q
    where q.id = poll_id
      and public.gx_event_can_view(q.event_id)
      and (q.closes_at is null or q.closes_at > now())
  )
  and exists (
    select 1 from public.gx_event_post_poll_options o
    where o.id = option_id and o.poll_id = gx_event_post_poll_votes.poll_id
  )
);

drop policy if exists gx_event_post_poll_votes_update_own on public.gx_event_post_poll_votes;
create policy gx_event_post_poll_votes_update_own on public.gx_event_post_poll_votes
for update to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.gx_event_post_polls q
    where q.id = poll_id
      and public.gx_event_can_view(q.event_id)
      and (q.closes_at is null or q.closes_at > now())
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.gx_event_post_polls q
    where q.id = poll_id
      and public.gx_event_can_view(q.event_id)
      and (q.closes_at is null or q.closes_at > now())
  )
  and exists (
    select 1 from public.gx_event_post_poll_options o
    where o.id = option_id and o.poll_id = gx_event_post_poll_votes.poll_id
  )
);

grant select on public.gx_event_post_polls, public.gx_event_post_poll_options to authenticated;
grant select, insert, update on public.gx_event_post_poll_votes to authenticated;

create or replace function public.gx_event_thread_author_avatars(p_event_id uuid)
returns table(user_id uuid, avatar_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct ep.user_id, nullif(pd.avatar_url, '')
  from public.gx_event_posts ep
  left join public.profile_details pd on pd.user_id = ep.user_id
  where ep.event_id = p_event_id
    and auth.uid() is not null
    and public.gx_event_can_view(p_event_id);
$$;

revoke all on function public.gx_event_thread_author_avatars(uuid) from public;
grant execute on function public.gx_event_thread_author_avatars(uuid) to authenticated;

create or replace function public.gx_event_post_poll_summary(p_event_id uuid)
returns table(
  poll_id uuid,
  option_id uuid,
  option_text text,
  option_position integer,
  vote_count bigint,
  my_option_id uuid,
  closes_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select q.id,
         o.id,
         o.option_text,
         o.position,
         count(v.user_id)::bigint,
         mine.option_id,
         q.closes_at
  from public.gx_event_post_polls q
  join public.gx_event_post_poll_options o on o.poll_id = q.id
  left join public.gx_event_post_poll_votes v
    on v.poll_id = q.id and v.option_id = o.id
  left join public.gx_event_post_poll_votes mine
    on mine.poll_id = q.id and mine.user_id = auth.uid()
  where q.event_id = p_event_id
    and auth.uid() is not null
    and public.gx_event_can_view(p_event_id)
  group by q.id, q.created_at, o.id, o.option_text, o.position, mine.option_id, q.closes_at
  order by q.created_at desc, o.position;
$$;

revoke all on function public.gx_event_post_poll_summary(uuid) from public;
grant execute on function public.gx_event_post_poll_summary(uuid) to authenticated;

create or replace function public.gx_event_create_poll_post(
  p_event_id uuid,
  p_body text,
  p_link_url text,
  p_attachments jsonb,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post_id uuid;
  v_poll_id uuid;
  v_event_owner uuid;
  v_role text;
  v_options text[];
  v_option text;
  v_position integer := 0;
  v_distinct integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para crear una encuesta.';
  end if;

  select role into v_role
  from public.profiles
  where id = auth.uid() and active is true;

  if v_role is null then
    raise exception 'La cuenta no está activa.';
  end if;

  select created_by into v_event_owner
  from public.gx_events
  where id = p_event_id;

  if not found then
    raise exception 'El evento no existe.';
  end if;

  if v_role <> 'admin' and v_event_owner <> auth.uid() then
    raise exception 'Solo administración o el responsable del evento puede publicar una encuesta.';
  end if;

  if nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'Escribe la pregunta de la encuesta.';
  end if;

  v_options := array(
    select btrim(x)
    from unnest(coalesce(p_options, array[]::text[])) with ordinality as opt(x, ord)
    where nullif(btrim(x), '') is not null
    order by ord
  );

  if cardinality(v_options) < 2 or cardinality(v_options) > 4 then
    raise exception 'La encuesta debe tener entre 2 y 4 opciones.';
  end if;

  select count(distinct lower(x)) into v_distinct from unnest(v_options) as opt(x);
  if v_distinct <> cardinality(v_options) then
    raise exception 'Las opciones de la encuesta no pueden repetirse.';
  end if;

  insert into public.gx_event_posts(event_id, user_id, parent_id, body, link_url, attachments)
  values (p_event_id, auth.uid(), null, btrim(p_body), nullif(btrim(coalesce(p_link_url, '')), ''), coalesce(p_attachments, '[]'::jsonb))
  returning id into v_post_id;

  insert into public.gx_event_post_polls(event_id, post_id, created_by)
  values (p_event_id, v_post_id, auth.uid())
  returning id into v_poll_id;

  foreach v_option in array v_options loop
    v_position := v_position + 1;
    insert into public.gx_event_post_poll_options(poll_id, option_text, position)
    values (v_poll_id, v_option, v_position);
  end loop;

  return v_post_id;
end;
$$;

revoke all on function public.gx_event_create_poll_post(uuid, text, text, jsonb, text[]) from public;
grant execute on function public.gx_event_create_poll_post(uuid, text, text, jsonb, text[]) to authenticated;
