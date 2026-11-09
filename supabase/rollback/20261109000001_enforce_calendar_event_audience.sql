-- Rollback: restore the previous gx_event_can_view behavior.
-- Note: this restores the prior rule where every active manager could view
-- every non-draft event, regardless of its configured audience.
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
          and (
            p.role = 'manager'
            or e.audience = 'all'
            or (e.audience = 'creators' and p.role = 'creator')
            or (e.audience = 'managers' and p.role = 'manager')
            or (
              e.audience = 'selected'
              and exists (
                select 1 from public.gx_event_audience_targets t
                where t.event_id = e.id
                  and ((t.target_type = 'user' and t.target_id = p.id)
                    or (t.target_type = 'team' and t.target_id = p.team_id))
              )
            )
          )
        )
      )
  );
$function$;
