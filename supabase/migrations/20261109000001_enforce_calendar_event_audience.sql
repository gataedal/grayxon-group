-- Enforce the configured audience when reading calendar events.
-- Managers must not automatically see every non-draft event.
create or replace function public.gx_event_can_view(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.gx_events e
    join public.profiles p on p.id = auth.uid()
    where e.id = p_event_id
      and p.active is true
      and (
        public.is_admin()
        or (
          e.status <> 'draft'
          and public.gx_event_audience_matches(e.id, p.id)
        )
      )
  );
$function$;
