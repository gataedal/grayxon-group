-- GRAYXON EVENTOS MATRIX v2.2 (aditiva; requiere events_module.sql v1 + events_module_v2.sql v2)
-- Refuerza los hilos oficiales, agrega reacciones, fases/fechas, puntuación abierta,
-- premios por puesto, portada y audiencias seleccionables (usuarios/equipos).
begin;

-- Fases configurables con ventanas exactas de inicio/fin.
create table if not exists public.gx_event_phases (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gx_events(id) on delete cascade,
  phase_number integer not null check (phase_number > 0),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique(event_id,phase_number)
);
create index if not exists gx_event_phases_event_idx on public.gx_event_phases(event_id,phase_number);

-- Link generated battle rounds to the configured phase schedule (when phases are enabled).
alter table public.gx_event_rounds add column if not exists phase_id uuid references public.gx_event_phases(id) on delete set null;
create index if not exists gx_event_rounds_phase_idx on public.gx_event_rounds(event_id,phase_id,round_number);

alter table public.gx_event_missions add column if not exists phase_id uuid references public.gx_event_phases(id) on delete set null;
alter table public.gx_event_missions add column if not exists score_over_target boolean not null default false;
create index if not exists gx_event_missions_phase_idx on public.gx_event_missions(event_id,phase_id,sort_order);

-- Portada elegible y archivos multimedia.
alter table public.gx_event_media add column if not exists is_cover boolean not null default false;
with ranked as (
  select id, row_number() over(partition by event_id order by case when mime_type like 'image/%' then 0 else 1 end, sort_order, created_at) as rn
  from public.gx_event_media
)
update public.gx_event_media m set is_cover=true from ranked r where m.id=r.id and r.rn=1
  and not exists(select 1 from public.gx_event_media c where c.event_id=m.event_id and c.is_cover=true);
create unique index if not exists gx_event_media_one_cover_idx on public.gx_event_media(event_id) where is_cover=true;

-- Premios independientes por puesto; admite varios ítems para el mismo puesto.
create table if not exists public.gx_event_prizes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gx_events(id) on delete cascade,
  placement integer not null check (placement > 0),
  prize_title text not null,
  prize_description text,
  coins numeric(14,2) check (coins is null or coins >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gx_event_prizes_event_idx on public.gx_event_prizes(event_id,placement,sort_order);

-- Audiencia de selección mixta: perfiles concretos y/o equipos.
alter table public.gx_events drop constraint if exists gx_events_audience_check;
alter table public.gx_events add constraint gx_events_audience_check check (audience in ('all','creators','managers','selected'));
create table if not exists public.gx_event_audience_targets (
  event_id uuid not null references public.gx_events(id) on delete cascade,
  target_type text not null check (target_type in ('user','team')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(event_id,target_type,target_id)
);
create index if not exists gx_event_audience_targets_target_idx on public.gx_event_audience_targets(target_type,target_id,event_id);

-- Reacciones simples: los espectadores reaccionan, solo el autor del evento publica.
create table if not exists public.gx_event_post_reactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gx_events(id) on delete cascade,
  post_id uuid not null references public.gx_event_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('like','heart','fire','clap')),
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);
create index if not exists gx_event_post_reactions_post_idx on public.gx_event_post_reactions(post_id,reaction);

alter table public.gx_event_phases enable row level security;
alter table public.gx_event_prizes enable row level security;
alter table public.gx_event_audience_targets enable row level security;
alter table public.gx_event_post_reactions enable row level security;

