-- Revision packs: draft questions, a to-do list per unit, and draft packs made
-- automatically when a unit's lessons are all signed off (Tafweed T2 and T33).
-- Builds on 0094_unit_revision.sql and 0095_revision_teacher_packs.sql.
--
-- 1. revision_questions.review: 'pending' questions (for example drafted by AI
--    in ai-assist, staff-side only) are never active, so no pupil function
--    can serve them. A teacher approves each one, which makes it active.
--    A trigger enforces this; nothing pending can be switched on directly.
-- 2. revision_todos: the unit's to-do list ("action pack"): what each pupil
--    should do next. Written by staff only. Pupils see it only when the pack
--    is published AND a teacher has shown the list (todos_checked_at).
--    revision_todo_ticks: a pupil's own ticks, written only through
--    revision_tick_todo(); read by the pupil and the staff who teach them.
-- 3. source 'auto': a draft pack the portal made by itself when every lesson
--    in the unit was signed off as approved (curriculum_signoffs, 0102). Like
--    a staff pack it stays hidden until a teacher has checked it
--    (checked_at); revision_units_guard now enforces that for 'auto' too.
--    Teachers are told through the Action centre (packs with auto_created_at
--    and no checked_at). Making the pack never blocks the sign-off itself.
--
-- No pupil data is read or written by anything that drafts content.

-- ── 1. questions waiting for a teacher ─────────────────────────────────────
alter table public.revision_questions
  add column if not exists review text not null default 'approved',
  add column if not exists drafted_by_ai boolean not null default false,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'revision_questions_review_check') then
    alter table public.revision_questions add constraint revision_questions_review_check check (review in ('approved', 'pending'));
  end if;
end $$;

create index if not exists revision_questions_pending_idx on public.revision_questions (unit_id) where review = 'pending';

-- A pending question can never be active (pupil functions only serve active ones).
create or replace function public.revision_questions_review_guard()
returns trigger
language plpgsql
as $$
begin
  if new.review = 'pending' then
    new.active := false;
  elsif tg_op = 'UPDATE' and old.review = 'pending' and new.review = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists revision_questions_review_guard_trg on public.revision_questions;
create trigger revision_questions_review_guard_trg
  before insert or update on public.revision_questions
  for each row execute function public.revision_questions_review_guard();

-- ── 3 (columns first). auto packs and to-do list approval ──────────────────
alter table public.revision_units
  add column if not exists auto_created_at timestamptz,
  add column if not exists todos_checked_at timestamptz,
  add column if not exists todos_checked_by uuid references public.profiles(id) on delete set null;

alter table public.revision_units drop constraint if exists revision_units_source_check;
alter table public.revision_units add constraint revision_units_source_check check (source in ('content', 'staff', 'auto'));

-- Staff and auto packs stay hidden until a teacher has checked them.
create or replace function public.revision_units_guard()
returns trigger
language plpgsql
as $$
begin
  if new.source in ('staff', 'auto') and new.published and new.checked_at is null then
    raise exception 'A teacher must check this pack before pupils can see it.'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ── 2. the unit to-do list ─────────────────────────────────────────────────
create table if not exists public.revision_todos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.revision_units(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 3 and 300),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists revision_todos_unit_idx on public.revision_todos (unit_id, sort_order);

create table if not exists public.revision_todo_ticks (
  child_id uuid not null references public.children(id) on delete cascade,
  todo_id uuid not null references public.revision_todos(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (child_id, todo_id)
);

create index if not exists revision_todo_ticks_todo_idx on public.revision_todo_ticks (todo_id);

alter table public.revision_todos enable row level security;
alter table public.revision_todo_ticks enable row level security;

drop policy if exists "revision_todos: staff read" on public.revision_todos;
create policy "revision_todos: staff read"
  on public.revision_todos for select to authenticated
  using (public.revision_is_staff());

drop policy if exists "revision_todos: pupils read shown lists" on public.revision_todos;
create policy "revision_todos: pupils read shown lists"
  on public.revision_todos for select to authenticated
  using (exists (
    select 1 from public.revision_units u
    where u.id = revision_todos.unit_id
      and u.published
      and u.todos_checked_at is not null
      and u.year = public.revision_my_year()
  ));

drop policy if exists "revision_todos: teachers write" on public.revision_todos;
create policy "revision_todos: teachers write"
  on public.revision_todos for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[]))
  with check (public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[]));

drop policy if exists "revision_todo_ticks: read own or taught" on public.revision_todo_ticks;
create policy "revision_todo_ticks: read own or taught"
  on public.revision_todo_ticks for select to authenticated
  using (public.revision_can_see_child(child_id));
-- No insert/update/delete policies: pupils tick through revision_tick_todo().

drop trigger if exists audit_revision_todos on public.revision_todos;
create trigger audit_revision_todos
  after insert or update or delete on public.revision_todos
  for each row execute function public.audit_row_change();

