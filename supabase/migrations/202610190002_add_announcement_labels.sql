-- Optional custom labels displayed on recent announcement cards and surveys.
alter table public.announcements add column if not exists label text;
alter table public.gx_polls add column if not exists label text;

alter table public.announcements drop constraint if exists announcements_label_length_check;
alter table public.announcements add constraint announcements_label_length_check check (label is null or char_length(label) <= 32);
alter table public.gx_polls drop constraint if exists gx_polls_label_length_check;
alter table public.gx_polls add constraint gx_polls_label_length_check check (label is null or char_length(label) <= 32);
