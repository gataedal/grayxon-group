-- Preserve the opponent's scheduled battle when another creator withdraws.
-- Affected matches stay visible until an admin assigns a replacement or marks
-- the battle as random TikTok. Completed matches remain historical records.
alter table public.gx_event_matches
  add column if not exists needs_opponent boolean not null default false,
  add column if not exists opponent_mode text not null default 'event';

alter table public.gx_event_matches
  drop constraint if exists gx_event_matches_opponent_mode_check;
alter table public.gx_event_matches
  add constraint gx_event_matches_opponent_mode_check
  check (opponent_mode in ('event','random_tiktok'));

create or replace function public.gx_events_admin_set_participant(
  p_event_id uuid, p_user_id uuid, p_action text, p_tiktok_username text default null
)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_event public.gx_events%rowtype;
  v_profile public.profiles%rowtype;
  v_handle text;
  v_id uuid;
  v_orphaned integer := 0;
  v_changed integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Solo administración puede gestionar participantes.' using errcode='42501';
  end if;
  select * into v_event from public.gx_events where id=p_event_id;
  if not found then raise exception 'El evento no existe.' using errcode='P0002'; end if;
  select * into v_profile from public.profiles where id=p_user_id and active is true;
  if not found or v_profile.role not in ('creator','manager') then
    raise exception 'No se encontró un usuario activo elegible.' using errcode='P0002';
  end if;
  if v_event.battle_enabled and v_profile.role<>'creator' then
    raise exception 'Para un evento de batallas solo se admiten creadores.' using errcode='22023';
  end if;
  if not public.gx_event_audience_matches(p_event_id,p_user_id) then
    raise exception 'La cuenta no pertenece a la audiencia seleccionada del evento.' using errcode='42501';
  end if;
  v_handle:=nullif(regexp_replace(trim(coalesce(p_tiktok_username,v_profile.username,'')),'^@+',''),'');
  if v_handle is not null and v_handle !~ '^[A-Za-z0-9._]{2,24}$' then
    raise exception 'El usuario de TikTok del perfil no tiene un formato válido.' using errcode='22023';
  end if;

  if p_action='add' then
    insert into public.gx_event_participants(event_id,user_id,status,tiktok_username,registered_at)
    values(p_event_id,p_user_id,'registered',v_handle,now())
    on conflict(event_id,user_id) do update
      set status='registered',tiktok_username=coalesce(excluded.tiktok_username,gx_event_participants.tiktok_username)
    returning id into v_id;
    insert into public.gx_event_responses(event_id,user_id,response,tiktok_username,responded_at)
    values(p_event_id,p_user_id,'yes',v_handle,now())
    on conflict(event_id,user_id) do update
      set response='yes',tiktok_username=coalesce(excluded.tiktok_username,gx_event_responses.tiktok_username),responded_at=now();
  elsif p_action='remove' then
    select id into v_id from public.gx_event_participants
    where event_id=p_event_id and user_id=p_user_id and status<>'disqualified' for update;
    if v_id is null then
      raise exception 'El participante no está activo en este evento.' using errcode='P0002';
    end if;

    update public.gx_event_matches
      set participant_a_id=participant_b_id, participant_b_id=null,
          needs_opponent=true, opponent_mode='event', winner_participant_id=null,
          score_a=null, score_b=null, result_note=null, updated_at=now()
    where event_id=p_event_id and status='scheduled'
      and participant_a_id=v_id and participant_b_id is not null;
    get diagnostics v_orphaned = row_count;

    update public.gx_event_matches
      set participant_b_id=null, needs_opponent=true, opponent_mode='event',
          winner_participant_id=null, score_a=null, score_b=null,
          result_note=null, updated_at=now()
    where event_id=p_event_id and status='scheduled'
      and participant_b_id=v_id and participant_a_id<>v_id;
    get diagnostics v_changed = row_count;
    v_orphaned := v_orphaned + v_changed;

    delete from public.gx_event_matches
    where event_id=p_event_id and status='scheduled'
      and participant_a_id=v_id and participant_b_id is null;

    update public.gx_event_participants set status='withdrawn' where id=v_id;
    update public.gx_event_enrollment_requests set status='cancelled', updated_at=now()
      where event_id=p_event_id and creator_user_id=p_user_id and status='approved';
  else
    raise exception 'Acción no válida.' using errcode='22023';
  end if;
  return jsonb_build_object('ok',true,'participant_id',v_id,'action',p_action,'battles_needing_opponent',v_orphaned);