-- A function owner checks selected audience without triggering recursive RLS.
create or replace function public.gx_event_can_view(p_event_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $function$
  select exists (
    select 1 from public.gx_events e join public.profiles p on p.id=auth.uid()
    where e.id=p_event_id and p.active is true and (
      public.is_admin() or (e.status <> 'draft' and (
        e.audience='all' or (e.audience='creators' and p.role='creator') or
        (e.audience='managers' and p.role='manager') or
        (e.audience='selected' and exists(
          select 1 from public.gx_event_audience_targets t
          where t.event_id=e.id and (
            (t.target_type='user' and t.target_id=p.id) or
            (t.target_type='team' and t.target_id=p.team_id)
          )
        ))
      ))
    )
  );
$function$;
revoke all on function public.gx_event_can_view(uuid) from public,anon;
grant execute on function public.gx_event_can_view(uuid) to authenticated;

-- Event row policy delegates visibility to the centralized predicate.
drop policy if exists gx_events_published_read on public.gx_events;
create policy gx_events_published_read on public.gx_events for select to authenticated using (public.gx_event_can_view(id));

-- Read access for phases and prizes follows the event audience; only admins edit them.
drop policy if exists gx_event_phases_admin_all on public.gx_event_phases;
create policy gx_event_phases_admin_all on public.gx_event_phases for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists gx_event_phases_view on public.gx_event_phases;
create policy gx_event_phases_view on public.gx_event_phases for select to authenticated using (public.gx_event_can_view(event_id));
drop policy if exists gx_event_prizes_admin_all on public.gx_event_prizes;
create policy gx_event_prizes_admin_all on public.gx_event_prizes for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists gx_event_prizes_view on public.gx_event_prizes;
create policy gx_event_prizes_view on public.gx_event_prizes for select to authenticated using (public.gx_event_can_view(event_id));
drop policy if exists gx_event_audience_targets_admin_all on public.gx_event_audience_targets;
create policy gx_event_audience_targets_admin_all on public.gx_event_audience_targets for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Reacciones visibles al público del evento; cada cuenta solo administra su propia reacción.
drop policy if exists gx_event_post_reactions_select on public.gx_event_post_reactions;
create policy gx_event_post_reactions_select on public.gx_event_post_reactions for select to authenticated using (public.gx_event_can_view(event_id));
drop policy if exists gx_event_post_reactions_insert_own on public.gx_event_post_reactions;
create policy gx_event_post_reactions_insert_own on public.gx_event_post_reactions for insert to authenticated with check (
  user_id=auth.uid() and public.gx_event_can_view(event_id) and exists(
    select 1 from public.gx_event_posts p where p.id=post_id and p.event_id=gx_event_post_reactions.event_id
  )
);
drop policy if exists gx_event_post_reactions_update_own on public.gx_event_post_reactions;
create policy gx_event_post_reactions_update_own on public.gx_event_post_reactions for update to authenticated
using (user_id=auth.uid() and public.gx_event_can_view(event_id))
with check (user_id=auth.uid() and public.gx_event_can_view(event_id) and exists(
  select 1 from public.gx_event_posts p where p.id=post_id and p.event_id=gx_event_post_reactions.event_id
));
drop policy if exists gx_event_post_reactions_delete_own on public.gx_event_post_reactions;
create policy gx_event_post_reactions_delete_own on public.gx_event_post_reactions for delete to authenticated using (user_id=auth.uid());

-- Hilo oficial: solo la cuenta que creó el evento puede publicar, editar, fijar y borrar.
-- Se eliminan las políticas previas que permitían publicar/comentar a cualquier participante o admin.
drop policy if exists gx_event_posts_admin_all on public.gx_event_posts;
drop policy if exists gx_event_posts_view on public.gx_event_posts;
drop policy if exists gx_event_posts_insert_viewer on public.gx_event_posts;
drop policy if exists gx_event_posts_update_own on public.gx_event_posts;
drop policy if exists gx_event_posts_delete_own on public.gx_event_posts;
drop policy if exists gx_event_posts_insert_owner on public.gx_event_posts;
drop policy if exists gx_event_posts_update_owner on public.gx_event_posts;
drop policy if exists gx_event_posts_delete_owner on public.gx_event_posts;
create policy gx_event_posts_view on public.gx_event_posts for select to authenticated using (public.gx_event_can_view(event_id));
create policy gx_event_posts_insert_owner on public.gx_event_posts for insert to authenticated with check (
  user_id=auth.uid() and exists(select 1 from public.gx_events e where e.id=event_id and e.created_by=auth.uid())
);
create policy gx_event_posts_update_owner on public.gx_event_posts for update to authenticated using (
  exists(select 1 from public.gx_events e where e.id=event_id and e.created_by=auth.uid())
) with check (
  user_id=auth.uid() and exists(select 1 from public.gx_events e where e.id=event_id and e.created_by=auth.uid())
);
create policy gx_event_posts_delete_owner on public.gx_event_posts for delete to authenticated using (
  exists(select 1 from public.gx_events e where e.id=event_id and e.created_by=auth.uid())
);

-- Update event visibility/read policies that encoded only the three original audience values.
drop policy if exists gx_event_reads_insert_own on public.gx_event_reads;
create policy gx_event_reads_insert_own on public.gx_event_reads for insert to authenticated with check (
  user_id=auth.uid() and public.gx_event_can_view(event_id)
);

-- Event-aware helper used by the publication/unread functions for arbitrary recipient IDs.
create or replace function public.gx_event_audience_matches(p_event_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $function$
  select exists(
    select 1 from public.gx_events e join public.profiles p on p.id=p_user_id and p.active is true
    where e.id=p_event_id and (
      e.audience='all' or (e.audience='creators' and p.role='creator') or
      (e.audience='managers' and p.role='manager') or
      (e.audience='selected' and exists(select 1 from public.gx_event_audience_targets t where t.event_id=e.id and (
        (t.target_type='user' and t.target_id=p.id) or (t.target_type='team' and t.target_id=p.team_id)
      )))
    )
  );
$function$;
revoke all on function public.gx_event_audience_matches(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gx_event_audience_matches(uuid,uuid) to authenticated;

create or replace function public.gx_events_unread_count()
returns integer language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_user uuid:=auth.uid(); v_count integer;
begin
  if v_user is null then return 0; end if;
  select count(*)::integer into v_count from public.gx_events e
  where e.status in ('published','in_progress') and (e.ends_at is null or e.ends_at>=now())
    and public.gx_event_audience_matches(e.id,v_user)
    and not exists(select 1 from public.gx_event_reads r where r.event_id=e.id and r.user_id=v_user);
  return coalesce(v_count,0);
end;
$function$;
revoke all on function public.gx_events_unread_count() from public,anon;
grant execute on function public.gx_events_unread_count() to authenticated;

create or replace function public.gx_events_notify_audience(p_event_id uuid,p_notification_kind text)
returns integer language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_event public.gx_events%rowtype; v_count integer:=0; v_title text; v_message text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Solo un administrador puede publicar notificaciones de eventos.' using errcode='42501'; end if;
  if p_notification_kind not in ('published','results') then raise exception 'Tipo de notificación de evento no válido.' using errcode='22023'; end if;
  select * into v_event from public.gx_events where id=p_event_id;
  if not found then raise exception 'El evento no existe.' using errcode='P0002'; end if;
  if p_notification_kind='published' and v_event.status not in ('published','in_progress') then raise exception 'Solo se pueden notificar eventos publicados o en curso.' using errcode='22023'; end if;
  if p_notification_kind='results' and nullif(btrim(v_event.results),'') is null then raise exception 'Agrega los resultados antes de notificar.' using errcode='22023'; end if;
  if p_notification_kind='results' then v_title:='Resultados publicados: '||left(v_event.title,140);v_message:=left(coalesce(v_event.results,'Ya están disponibles los resultados del evento.'),450);
  else v_title:='Nuevo evento en Grayxon: '||left(v_event.title,140);v_message:=left(coalesce(v_event.description,'Ya puedes consultar los detalles y registrarte desde Eventos.'),450);end if;
  with eligible as (
    select p.id user_id from public.profiles p where p.active is true and p.role in ('creator','manager') and public.gx_event_audience_matches(p_event_id,p.id)
  ), fresh as (
    insert into public.gx_event_notification_log(event_id,user_id,notification_kind)
    select p_event_id,e.user_id,p_notification_kind from eligible e on conflict(event_id,user_id,notification_kind) do nothing returning user_id
  ), created_notifications as (
    insert into public.notifications(user_id,type,title,message,link_page,link_target)
    select f.user_id,'event',v_title,v_message,'events',v_event.id::text from fresh f returning id
  ) select count(*)::integer into v_count from created_notifications;
  return coalesce(v_count,0);
end;
$function$;
revoke all on function public.gx_events_notify_audience(uuid,text) from public,anon,authenticated;
grant execute on function public.gx_events_notify_audience(uuid,text) to authenticated;

-- Sí/No sin pedir usuario de TikTok: se toma automáticamente de profiles.username.
create or replace function public.gx_events_respond(p_event_id uuid,p_response text,p_tiktok_username text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_user uuid:=auth.uid(); v_role text; v_profile_username text; v_event public.gx_events%rowtype; v_handle text; v_participant_id uuid;
begin
  if v_user is null then raise exception 'Debes iniciar sesión.' using errcode='28000'; end if;
  if p_response not in ('yes','no') then raise exception 'Respuesta no válida.' using errcode='22023'; end if;
  select * into v_event from public.gx_events where id=p_event_id;
  if not found then raise exception 'El evento no existe.' using errcode='P0002'; end if;
  select role,username into v_role,v_profile_username from public.profiles where id=v_user and active is true;
  if v_role is null or v_role not in ('creator','manager') then raise exception 'Tu cuenta no está habilitada para participar.' using errcode='42501'; end if;
  if v_event.status not in ('published','in_progress') or not v_event.registration_open then raise exception 'Las inscripciones de este evento están cerradas.' using errcode='22023'; end if;
  if v_event.ends_at is not null and v_event.ends_at<now() then raise exception 'El evento ya finalizó.' using errcode='22023'; end if;
  if not public.gx_event_audience_matches(p_event_id,v_user) then raise exception 'Este evento no está dirigido a tu cuenta.' using errcode='42501'; end if;
  if v_event.battle_enabled and v_role<>'creator' then raise exception 'Las batallas de este evento son para creadores.' using errcode='42501'; end if;
  v_handle:=nullif(regexp_replace(trim(coalesce(p_tiktok_username,v_profile_username,'')),'^@+',''),'');
  if v_handle is not null and v_handle !~ '^[A-Za-z0-9._]{2,24}$' then raise exception 'El usuario de tu perfil no tiene un formato de TikTok válido. Corrígelo en tu perfil de Grayxon.' using errcode='22023'; end if;
  insert into public.gx_event_responses(event_id,user_id,response,tiktok_username,responded_at)
  values(p_event_id,v_user,p_response,v_handle,now())
  on conflict(event_id,user_id) do update set response=excluded.response,tiktok_username=coalesce(excluded.tiktok_username,gx_event_responses.tiktok_username),responded_at=now();
  if p_response='yes' then
    insert into public.gx_event_participants(event_id,user_id,status,tiktok_username,registered_at)
    values(p_event_id,v_user,'registered',v_handle,now())
    on conflict(event_id,user_id) do update set status=case when gx_event_participants.status='withdrawn' then 'registered' else gx_event_participants.status end,tiktok_username=coalesce(excluded.tiktok_username,gx_event_participants.tiktok_username)
    returning id into v_participant_id;
  else
    update public.gx_event_participants set status='withdrawn',tiktok_username=coalesce(v_handle,tiktok_username) where event_id=p_event_id and user_id=v_user and status in ('registered','confirmed');
  end if;
  return jsonb_build_object('event_id',p_event_id,'response',p_response,'participant_id',v_participant_id,'tiktok_username',v_handle);
end;
$function$;

create or replace function public.gx_events_admin_set_participant(p_event_id uuid,p_user_id uuid,p_action text,p_tiktok_username text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_event public.gx_events%rowtype; v_profile public.profiles%rowtype; v_handle text; v_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Solo administración puede gestionar participantes.' using errcode='42501'; end if;
  select * into v_event from public.gx_events where id=p_event_id; if not found then raise exception 'El evento no existe.' using errcode='P0002'; end if;
  select * into v_profile from public.profiles where id=p_user_id and active is true;
  if not found or v_profile.role not in ('creator','manager') then raise exception 'No se encontró un usuario activo elegible.' using errcode='P0002'; end if;
  if v_event.battle_enabled and v_profile.role<>'creator' then raise exception 'Para un evento de batallas solo se admiten creadores.' using errcode='22023'; end if;
  if not public.gx_event_audience_matches(p_event_id,p_user_id) then raise exception 'La cuenta no pertenece a la audiencia seleccionada del evento.' using errcode='42501'; end if;
  v_handle:=nullif(regexp_replace(trim(coalesce(p_tiktok_username,v_profile.username,'')),'^@+',''),'');
  if v_handle is not null and v_handle !~ '^[A-Za-z0-9._]{2,24}$' then raise exception 'El usuario de TikTok del perfil no tiene un formato válido.' using errcode='22023'; end if;
  if p_action='add' then
    insert into public.gx_event_participants(event_id,user_id,status,tiktok_username,registered_at) values(p_event_id,p_user_id,'registered',v_handle,now())
    on conflict(event_id,user_id) do update set status='registered',tiktok_username=coalesce(excluded.tiktok_username,gx_event_participants.tiktok_username) returning id into v_id;
    insert into public.gx_event_responses(event_id,user_id,response,tiktok_username,responded_at) values(p_event_id,p_user_id,'yes',v_handle,now())
    on conflict(event_id,user_id) do update set response='yes',tiktok_username=coalesce(excluded.tiktok_username,gx_event_responses.tiktok_username),responded_at=now();
  elsif p_action='remove' then
    update public.gx_event_participants set status='withdrawn' where event_id=p_event_id and user_id=p_user_id and status<>'disqualified' returning id into v_id;
    if v_id is null then raise exception 'El participante no está activo en este evento.' using errcode='P0002'; end if;
  else raise exception 'Acción no válida.' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'participant_id',v_id,'action',p_action);
end;
$function$;

-- Ranking: por defecto limita puntuación a la meta; si score_over_target está activo suma el valor completo.
create or replace function public.gx_event_leaderboard(p_event_id uuid)
returns table(participant_id uuid,user_id uuid,username text,tiktok_username text,points numeric,approved_missions integer,battles_played integer,wins integer,rank_position bigint)
language plpgsql stable security definer set search_path=public,pg_temp
as $function$
begin
  if auth.uid() is null or not public.gx_event_can_view(p_event_id) then raise exception 'No tienes acceso al ranking de este evento.' using errcode='42501'; end if;
  return query
  with roster as (
    select ep.id,ep.user_id,coalesce(nullif(p.username,''),nullif(p.full_name,''),'usuario') uname,coalesce(nullif(ep.tiktok_username,''),nullif(p.username,'')) tiktok_username
    from public.gx_event_participants ep join public.profiles p on p.id=ep.user_id
    where ep.event_id=p_event_id and ep.status in ('registered','confirmed')
  ), mission_scores as (
    select mp.user_id,
      coalesce(sum((case when m.score_over_target then mp.value else least(mp.value,m.target_value) end)*m.points_per_unit + case when mp.value>=m.target_value then m.completion_bonus else 0 end),0)::numeric pts,
      count(*) filter(where mp.value>=m.target_value)::integer done
    from public.gx_event_mission_progress mp join public.gx_event_missions m on m.id=mp.mission_id and m.event_id=mp.event_id
    where mp.event_id=p_event_id and mp.status='approved' and m.is_active=true group by mp.user_id
  ), battle_rows as (
    select ep.user_id,m.id,m.status,m.winner_participant_id,m.event_id,(m.status='completed' and m.winner_participant_id=ep.id) won,(m.status='completed' and m.winner_participant_id is null) drawn,(m.status='completed' and m.participant_b_id is not null) played
    from public.gx_event_matches m join public.gx_event_participants ep on ep.id=m.participant_a_id where m.event_id=p_event_id
    union all
    select ep.user_id,m.id,m.status,m.winner_participant_id,m.event_id,(m.status='completed' and m.winner_participant_id=ep.id) won,(m.status='completed' and m.winner_participant_id is null) drawn,(m.status='completed' and m.participant_b_id is not null) played
    from public.gx_event_matches m join public.gx_event_participants ep on ep.id=m.participant_b_id where m.event_id=p_event_id and m.participant_b_id is not null
  ), battle_scores as (
    select br.user_id,coalesce(sum(case when br.played then e.battle_participation_points+case when br.won then e.battle_win_points when br.drawn then e.battle_draw_points else 0 end else 0 end),0)::numeric pts,count(*) filter(where br.played)::integer played,count(*) filter(where br.won)::integer wins
    from battle_rows br join public.gx_events e on e.id=br.event_id group by br.user_id
  ), scores as (
    select r.id,r.user_id,r.uname,r.tiktok_username,(coalesce(ms.pts,0)+coalesce(bs.pts,0))::numeric total,coalesce(ms.done,0)::integer done,coalesce(bs.played,0)::integer played,coalesce(bs.wins,0)::integer wins
    from roster r left join mission_scores ms on ms.user_id=r.user_id left join battle_scores bs on bs.user_id=r.user_id
  )
  select s.id,s.user_id,s.uname,s.tiktok_username,s.total,s.done,s.played,s.wins,row_number() over(order by s.total desc,s.uname asc)::bigint from scores s order by s.total desc,s.uname asc;
end;
$function$;

-- Seed the activity feed for phase/reaction tables so Realtime refreshes the event dashboard.
drop trigger if exists gx_event_activity_gx_event_phases on public.gx_event_phases;
create trigger gx_event_activity_gx_event_phases after insert or update or delete on public.gx_event_phases for each row execute function public.gx_event_touch_activity();
drop trigger if exists gx_event_activity_gx_event_prizes on public.gx_event_prizes;
create trigger gx_event_activity_gx_event_prizes after insert or update or delete on public.gx_event_prizes for each row execute function public.gx_event_touch_activity();
drop trigger if exists gx_event_activity_gx_event_post_reactions on public.gx_event_post_reactions;
create trigger gx_event_activity_gx_event_post_reactions after insert or update or delete on public.gx_event_post_reactions for each row execute function public.gx_event_touch_activity();

-- Random battle rounds follow the configured event phase dates when phases are enabled.
create or replace function public.gx_events_generate_round(p_event_id uuid,p_round_number integer,p_title text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare
  v_event public.gx_events%rowtype; v_round_id uuid; v_available uuid[]; v_a uuid; v_b uuid; v_match_id uuid; v_title text;
  v_matches integer:=0; v_byes integer:=0; v_phase_id uuid; v_phase_start timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Solo administración puede generar emparejamientos.' using errcode='42501'; end if;
  if p_round_number is null or p_round_number<1 then raise exception 'La fase debe ser mayor que cero.' using errcode='22023'; end if;
  select * into v_event from public.gx_events where id=p_event_id;
  if not found then raise exception 'El evento no existe.' using errcode='P0002'; end if;
  if not v_event.battle_enabled then raise exception 'Activa una misión de batallas antes de generar emparejamientos.' using errcode='22023'; end if;
  if exists(select 1 from public.gx_event_rounds where event_id=p_event_id and round_number=p_round_number) then raise exception 'Esta fase ya tiene emparejamientos. No se generará una segunda vez.' using errcode='23505'; end if;
  if exists(select 1 from public.gx_event_phases where event_id=p_event_id) then
    select id,starts_at into v_phase_id,v_phase_start from public.gx_event_phases where event_id=p_event_id and phase_number=p_round_number;
    if v_phase_id is null then raise exception 'No hay una fase del evento configurada para el emparejamiento número %.',p_round_number using errcode='22023'; end if;
  end if;
  if p_round_number>1 and v_event.battle_format='single_elimination' then
    if not exists(select 1 from public.gx_event_rounds where event_id=p_event_id and round_number=p_round_number-1) then raise exception 'Primero genera la fase anterior.' using errcode='22023'; end if;
    if exists(select 1 from public.gx_event_matches where event_id=p_event_id and round_id=(select id from public.gx_event_rounds where event_id=p_event_id and round_number=p_round_number-1) and status not in ('completed','bye')) then raise exception 'Termina todas las batallas de la fase anterior antes de avanzar.' using errcode='22023'; end if;
    if exists(select 1 from public.gx_event_matches where event_id=p_event_id and round_id=(select id from public.gx_event_rounds where event_id=p_event_id and round_number=p_round_number-1) and winner_participant_id is null) then raise exception 'Registra los ganadores de la fase anterior antes de avanzar.' using errcode='22023'; end if;
    select array_agg(x.pid order by random()) into v_available from (
      select distinct m.winner_participant_id as pid from public.gx_event_matches m join public.gx_event_rounds r on r.id=m.round_id
      where r.event_id=p_event_id and r.round_number=p_round_number-1 and m.winner_participant_id is not null
    ) x;
  else
    select array_agg(ep.id order by random()) into v_available from public.gx_event_participants ep
    join public.gx_event_responses er on er.event_id=ep.event_id and er.user_id=ep.user_id and er.response='yes'
    where ep.event_id=p_event_id and ep.status in ('registered','confirmed');
  end if;
  if coalesce(cardinality(v_available),0)<2 then raise exception 'Se necesitan al menos dos participantes confirmados con respuesta Sí.' using errcode='22023'; end if;
  v_title:=coalesce(nullif(btrim(p_title),''),(select p.title from public.gx_event_phases p where p.id=v_phase_id),case when v_event.battle_format='single_elimination' then 'Fase '||p_round_number else 'Jornada '||p_round_number end);
  insert into public.gx_event_rounds(event_id,round_number,title,status,created_by,phase_id)
  values(p_event_id,p_round_number,v_title,'scheduled',auth.uid(),v_phase_id) returning id into v_round_id;
  while coalesce(cardinality(v_available),0)>0 loop
    v_a:=v_available[1]; v_available:=array_remove(v_available,v_a);
    if coalesce(cardinality(v_available),0)>0 then
      if v_event.battle_format='round_robin' then
        select q.id into v_b from unnest(v_available) as q(id)
        where not exists(select 1 from public.gx_event_matches oldm join public.gx_event_rounds oldr on oldr.id=oldm.round_id
          where oldr.event_id=p_event_id and ((oldm.participant_a_id=v_a and oldm.participant_b_id=q.id) or (oldm.participant_a_id=q.id and oldm.participant_b_id=v_a)))
        order by random() limit 1;
      else select q.id into v_b from unnest(v_available) as q(id) order by random() limit 1; end if;
      if v_b is null then select q.id into v_b from unnest(v_available) as q(id) order by random() limit 1; end if;
      v_available:=array_remove(v_available,v_b);
      insert into public.gx_event_matches(event_id,round_id,participant_a_id,participant_b_id,status,scheduled_at)
      values(p_event_id,v_round_id,v_a,v_b,'scheduled',v_phase_start) returning id into v_match_id;
      perform public.gx_events_notify_match(v_match_id); v_matches:=v_matches+1;
    else
      insert into public.gx_event_matches(event_id,round_id,participant_a_id,participant_b_id,winner_participant_id,status,scheduled_at)
      values(p_event_id,v_round_id,v_a,null,v_a,'bye',v_phase_start); v_byes:=v_byes+1;
    end if;
    v_b:=null;
  end loop;
  insert into public.gx_event_activity(event_id,activity_kind) values(p_event_id,'round_generated');
  return jsonb_build_object('round_id',v_round_id,'round_number',p_round_number,'title',v_title,'phase_id',v_phase_id,'scheduled_at',v_phase_start,'matches',v_matches,'byes',v_byes);
end;
$function$;
revoke all on function public.gx_events_generate_round(uuid,integer,text) from public,anon;
grant execute on function public.gx_events_generate_round(uuid,integer,text) to authenticated;

-- Server-side guard: an admin cannot publish an incomplete event even if a client bypasses its form validation.
create or replace function public.gx_event_validate_publish()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
begin
  if new.status in ('published','in_progress') and coalesce(old.status,'draft') not in ('published','in_progress') then
    if new.starts_at is null or new.ends_at is null or new.ends_at<=new.starts_at then
      raise exception 'Antes de publicar, configura fechas y horas válidas para el evento.' using errcode='22023';
    end if;
    if not exists(select 1 from public.gx_event_missions m where m.event_id=new.id and m.is_active=true) then
      raise exception 'No se puede publicar: agrega al menos una misión activa.' using errcode='22023';
    end if;
    if not exists(select 1 from public.gx_event_media m where m.event_id=new.id and m.is_cover=true and m.mime_type like 'image/%') then
      raise exception 'No se puede publicar: selecciona una imagen de portada.' using errcode='22023';
    end if;
    if new.audience='selected' and not exists(select 1 from public.gx_event_audience_targets t where t.event_id=new.id) then
      raise exception 'No se puede publicar: selecciona al menos una cuenta o equipo para la audiencia.' using errcode='22023';
    end if;
    if exists(
      select 1 from public.gx_event_phases p where p.event_id=new.id and not exists(
        select 1 from public.gx_event_missions m where m.event_id=new.id and m.phase_id=p.id and m.is_active=true
      )
    ) then
      raise exception 'No se puede publicar: cada fase debe tener al menos una misión activa asociada.' using errcode='22023';
    end if;
    if new.battle_enabled and not exists(select 1 from public.gx_event_missions m where m.event_id=new.id and m.is_active=true and m.metric_key='battles') then
      raise exception 'No se puede publicar: el evento tiene batallas activas pero no tiene una misión de batallas.' using errcode='22023';
    end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists gx_event_validate_publish on public.gx_events;
create trigger gx_event_validate_publish before update of status on public.gx_events for each row execute function public.gx_event_validate_publish();
revoke all on function public.gx_event_validate_publish() from public,anon,authenticated;

-- Regrant functions overridden above; no public/anonymous execution.
revoke all on function public.gx_events_respond(uuid,text,text) from public,anon;
revoke all on function public.gx_events_admin_set_participant(uuid,uuid,text,text) from public,anon;
revoke all on function public.gx_event_leaderboard(uuid) from public,anon;
grant execute on function public.gx_events_respond(uuid,text,text) to authenticated;
grant execute on function public.gx_events_admin_set_participant(uuid,uuid,text,text) to authenticated;
grant execute on function public.gx_event_leaderboard(uuid) to authenticated;

grant select,insert,update,delete on public.gx_event_phases,public.gx_event_prizes,public.gx_event_audience_targets,public.gx_event_post_reactions to authenticated;
grant select,insert,update,delete on public.gx_event_posts to authenticated;
grant select,insert,update,delete on public.gx_event_missions to authenticated;
grant select,insert,update,delete on public.gx_event_media to authenticated;

commit;
