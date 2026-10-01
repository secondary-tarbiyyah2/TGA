-- School day: admin-editable periods.
--
-- Until now the lesson periods were hard-coded (src/lib/learn/timetable.ts
-- PERIODS and scripts/timetable-solver/generate.py). This table holds every
-- block of the school day so the head can edit it from
-- /learn/admin/lessons/day:
--   lesson      a teaching period (the solver places lessons only here)
--   break       a short break
--   lunch       lunch
--   prayer      a prayer break
--   enrichment  a supervised NON-teaching block (games, play, nasheed,
--               reading club, outdoor activity...). Shown on student, family
--               and teacher timetables and the calendar feed; it has no
--               teacher, so there is no clash logic.
-- applies_to limits a row to a group of year groups: 'all', 'primary'
-- (Reception-Year 6), 'ks3' (Years 7-9), 'gcse' (Years 10-11), or an exact
-- year group name such as 'Year 9'. GCSE years get an extended day.
-- weekdays uses 1 = Monday .. 5 = Friday (0 = Sunday, 6 = Saturday allowed).
--
-- Idempotent. The seed only runs while the table is empty, so edits made by
-- the head are never overwritten. With no active rows the app and the solver
-- fall back to the old hard-coded periods.

create table if not exists public.timetable_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  kind text not null default 'lesson'
    check (kind in ('lesson', 'break', 'lunch', 'prayer', 'enrichment')),
  start_time time not null,
  end_time time not null,
  weekdays int[] not null default '{1,2,3,4,5}'
    check (cardinality(weekdays) > 0 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]),
  band text,
  applies_to text[] not null default '{all}'
    check (cardinality(applies_to) > 0),
  activity text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists timetable_periods_sort_idx
  on public.timetable_periods (sort, start_time);

alter table public.timetable_periods enable row level security;

drop policy if exists "timetable_periods: authenticated read" on public.timetable_periods;
create policy "timetable_periods: authenticated read"
  on public.timetable_periods for select to authenticated
  using (true);

drop policy if exists "timetable_periods: head/admin insert" on public.timetable_periods;
create policy "timetable_periods: head/admin insert"
  on public.timetable_periods for insert to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "timetable_periods: head/admin update" on public.timetable_periods;
create policy "timetable_periods: head/admin update"
  on public.timetable_periods for update to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "timetable_periods: head/admin delete" on public.timetable_periods;
create policy "timetable_periods: head/admin delete"
  on public.timetable_periods for delete to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- Starter day. Lessons 1-6 reproduce the old hard-coded grid exactly; the
-- rest is a sensible, editable suggestion.
insert into public.timetable_periods (name, kind, start_time, end_time, band, applies_to, activity, sort, active)
select v.name, v.kind, v.start_time::time, v.end_time::time, v.band, v.applies_to, v.activity, v.sort, v.active
from (values
  ('Period 1',            'lesson',     '09:00', '10:00', 'A', '{all}'::text[],             null,                    10, true),
  ('Period 2',            'lesson',     '10:00', '11:00', 'A', '{all}'::text[],             null,                    20, true),
  ('Break',               'break',      '11:00', '11:15', 'A', '{all}'::text[],             null,                    30, true),
  ('Period 3',            'lesson',     '11:15', '12:15', 'A', '{all}'::text[],             null,                    40, true),
  ('Lunch & Zuhr prayer', 'lunch',      '12:15', '12:45', 'A', '{all}'::text[],             null,                    50, true),
  ('GCSE Period 7',       'lesson',     '12:45', '13:45', 'A', '{gcse}'::text[],            null,                    60, true),
  ('Enrichment',          'enrichment', '12:45', '13:30', 'A', '{primary,ks3}'::text[],     'Games & play',          65, true),
  ('GCSE Period 8',       'lesson',     '13:45', '14:45', 'A', '{gcse}'::text[],            null,                    70, true),
  ('GCSE Break',          'break',      '14:45', '15:00', 'A', '{gcse}'::text[],            null,                    80, true),
  ('Period 4',            'lesson',     '15:00', '16:00', 'B', '{all}'::text[],             null,                    90, true),
  ('Period 5',            'lesson',     '16:00', '17:00', 'B', '{all}'::text[],             null,                   100, true),
  ('Break',               'break',      '17:00', '17:15', 'B', '{all}'::text[],             null,                   110, true),
  ('Period 6',            'lesson',     '17:15', '18:15', 'B', '{all}'::text[],             null,                   120, true),
  ('Evening enrichment',  'enrichment', '18:15', '18:45', 'B', '{all}'::text[],             'Nasheed & reading club', 130, false),
  ('GCSE Period 9',       'lesson',     '18:30', '19:30', 'B', '{gcse}'::text[],            null,                   140, false)
) as v(name, kind, start_time, end_time, band, applies_to, activity, sort, active)
where not exists (select 1 from public.timetable_periods);
