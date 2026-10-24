-- Website content: key-stage curriculum pages become editable, and admins
-- control exactly which policies the public Policies page shows.
--
--  * key_stage_pages: one row per /curriculum/<slug> page (subjects, live
--    lessons a week, intro, notes). Until now this lived only in
--    src/content/curriculum.ts, so changing "Lessons a week" meant a code
--    change. Seeded from that file; the file stays as the build-time
--    fallback when the database can't be reached.
--  * policy_links.visibility: 'public' (listed on the website) or 'staff'
--    (kept for staff signing / the compliance tracker, never listed
--    publicly). Lets the internal policies (11, 30-33) live in the same
--    table as the published ones. The anonymous read policy now hides
--    staff-only rows; staff keep reading everything.
--  * policy_links.featured: shown in the "Key documents" box at the top of
--    the Policies page (was a hard-coded list of policy numbers).
--  * site_settings.policies_intro / policies_accessible_formats_note: the
--    editable sentences at the top and bottom of the Policies page.
--
-- Idempotent.

-- ── key_stage_pages ────────────────────────────────────────────────────────
create table if not exists public.key_stage_pages (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  range text not null,
  title text not null,
  intro text,
  subjects jsonb not null default '[]'::jsonb,
  weekly jsonb not null default '[]'::jsonb,
  lesson_length text,
  total_lessons text,
  note text,
  gcse_note text,
  order_index integer not null default 0,
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.key_stage_pages enable row level security;
drop policy if exists "key_stage_pages: public read" on public.key_stage_pages;
create policy "key_stage_pages: public read" on public.key_stage_pages for select using (true);
drop policy if exists "key_stage_pages: headteacher/admin write" on public.key_stage_pages;
create policy "key_stage_pages: headteacher/admin write" on public.key_stage_pages
  for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']) or public.current_role_is(array['admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']) or public.current_role_is(array['admin']));

insert into public.key_stage_pages (slug, range, title, intro, subjects, weekly, lesson_length, total_lessons, note, gcse_note, order_index) values
  ('reception-year-2', 'Year 1 – Year 2', 'Key Stage 1', 'Short, engaging live sessions focused on phonics, early reading and number, with Qur''an, du''a and Islamic manners. Much of the learning is practical and done away from the screen with a parent, following guidance sent home each week.', '["Phonics and early reading (a systematic synthetic phonics programme)", "English", "Mathematics and number", "Understanding the world and science", "Qur''an, du''a and Islamic manners", "Arabic and Islamic Studies", "PSHE, PE, art and wellbeing"]'::jsonb, '[{"subject": "English and phonics", "lessons": 5}, {"subject": "Mathematics", "lessons": 4}, {"subject": "Understanding the world", "lessons": 1}, {"subject": "Qur''an and Tajweed", "lessons": 3}, {"subject": "Arabic and Islamic Studies", "lessons": 1}, {"subject": "PSHE, RSE, PE, art and wellbeing", "lessons": 1}]'::jsonb, '30 minutes', '15 live lessons a week (Years 1–2)', 'Years 1–2 have short daily live sessions (about 2 hours a day) with guided activities at home. A four-day live week (Monday to Thursday, with Friday as a structured independent study day) is also available for Year 1 to Year 9.', null, 1),
  ('year-3-6', 'Year 3 – Year 6', 'Key Stage 2', 'A full live timetable taught by qualified teachers, with homework and independent tasks set and marked between lessons.', '["English", "Mathematics", "Science", "History", "Geography", "Computing", "Art and design", "PE (at home)", "PSHE and RSE", "Qur''an and Tajweed", "Arabic", "Islamic Studies"]'::jsonb, '[{"subject": "English", "lessons": 5}, {"subject": "Mathematics", "lessons": 5}, {"subject": "Science", "lessons": 2}, {"subject": "History, geography and computing", "lessons": 2}, {"subject": "Qur''an and Tajweed", "lessons": 2}, {"subject": "Arabic and Islamic Studies", "lessons": 2}, {"subject": "PSHE, RSE, PE, art and wellbeing", "lessons": 2}]'::jsonb, '45 minutes', '20 live lessons a week', 'A four-day live week (Monday to Thursday, with Friday as a structured independent study day) is available for Year 1 to Year 9.', null, 2),
  ('year-7-9', 'Year 7 – Year 9', 'Key Stage 3', 'Live subject lessons across the week, building the independent study habits pupils need ahead of GCSE.', '["English", "Mathematics", "Science (biology, chemistry and physics)", "History", "Geography", "Computing", "Arabic", "Art and design", "PE and wellbeing", "PSHE and RSE", "Qur''an", "Islamic Studies"]'::jsonb, '[{"subject": "English", "lessons": 4}, {"subject": "Mathematics", "lessons": 4}, {"subject": "Science", "lessons": 4}, {"subject": "History, geography and computing", "lessons": 3}, {"subject": "Qur''an and Tajweed", "lessons": 3}, {"subject": "Arabic and Islamic Studies", "lessons": 4}, {"subject": "PSHE, RSE, PE, art and wellbeing", "lessons": 3}]'::jsonb, '50 minutes', '25 live lessons a week', 'A four-day live week (Monday to Thursday, with Friday as a structured independent study day) is available for Year 1 to Year 9.', null, 3),
  ('year-10-11', 'Year 10 – Year 11', 'Key Stage 4 (GCSE)', 'Live GCSE and International GCSE lessons in every subject. Subjects are chosen so they suit online learners sitting exams as private candidates, for example without practical components that need a centre.', '["GCSE or International GCSE English Language", "English Literature", "Mathematics", "Combined or separate sciences", "Islamic Studies", "Two options, for example history, geography, computer science, business or Arabic", "Qur''an and Tajweed"]'::jsonb, '[{"subject": "English", "lessons": 5}, {"subject": "Mathematics", "lessons": 5}, {"subject": "Sciences", "lessons": 5}, {"subject": "Two GCSE options", "lessons": 4}, {"subject": "Qur''an and Tajweed", "lessons": 2}, {"subject": "Arabic and Islamic Studies", "lessons": 2}, {"subject": "PSHE, RSE, PE and wellbeing", "lessons": 2}]'::jsonb, '50 minutes', '25 live lessons a week', 'Years 10 and 11 follow the full live timetable, because GCSE courses need it.', 'Exam entry fees are not included in tuition: families register their child at an approved exam centre and pay the centre''s charges.', 4)
on conflict (slug) do nothing;

-- ── policy_links: visibility + featured ───────────────────────────────────
alter table public.policy_links
  add column if not exists visibility text not null default 'public' check (visibility in ('public', 'staff')),
  add column if not exists featured boolean not null default false;

update public.policy_links set featured = true
  where featured = false and deleted_at is null and number in ('01', '24', '25', '26', '28');

drop policy if exists "policy_links: public read" on public.policy_links;
create policy "policy_links: public read" on public.policy_links
  for select using (deleted_at is null and visibility = 'public');

-- Staff keep reading everything (staff-only rows included), so signing and
-- the compliance tracker are unaffected.
drop policy if exists "policy_links: staff read all" on public.policy_links;
create policy "policy_links: staff read all" on public.policy_links
  for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions', 'teacher']) or public.current_role_is(array['admin']));

-- ── site_settings: Policies page copy ─────────────────────────────────────
alter table public.site_settings
  add column if not exists policies_intro text,
  add column if not exists policies_accessible_formats_note text;
