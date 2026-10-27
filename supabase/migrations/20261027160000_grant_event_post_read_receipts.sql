-- Allow authenticated users to persist their own event-post read receipts.
-- Row-level security policies continue to restrict rows to the current user and visible events.
grant select, insert, update on table public.gx_event_post_reads to authenticated;
