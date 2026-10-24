-- Hidden sample-lesson page (/sample-lesson): an unlisted recording of a real
-- live lesson that prospective families are sent after registering for an
-- open evening. The URL lives in site settings so the school can swap the
-- recording without a code change. Idempotent.
alter table public.site_settings
  add column if not exists sample_lesson_video_url text,
  add column if not exists sample_lesson_note text;
