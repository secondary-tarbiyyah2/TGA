-- Tafweed T30: cover and staff absences, more than the basics (November 2026).
--
-- teacher_absences (0070) held whole days only. This adds:
--   * part days: start_time on the first day ("away from 13:00") and
--     end_time on the last day ("back at 11:00"); null means the whole day;
--   * a category (sickness, medical appointment, training, school business,
--     leave, other) for the cover report. The free-text reason stays;
--   * cover_assignments.absence_id: which absence a cover was for, so the
--     cover log and report can group by absence;
--   * cover_assignments.teacher_notified_at: when the covering teacher was
--     emailed (cover-notify), so they're told once and it can be retried.
--
-- No policy changes: absences and cover stay managed by the Headteacher,
-- admin and manage_academic holders (0008, 0070); a teacher still reads only
-- their own absences and the covers they give or receive. Idempotent.

alter table public.teacher_absences add column if not exists start_time time;
alter table public.teacher_absences add column if not exists end_time time;
alter table public.teacher_absences add column if not exists category text not null default 'other';

alter table public.teacher_absences drop constraint if exists teacher_absences_category_check;
alter table public.teacher_absences add constraint teacher_absences_category_check
  check (category in ('sickness', 'medical', 'training', 'school_business', 'leave', 'other'));

-- On a single day, "from" must be before "until".
alter table public.teacher_absences drop constraint if exists teacher_absences_part_day_check;
alter table public.teacher_absences add constraint teacher_absences_part_day_check
  check (starts_on <> ends_on or start_time is null or end_time is null or start_time < end_time);

alter table public.teacher_absences drop constraint if exists teacher_absences_reason_len;
alter table public.teacher_absences add constraint teacher_absences_reason_len
  check (reason is null or char_length(reason) <= 500) not valid;

alter table public.cover_assignments add column if not exists absence_id uuid references public.teacher_absences(id) on delete set null;
alter table public.cover_assignments add column if not exists teacher_notified_at timestamptz;
create index if not exists cover_assignments_date_idx on public.cover_assignments (cover_date);
create index if not exists cover_assignments_covering_idx on public.cover_assignments (covering_teacher_user_id, cover_date);
