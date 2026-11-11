-- Hearing a recitation: mistakes logged by type and ayah, and the head teacher's strictness bands that turn
-- them into the mark out of 10 (owner feedback 11 Nov 2026, item 13; src/lib/learn/quranMarking.ts).
--
--  * quran_marking_standard: one row. `standard` holds, per level (beginner, junior, senior), the most
--    mistake points per page for each result, and what a slip and a tajweed mistake are worth. The app
--    falls back to its default for anything missing or odd, so a bad value never stops marking.
--    Staff read it (teachers mark to it); the head teacher and admin change it.
--  * quran_class_settings: the level each Qur'an class marks at (none set: worked out from the year group).
--    Staff read; the head teacher and admin set it.
--  * quran_progress gains the mistakes heard (a list of {kind, ayah}), the level and pages it was marked
--    at, the mark the standard worked out, whether the pupil could not recite, and the reason when the
--    teacher moved the result one step. `score` stays the mark everyone sees. Existing policies unchanged.

create table if not exists public.quran_marking_standard (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  standard jsonb not null default '{}'::jsonb check (jsonb_typeof(standard) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.quran_marking_standard (singleton) values (true) on conflict (singleton) do nothing;
alter table public.quran_marking_standard enable row level security;

drop policy if exists "quran_marking_standard: staff read" on public.quran_marking_standard;
create policy "quran_marking_standard: staff read" on public.quran_marking_standard for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));
drop policy if exists "quran_marking_standard: head updates" on public.quran_marking_standard;
create policy "quran_marking_standard: head updates" on public.quran_marking_standard for update to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create or replace function public.quran_marking_standard_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists quran_marking_standard_stamp on public.quran_marking_standard;
create trigger quran_marking_standard_stamp before update on public.quran_marking_standard
  for each row execute function public.quran_marking_standard_stamp();

create table if not exists public.quran_class_settings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null unique references public.classes(id) on delete cascade,
  marking_level text not null check (marking_level in ('beginner', 'junior', 'senior')),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.quran_class_settings enable row level security;

drop policy if exists "quran_class_settings: staff read" on public.quran_class_settings;
create policy "quran_class_settings: staff read" on public.quran_class_settings for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));
drop policy if exists "quran_class_settings: head manages" on public.quran_class_settings;
create policy "quran_class_settings: head manages" on public.quran_class_settings for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

alter table public.quran_progress
  add column if not exists mistakes jsonb not null default '[]'::jsonb,
  add column if not exists marking_level text,
  add column if not exists pages numeric(6, 2),
  add column if not exists worked_out_score smallint,
  add column if not exists could_not_recite boolean not null default false,
  add column if not exists adjust_reason text;
alter table public.quran_progress drop constraint if exists quran_progress_mistakes_shape;
alter table public.quran_progress add constraint quran_progress_mistakes_shape check (jsonb_typeof(mistakes) = 'array' and jsonb_array_length(mistakes) <= 300);
alter table public.quran_progress drop constraint if exists quran_progress_marking_level_known;
alter table public.quran_progress add constraint quran_progress_marking_level_known check (marking_level is null or marking_level in ('beginner', 'junior', 'senior'));
alter table public.quran_progress drop constraint if exists quran_progress_worked_out_range;
alter table public.quran_progress add constraint quran_progress_worked_out_range check (worked_out_score is null or worked_out_score between 0 and 10);
alter table public.quran_progress drop constraint if exists quran_progress_adjust_reason_len;
alter table public.quran_progress add constraint quran_progress_adjust_reason_len check (adjust_reason is null or char_length(adjust_reason) <= 300);
-- A mark moved away from what the standard worked out needs a reason.
alter table public.quran_progress drop constraint if exists quran_progress_adjust_needs_reason;
alter table public.quran_progress add constraint quran_progress_adjust_needs_reason
  check (worked_out_score is null or score is null or score = worked_out_score or char_length(btrim(coalesce(adjust_reason, ''))) > 0);

drop trigger if exists audit_quran_marking_standard on public.quran_marking_standard;
create trigger audit_quran_marking_standard after insert or update or delete on public.quran_marking_standard
  for each row execute function public.audit_row_change();
drop trigger if exists audit_quran_class_settings on public.quran_class_settings;
create trigger audit_quran_class_settings after insert or update or delete on public.quran_class_settings
  for each row execute function public.audit_row_change();

-- Hearing a recitation inside a Qur'an class (owner, 11 Nov 2026 13:47: "include this quran system as part of
-- classroom but better"): what kind of recitation it was, and why it was dated away from the class's lesson day.
alter table public.quran_progress
  add column if not exists recitation_kind text,
  add column if not exists date_reason text;
alter table public.quran_progress drop constraint if exists quran_progress_recitation_kind_known;
alter table public.quran_progress add constraint quran_progress_recitation_kind_known
  check (recitation_kind is null or recitation_kind in ('memorisation', 'revision', 'reading'));
alter table public.quran_progress drop constraint if exists quran_progress_date_reason_len;
alter table public.quran_progress add constraint quran_progress_date_reason_len check (date_reason is null or char_length(date_reason) <= 300);

-- Lesson notes: a photo or PDF of the whiteboard or notes, posted to the class stream for the class's pupils
-- and families. A stream post with a kind and the lesson's date; who may post and read is unchanged.
alter table public.announcements
  add column if not exists kind text not null default 'post',
  add column if not exists lesson_date date;
alter table public.announcements drop constraint if exists announcements_kind_known;
alter table public.announcements add constraint announcements_kind_known check (kind in ('post', 'lesson_note'));
alter table public.announcements drop constraint if exists announcements_lesson_note_has_date;
alter table public.announcements add constraint announcements_lesson_note_has_date check (kind <> 'lesson_note' or lesson_date is not null);
