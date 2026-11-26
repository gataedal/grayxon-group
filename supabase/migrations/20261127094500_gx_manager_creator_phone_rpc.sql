begin;
create or replace function public.gx_manager_update_creator_phone(p_creator_id uuid,p_phone text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_manager uuid:=public.current_manager_id(); v_admin boolean:=public.is_admin(); v_phone text;
begin
 v_phone:=nullif(btrim(p_phone),'');
 if v_phone is not null and (length(v_phone)<7 or length(v_phone)>25 or v_phone !~ '^[+0-9() .-]+$') then
  raise exception 'Número de teléfono inválido';
 end if;
 if not v_admin and v_manager is null then raise exception 'Acceso no autorizado'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_creator_id and p.role='creator' and p.active
   and (v_admin or p.manager_id=v_manager)) then raise exception 'El creador no pertenece a tu equipo'; end if;
 insert into public.profile_details(user_id,phone,updated_at) values(p_creator_id,v_phone,now())
 on conflict(user_id) do update set phone=excluded.phone,updated_at=now();
end $$;
revoke all on function public.gx_manager_update_creator_phone(uuid,text) from public,anon;
grant execute on function public.gx_manager_update_creator_phone(uuid,text) to authenticated;
commit;