end;
$function$;

create or replace function public.gx_event_leaderboard(p_event_id uuid)
returns table(participant_id uuid,user_id uuid,username text,tiktok_username text,points numeric,approved_missions integer,battles_played integer,wins integer,rank_position bigint)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null or not public.gx_event_can_view(p_event_id) then
    raise exception 'No tienes acceso al ranking de este evento.' using errcode='42501';
  end if;
  return query
  with roster as (
    select ep.id,ep.user_id,coalesce(nullif(p.username,''),nullif(p.full_name,''),'usuario') as uname,
      coalesce(nullif(ep.tiktok_username,''),nullif(p.tiktok_username,''),nullif(p.username,'')) as tiktok_username
    from public.gx_event_participants ep join public.profiles p on p.id=ep.user_id
    where ep.event_id=p_event_id and ep.status in ('registered','confirmed')
  ),
  mission_scores as (
    select mp.user_id,
      coalesce(sum((case when m.score_over_target then mp.value else least(mp.value,m.target_value) end)*m.points_per_unit + case when mp.value>=m.target_value then m.completion_bonus else 0 end),0)::numeric as pts,
      count(*) filter(where mp.value>=m.target_value)::integer as done
    from public.gx_event_mission_progress mp join public.gx_event_missions m on m.id=mp.mission_id and m.event_id=mp.event_id
    where mp.event_id=p_event_id and mp.status='approved' and m.is_active=true group by mp.user_id
  ),
  battle_rows as (
    select ep.user_id,m.id,m.status,m.winner_participant_id,m.event_id,m.opponent_mode,
      (m.status='completed' and m.opponent_mode<>'random_tiktok' and m.winner_participant_id=ep.id) as won,
      (m.status='completed' and m.opponent_mode<>'random_tiktok' and m.winner_participant_id is null) as drawn,
      (m.status='completed' and (m.participant_b_id is not null or m.opponent_mode='random_tiktok')) as played
    from public.gx_event_matches m join public.gx_event_participants ep on ep.id=m.participant_a_id
    where m.event_id=p_event_id
    union all
    select ep.user_id,m.id,m.status,m.winner_participant_id,m.event_id,m.opponent_mode,
      (m.status='completed' and m.opponent_mode<>'random_tiktok' and m.winner_participant_id=ep.id) as won,
      (m.status='completed' and m.opponent_mode<>'random_tiktok' and m.winner_participant_id is null) as drawn,
      (m.status='completed' and (m.participant_b_id is not null or m.opponent_mode='random_tiktok')) as played
    from public.gx_event_matches m join public.gx_event_participants ep on ep.id=m.participant_b_id
    where m.event_id=p_event_id and m.participant_b_id is not null
  ),
  battle_scores as (
    select br.user_id,
      coalesce(sum(case when br.played then e.battle_participation_points + case when br.won then e.battle_win_points when br.drawn then e.battle_draw_points else 0 end else 0 end),0)::numeric as pts,
      count(*) filter(where br.played)::integer as played,count(*) filter(where br.won)::integer as wins
    from battle_rows br join public.gx_events e on e.id=br.event_id group by br.user_id
  ),
  scores as (
    select r.id,r.user_id,r.uname,r.tiktok_username,(coalesce(ms.pts,0)+coalesce(bs.pts,0))::numeric as total,
      coalesce(ms.done,0)::integer as done,coalesce(bs.played,0)::integer as played,coalesce(bs.wins,0)::integer as wins
    from roster r left join mission_scores ms on ms.user_id=r.user_id left join battle_scores bs on bs.user_id=r.user_id
  ),
  ranked as (
    select s.id,s.user_id,s.uname,s.tiktok_username,s.total,s.done,s.played,s.wins,
      row_number() over(order by s.total desc,s.uname asc)::bigint as position from scores s
  )
  select r.id,r.user_id,r.uname,r.tiktok_username,r.total,r.done,r.played,r.wins,r.position from ranked r order by r.position;
end;
$function$;