-- School day matches the prospectus (UK time).
--
-- Until now the default day (migration 0066, the app's built-in grid and the
-- solver) used 60-minute periods, a 30-minute lunch at 12:15 and an
-- afternoon/evening block 15:00-18:15. The prospectus day is:
--
--   Monday-Thursday            Friday
--   09:00-09:10 Form time      09:00-09:10 Form time
--   09:10-10:00 Lesson 1       09:10-10:00 Lesson 1
--   10:00-10:10 Break          10:00-10:10 Break
--   10:10-11:00 Lesson 2       10:10-11:00 Lesson 2
--   11:00-11:10 Break          11:00-11:10 Break
--   11:10-12:00 Lesson 3       11:10-12:00 Lesson 3
--   12:00-13:00 Lunch & Dhuhr  (then Jumu'ah; no afternoon lessons)
--   13:00-13:50 Lesson 4
--   13:50-14:00 Break (Asr, extended Nov-Feb)
--   14:00-14:50 Lesson 5
--   14:50-15:00 End of day     No lessons after 15:00.
--
-- Lesson lengths: Years 1-2 30 min, Years 3-6 45 min, Years 7-11 50 min.
-- Shorter primary lessons start at the period start and end early.
--
-- Same day as src/lib/learn/timetable.ts (PERIODS / FALLBACK_PERIODS) and
-- scripts/timetable-solver/generate.py (_DEFAULT_GRID).
--
-- Safe and idempotent:
--   * timetable_periods is only changed while EVERY row is still an
--     unedited default (the 0066 seed or the old "load starter day" rows).
--     If the head has edited, added or switched off anything, the table is
--     left alone and a NOTICE says so. Default rows are updated in place
--     (ids kept), unmatched default lesson/break rows are removed, and a
--     default enrichment block is only switched off (its register history
--     is kept). With no rows at all nothing is inserted: the app and the
--     solver already fall back to the new built-in day.
--   * classes.lesson_length_minutes: the column default becomes 50 and only
--     classes still on the old default of 60 get their year group's length.
--   * Published and draft timetables (timetable_runs / timetable_slots) and
--     lesson_instances are never changed. Slots that sit outside the new day
--     are only counted in a NOTICE so the head can re-run or move them.

-- ── 1. School-day periods ───────────────────────────────────────────────
do $$
declare
  v_total int;
  v_default int;
begin
  if to_regclass('public.timetable_periods') is null then
    return;
  end if;

  create temporary table _old_default_period (
    name text, kind text, start_time time, end_time time, applies_to text[], activity text, active boolean
  ) on commit drop;
  insert into _old_default_period values
    -- migration 0066 seed
    ('Period 1',            'lesson',     '09:00', '10:00', '{all}',           null,                     true),
    ('Period 2',            'lesson',     '10:00', '11:00', '{all}',           null,                     true),
    ('Break',               'break',      '11:00', '11:15', '{all}',           null,                     true),
    ('Period 3',            'lesson',     '11:15', '12:15', '{all}',           null,                     true),
    ('Lunch & Zuhr prayer', 'lunch',      '12:15', '12:45', '{all}',           null,                     true),
    ('GCSE Period 7',       'lesson',     '12:45', '13:45', '{gcse}',          null,                     true),
    ('Enrichment',          'enrichment', '12:45', '13:30', '{primary,ks3}',   'Games & play',           true),
    ('GCSE Period 8',       'lesson',     '13:45', '14:45', '{gcse}',          null,                     true),
    ('GCSE Break',          'break',      '14:45', '15:00', '{gcse}',          null,                     true),
    ('Period 4',            'lesson',     '15:00', '16:00', '{all}',           null,                     true),
    ('Period 5',            'lesson',     '16:00', '17:00', '{all}',           null,                     true),
    ('Break',               'break',      '17:00', '17:15', '{all}',           null,                     true),
    ('Period 6',            'lesson',     '17:15', '18:15', '{all}',           null,                     true),
    ('Evening enrichment',  'enrichment', '18:15', '18:45', '{all}',           'Nasheed & reading club', false),
    ('GCSE Period 9',       'lesson',     '18:30', '19:30', '{gcse}',          null,                     false);
    -- The old "Load the starter day" button inserted Period 1-6 and the two
    -- Breaks with exactly the values above, so the same list covers it.

  select count(*) into v_total from public.timetable_periods;
  if v_total = 0 then
    return; -- nothing stored: the built-in (new) day is used
  end if;

  select count(*) into v_default
  from public.timetable_periods p
  where p.weekdays = '{1,2,3,4,5}'::int[]
    and p.supervisor_user_id is null
    and exists (
      select 1 from _old_default_period o
      where o.name = p.name and o.kind = p.kind
        and o.start_time = p.start_time and o.end_time = p.end_time
        and o.applies_to = p.applies_to
        and o.activity is not distinct from p.activity
        and o.active = p.active
    );

  if v_default <> v_total then
    -- Already moved (a re-run): every row is either a new-day block or a switched-off default enrichment block.
    if not exists (
      select 1 from public.timetable_periods p
      where not (p.kind = 'enrichment' and not p.active and p.supervisor_user_id is null)
        and not (p.kind, p.start_time, p.end_time) in (
          ('break', '09:00'::time, '09:10'::time), ('lesson', '09:10', '10:00'), ('break', '10:00', '10:10'),
          ('lesson', '10:10', '11:00'), ('break', '11:00', '11:10'), ('lesson', '11:10', '12:00'),
          ('lunch', '12:00', '13:00'), ('lesson', '13:00', '13:50'), ('break', '13:50', '14:00'),
          ('lesson', '14:00', '14:50'), ('break', '14:50', '15:00'))
    ) then
      raise notice '0150: timetable_periods is already on the prospectus school day.';
      return;
    end if;
    raise notice '0150: timetable_periods has been edited by the school (% of % rows are unedited defaults); left unchanged. Check the school day at /learn/admin/lessons/day against the prospectus.', v_default, v_total;
    return;
  end if;

  -- Every row is an unedited default: move it onto the prospectus day.
  create temporary table _period_map (
    old_kind text, old_start time, old_end time,
    new_name text, new_start time, new_end time, new_weekdays int[], new_sort int
  ) on commit drop;
  insert into _period_map values
    ('lesson', '09:00', '10:00', 'Lesson 1',                      '09:10', '10:00', '{1,2,3,4,5}', 10),
    ('lesson', '10:00', '11:00', 'Lesson 2',                      '10:10', '11:00', '{1,2,3,4,5}', 20),
    ('break',  '11:00', '11:15', 'Break',                         '11:00', '11:10', '{1,2,3,4,5}', 25),
    ('lesson', '11:15', '12:15', 'Lesson 3',                      '11:10', '12:00', '{1,2,3,4,5}', 30),
    ('lunch',  '12:15', '12:45', 'Lunch & Dhuhr',                 '12:00', '13:00', '{1,2,3,4}',   35),
    ('lesson', '15:00', '16:00', 'Lesson 4',                      '13:00', '13:50', '{1,2,3,4}',   40),
    ('break',  '17:00', '17:15', 'Break (Asr, extended Nov-Feb)', '13:50', '14:00', '{1,2,3,4}',   45),
    ('lesson', '16:00', '17:00', 'Lesson 5',                      '14:00', '14:50', '{1,2,3,4}',   50);

  -- Default enrichment blocks: switched off (kept, with any register history).
  update public.timetable_periods p set active = false
  where p.kind = 'enrichment' and p.active;

  -- Default lesson/break/lunch rows with no place in the new day (GCSE extended
  -- day, Period 6, GCSE Period 9, duplicates from loading the starter twice).
  delete from public.timetable_periods p
  where p.kind <> 'enrichment'
    and (
      not exists (select 1 from _period_map m where m.old_kind = p.kind and m.old_start = p.start_time and m.old_end = p.end_time)
      or p.id <> (
        select min(q.id::text)::uuid from public.timetable_periods q
        where q.kind = p.kind and q.start_time = p.start_time and q.end_time = p.end_time
      )
    );

  update public.timetable_periods p
  set name = m.new_name, start_time = m.new_start, end_time = m.new_end,
      weekdays = m.new_weekdays, sort = m.new_sort, band = 'A', applies_to = '{all}', active = true
  from _period_map m
  where m.old_kind = p.kind and m.old_start = p.start_time and m.old_end = p.end_time;

  -- Blocks the old day did not have (and any mapped block that was missing).
  insert into public.timetable_periods (name, kind, start_time, end_time, weekdays, band, applies_to, activity, sort, active)
  select v.name, v.kind, v.start_time::time, v.end_time::time, v.weekdays::int[], 'A', '{all}'::text[], null, v.sort, true
  from (values
    ('Form time',                     'break',  '09:00', '09:10', '{1,2,3,4,5}',  5),
    ('Lesson 1',                      'lesson', '09:10', '10:00', '{1,2,3,4,5}', 10),
    ('Break',                         'break',  '10:00', '10:10', '{1,2,3,4,5}', 15),
    ('Lesson 2',                      'lesson', '10:10', '11:00', '{1,2,3,4,5}', 20),
    ('Break',                         'break',  '11:00', '11:10', '{1,2,3,4,5}', 25),
    ('Lesson 3',                      'lesson', '11:10', '12:00', '{1,2,3,4,5}', 30),
    ('Lunch & Dhuhr',                 'lunch',  '12:00', '13:00', '{1,2,3,4}',   35),
    ('Lesson 4',                      'lesson', '13:00', '13:50', '{1,2,3,4}',   40),
    ('Break (Asr, extended Nov-Feb)', 'break',  '13:50', '14:00', '{1,2,3,4}',   45),
    ('Lesson 5',                      'lesson', '14:00', '14:50', '{1,2,3,4}',   50),
    ('End of day',                    'break',  '14:50', '15:00', '{1,2,3,4}',   55)
  ) as v(name, kind, start_time, end_time, weekdays, sort)
  where not exists (
    select 1 from public.timetable_periods p
    where p.kind = v.kind and p.start_time = v.start_time::time and p.end_time = v.end_time::time
  );

  raise notice '0150: timetable_periods moved onto the prospectus school day.';
end $$;

-- ── 2. Lesson length per year group ─────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'classes' and column_name = 'lesson_length_minutes'
  ) then
    return;
  end if;

  alter table public.classes alter column lesson_length_minutes set default 50;

  -- Only classes still on the old default of 60 minutes.
  update public.classes c
  set lesson_length_minutes = case
      when lower(btrim(coalesce(y.name, c.year_group, ''))) like 'reception%' then 30
      when substring(coalesce(y.name, c.year_group, '') from '(\d+)') is null then 50
      when substring(coalesce(y.name, c.year_group, '') from '(\d+)')::int <= 2 then 30
      when substring(coalesce(y.name, c.year_group, '') from '(\d+)')::int <= 6 then 45
      else 50
    end
  from public.classes c2
  left join public.year_groups y on y.id = c2.year_group_id
  where c2.id = c.id and c.lesson_length_minutes = 60;
end $$;

-- ── 3. Report (read only) ───────────────────────────────────────────────
do $$
declare
  r record;
begin
  if to_regclass('public.timetable_slots') is null or to_regclass('public.timetable_runs') is null then
    return;
  end if;
  for r in
    select tr.status, count(*) as n
    from public.timetable_slots s
    join public.timetable_runs tr on tr.id = s.run_id
    where tr.status in ('draft', 'review', 'published')
      and (s.start_time < '09:10' or s.end_time > '15:00'
           or (s.weekday = 5 and s.end_time > '12:00')
           or (s.start_time < '13:00' and s.end_time > '12:00'))
    group by tr.status
  loop
    raise notice '0150: % % timetable slot(s) sit outside the prospectus lesson times (left unchanged; re-run the generator or move them in the grid).', r.n, r.status;
  end loop;
end $$;
