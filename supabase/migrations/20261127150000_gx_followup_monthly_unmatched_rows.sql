begin;

create table if not exists public.gx_creator_followup_import_unmatched_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.gx_creator_followup_imports(id) on delete cascade,
  creator_username_snapshot text not null check(length(btrim(creator_username_snapshot)) between 1 and 100),
  creator_id_snapshot text,
  reason text not null check(reason in ('agency_left','not_in_portal','ambiguous')),
  source_status text,
  raw_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gx_followup_unmatched_import_idx
  on public.gx_creator_followup_import_unmatched_rows(import_id,reason);

alter table public.gx_creator_followup_import_unmatched_rows enable row level security;

drop policy if exists gx_followup_unmatched_read on public.gx_creator_followup_import_unmatched_rows;
create policy gx_followup_unmatched_read
  on public.gx_creator_followup_import_unmatched_rows
  for select to authenticated
  using (
    exists (
      select 1 from public.gx_creator_followup_imports i
      where i.id=import_id and (public.is_admin() or i.manager_id=public.current_manager_id())
    )
  );

revoke all on public.gx_creator_followup_import_unmatched_rows from public,anon,authenticated;
grant select on public.gx_creator_followup_import_unmatched_rows to authenticated;

create or replace function public.gx_save_creator_followup_import_with_unmatched(
 p_file_name text,p_storage_path text,p_file_sha256 text,p_selected_start date,p_selected_end date,
 p_source_start date,p_source_end date,p_granularity text,p_evaluations jsonb,p_unmatched_rows jsonb
) returns uuid
language plpgsql security definer set search_path=public,auth,storage
as $$
declare
 v_import_id uuid;
 v_row jsonb;
begin
 if p_unmatched_rows is null or jsonb_typeof(p_unmatched_rows)<>'array' then
   raise exception 'Los registros sin vincular no tienen un formato válido';
 end if;
 for v_row in select value from jsonb_array_elements(p_unmatched_rows) loop
   if coalesce(v_row->>'username','')='' then raise exception 'Falta el usuario TikTok de un registro pendiente'; end if;
   if coalesce(v_row->>'reason','') not in ('agency_left','not_in_portal','ambiguous') then raise exception 'Motivo de registro pendiente inválido'; end if;
 end loop;

 v_import_id:=public.gx_save_creator_followup_import(
   p_file_name,p_storage_path,p_file_sha256,p_selected_start,p_selected_end,
   p_source_start,p_source_end,p_granularity,p_evaluations
 );

 insert into public.gx_creator_followup_import_unmatched_rows(
   import_id,creator_username_snapshot,creator_id_snapshot,reason,source_status,raw_metrics
 )
 select v_import_id,
   left(btrim(e->>'username'),100),
   nullif(left(btrim(coalesce(e->>'creator_id','')),100),''),
   e->>'reason',
   nullif(left(coalesce(e->>'agency_status',''),500),''),
   coalesce(e->'raw_metrics','{}'::jsonb)
 from jsonb_array_elements(p_unmatched_rows) e;

 return v_import_id;
end;
$$;

revoke all on function public.gx_save_creator_followup_import_with_unmatched(text,text,text,date,date,date,date,text,jsonb,jsonb) from public,anon;
grant execute on function public.gx_save_creator_followup_import_with_unmatched(text,text,text,date,date,date,date,text,jsonb,jsonb) to authenticated;

commit;
