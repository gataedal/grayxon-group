-- Grayxon Events Matrix: image URL for each event prize.
-- Additive change; existing prizes remain valid and can keep image_url NULL.
alter table public.gx_event_prizes
  add column if not exists image_url text;