-- A pupil ticks (or unticks) an item on a to-do list they can see.
create or replace function public.revision_tick_todo(p_todo uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child uuid := public.revision_my_child();
begin
  if v_child is null then
    raise exception 'not a pupil' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.revision_todos t join public.revision_units u on u.id = t.unit_id
    where t.id = p_todo and u.published and u.todos_checked_at is not null and u.year = public.revision_my_year()
  ) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if p_done then
    insert into public.revision_todo_ticks (child_id, todo_id) values (v_child, p_todo) on conflict do nothing;
  else
    delete from public.revision_todo_ticks where child_id = v_child and todo_id = p_todo;
  end if;
end;
$$;

revoke all on function public.revision_tick_todo(uuid, boolean) from public, anon;
grant execute on function public.revision_tick_todo(uuid, boolean) to authenticated;

-- The default to-do list for a unit, from its lessons. Only when it has none.
create or replace function public.revision_seed_todos(p_unit uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.revision_units%rowtype;
  v_n integer := 0;
  v_lessons integer;
  r record;
begin
  select * into u from public.revision_units where id = p_unit;
  if not found or exists (select 1 from public.revision_todos where unit_id = p_unit) then
    return 0;
  end if;
  select count(*) into v_lessons from public.curriculum_lessons l
   where l.subject_slug = u.subject_slug and l.year = u.year and coalesce(l.unit, 'Lessons') = u.unit;
  if v_lessons between 1 and 8 then
    for r in
      select l.lesson_no, l.title from public.curriculum_lessons l
       where l.subject_slug = u.subject_slug and l.year = u.year and coalesce(l.unit, 'Lessons') = u.unit
       order by l.lesson_no
    loop
      v_n := v_n + 1;
      insert into public.revision_todos (unit_id, body, sort_order, created_by)
      values (p_unit, left('Look back over lesson ' || r.lesson_no || ': ' || r.title || '.', 300), v_n * 10, auth.uid());
    end loop;
  else
    v_n := v_n + 1;
    insert into public.revision_todos (unit_id, body, sort_order, created_by)
    values (p_unit, 'Look back over the slides for every lesson in this unit.', v_n * 10, auth.uid());
  end if;
  insert into public.revision_todos (unit_id, body, sort_order, created_by) values
    (p_unit, 'Learn the key words for this unit until you can explain each one in your own words.', (v_n + 1) * 10, auth.uid()),
    (p_unit, 'Take the unit quiz.', (v_n + 2) * 10, auth.uid()),
    (p_unit, 'Use the practice coach on every topic you have not yet mastered.', (v_n + 3) * 10, auth.uid()),
    (p_unit, 'A week later, take the quiz again and try to beat your score.', (v_n + 4) * 10, auth.uid());
  return v_n + 4;
end;
$$;

revoke all on function public.revision_seed_todos(uuid) from public, anon, authenticated;

-- ── 3. draft packs ─────────────────────────────────────────────────────────
-- Makes a hidden draft pack for a unit from its lessons: the lessons' own
-- hinge questions (the "check" slides, already teacher-checked) and the
-- default to-do list. Does nothing when the unit already has a pack.
create or replace function public.revision_make_draft_pack(p_subject_slug text, p_year text, p_unit text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_subject text;
  v_sort integer;
begin
  select id into v_id from public.revision_units where subject_slug = p_subject_slug and year = p_year and unit = p_unit;
  if v_id is not null then
    return v_id;
  end if;
  select min(l.subject), min(l.lesson_no) into v_subject, v_sort from public.curriculum_lessons l
   where l.subject_slug = p_subject_slug and l.year = p_year and coalesce(l.unit, 'Lessons') = p_unit;
  if v_subject is null then
    return null;
  end if;
  insert into public.revision_units (subject_slug, subject, year, unit, title, kind, published, sort_order, source, created_by, auto_created_at)
  values (p_subject_slug, v_subject, p_year, p_unit, p_unit, 'lessons', false, coalesce(v_sort, 0), 'auto', auth.uid(), now())
  returning id into v_id;

  -- Same keys as scripts/lessons/sync-revision.mjs (L<n>-c<i>), so a later sync updates rather than duplicates them.
  insert into public.revision_questions (unit_id, qkey, lesson_no, topic, question, options, answer, explanation, in_quiz, source)
  select v_id, 'L' || l.lesson_no || '-c' || c.i, l.lesson_no, l.title, left(c.chk->>'q', 600), c.chk->'options', (c.chk->>'answer')::int,
         nullif(c.chk->>'why', ''), true, 'content'
    from public.curriculum_lessons l
    cross join lateral (
      select t.elem->'check' as chk, row_number() over (order by t.ord) as i
        from jsonb_array_elements(case when jsonb_typeof(l.content->'teach') = 'array' then l.content->'teach' else '[]'::jsonb end) with ordinality as t(elem, ord)
       where jsonb_typeof(t.elem->'check') = 'object'
    ) c
   where l.subject_slug = p_subject_slug and l.year = p_year and coalesce(l.unit, 'Lessons') = p_unit
     and jsonb_typeof(c.chk->'options') = 'array'
     and jsonb_array_length(c.chk->'options') between 2 and 6
     and char_length(coalesce(c.chk->>'q', '')) >= 3
     and (c.chk->>'answer') ~ '^[0-9]+$'
     and (c.chk->>'answer')::int < jsonb_array_length(c.chk->'options')
  on conflict (unit_id, qkey) do nothing;

  perform public.revision_seed_todos(v_id);
  return v_id;
end;
$$;

revoke all on function public.revision_make_draft_pack(text, text, text) from public, anon, authenticated;

-- Teachers: "Make a draft pack from the lessons" (hidden until checked).
create or replace function public.revision_create_draft_pack(p_subject_slug text, p_year text, p_unit text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_id := public.revision_make_draft_pack(p_subject_slug, p_year, p_unit);
  if v_id is null then
    raise exception 'This unit has no lessons in the Lesson library yet.' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

revoke all on function public.revision_create_draft_pack(text, text, text) from public, anon;
grant execute on function public.revision_create_draft_pack(text, text, text) to authenticated;

-- Teachers: the default to-do list for a pack that has none yet.
create or replace function public.revision_create_todos(p_unit uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return public.revision_seed_todos(p_unit);
end;
$$;

revoke all on function public.revision_create_todos(uuid) from public, anon;
grant execute on function public.revision_create_todos(uuid) to authenticated;

-- When a lesson sign-off becomes 'approved' and every lesson in that unit is
-- now approved, make the unit's draft pack. Any failure here is only a
-- warning: the sign-off itself must always save.
create or replace function public.revision_on_lesson_signoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text;
  v_no integer;
  v_unit text;
begin
  if new.scope <> 'lesson' or new.status <> 'approved' or new.ref !~ '^[a-z0-9]+/[0-9]+$' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    return new;
  end if;
  begin
    v_year := split_part(new.ref, '/', 1);
    v_no := split_part(new.ref, '/', 2)::int;
    select coalesce(l.unit, 'Lessons') into v_unit from public.curriculum_lessons l
     where l.subject_slug = new.subject_slug and l.year = v_year and l.lesson_no = v_no;
    if v_unit is null then
      return new;
    end if;
    if exists (
      select 1 from public.curriculum_lessons l
       where l.subject_slug = new.subject_slug and l.year = v_year and coalesce(l.unit, 'Lessons') = v_unit
         and not exists (
           select 1 from public.curriculum_signoffs s
            where s.subject_slug = l.subject_slug and s.scope = 'lesson' and s.ref = l.year || '/' || l.lesson_no
              and (s.status = 'approved' or s.id = new.id)
         )
    ) then
      return new;
    end if;
    perform public.revision_make_draft_pack(new.subject_slug, v_year, v_unit);
  exception when others then
    raise warning 'revision draft pack for %/% not made: %', new.subject_slug, new.ref, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.revision_on_lesson_signoff() from public, anon, authenticated;

drop trigger if exists revision_on_lesson_signoff_trg on public.curriculum_signoffs;
create trigger revision_on_lesson_signoff_trg
  after insert or update on public.curriculum_signoffs
  for each row execute function public.revision_on_lesson_signoff();

-- Staff list (replaces 0095's): also says whether a pack was made
-- automatically, how many questions wait for a teacher, and the to-do list.
create or replace function public.revision_units_for_year(p_year text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_leader boolean := public.revision_is_leader();
begin
  if not public.revision_is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'subject_slug', u.subject_slug, 'subject', u.subject, 'unit', u.unit, 'title', u.title, 'kind', u.kind,
      'published', u.published, 'has_video', u.video_path is not null,
      'source', u.source, 'checked_at', u.checked_at, 'auto_created_at', u.auto_created_at,
      'todos', (select count(*) from public.revision_todos t where t.unit_id = u.id),
      'todos_checked_at', u.todos_checked_at,
      'questions', (select count(*) from public.revision_questions q where q.unit_id = u.id and q.active and q.in_quiz),
      'practice_questions', (select count(*) from public.revision_questions q where q.unit_id = u.id and q.active and not q.in_quiz),
      'pending_questions', (select count(*) from public.revision_questions q where q.unit_id = u.id and q.review = 'pending'),
      'takers', (select count(distinct a.child_id) from public.revision_attempts a
                 where a.unit_id = u.id and a.answered > 0 and (v_leader or public.child_taught_by(a.child_id, auth.uid())))
    ) order by u.subject, u.sort_order, u.title)
    from public.revision_units u where u.year = p_year
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.revision_units_for_year(text) from public, anon;
grant execute on function public.revision_units_for_year(text) to authenticated;

-- AI usage: the new staff-side "draft revision questions" task shares the daily cap.
alter table public.ai_usage drop constraint if exists ai_usage_task_check;
alter table public.ai_usage add constraint ai_usage_task_check
  check (task in ('report_comment', 'tarbiyah_note', 'message_triage', 'recruitment_screen', 'revision_questions'));
