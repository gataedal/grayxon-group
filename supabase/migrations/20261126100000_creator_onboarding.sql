-- Onboarding de nuevos creadores: solo se activa para cuentas creadas desde create-creator.
alter table public.profiles
  add column if not exists onboarding_required boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz;

create or replace function public.complete_creator_onboarding()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_required boolean;
  v_completed_at timestamptz;
  v_total_videos integer;
  v_completed_videos integer;
begin
  if v_user_id is null then
    raise exception 'Autenticación requerida';
  end if;

  select onboarding_required, onboarding_completed_at
    into v_required, v_completed_at
  from public.profiles
  where id = v_user_id and role = 'creator' and active = true;

  if not found then
    raise exception 'Perfil de creador no válido';
  end if;

  if not coalesce(v_required, false) or v_completed_at is not null then
    return true;
  end if;

  if not exists (
    select 1
    from public.profile_details d
    where d.user_id = v_user_id
      and nullif(btrim(d.email), '') is not null
      and nullif(btrim(d.phone), '') is not null
      and d.birth_date is not null
      and nullif(btrim(d.country), '') is not null
      and nullif(btrim(d.state_region), '') is not null
      and nullif(btrim(d.city), '') is not null
      and (nullif(btrim(d.avatar_path), '') is not null or nullif(btrim(d.avatar_url), '') is not null)
  ) then
    return false;
  end if;

  select count(*)
    into v_total_videos
  from public.lessons l
  where l.published = true
    and l.type = 'video'
    and l.video_path is not null
    and l.module_id in (
      'a676aec5-1514-4640-8884-8e9e02b2e90a'::uuid,
      'b7666174-c171-48ed-afe2-970b47c0c8fa'::uuid,
      '5d5e7196-7f15-4d9e-a53e-6940b21d5a75'::uuid
    );

  select count(distinct l.id)
    into v_completed_videos
  from public.lessons l
  join public.lesson_progress lp
    on lp.lesson_id = l.id and lp.user_id = v_user_id
  where l.published = true
    and l.type = 'video'
    and l.video_path is not null
    and l.module_id in (
      'a676aec5-1514-4640-8884-8e9e02b2e90a'::uuid,
      'b7666174-c171-48ed-afe2-970b47c0c8fa'::uuid,
      '5d5e7196-7f15-4d9e-a53e-6940b21d5a75'::uuid
    );

  if v_total_videos = 0 or v_completed_videos < v_total_videos then
    return false;
  end if;

  update public.profiles
  set onboarding_completed_at = now()
  where id = v_user_id
    and role = 'creator'
    and onboarding_required = true
    and onboarding_completed_at is null;

  return true;
end;
$$;

revoke all on function public.complete_creator_onboarding() from public;
grant execute on function public.complete_creator_onboarding() to authenticated;
