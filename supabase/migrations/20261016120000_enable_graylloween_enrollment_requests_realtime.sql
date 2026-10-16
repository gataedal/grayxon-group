-- Enable manager enrollment requests for the currently active Graylloween event
-- and publish request changes so the admin Requests badge updates in real time.
update public.gx_events
set registration_open = true, updated_at = now()
where title ilike '%GRAYLLOWEEN%'
  and status = 'published';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gx_event_enrollment_requests'
  ) then
    alter publication supabase_realtime add table public.gx_event_enrollment_requests;
  end if;
end $$;
