-- Unit revision: per-unit revision packs for pupils (summary slides or the
-- unit's lesson slides, a quiz, a practice coach), with results for staff.
--
-- Safeguarding / privacy design (DESIGN.md: needs human review before pupils use it):
--   * Pupils never read the question table, so correct answers never reach their
--     browser before they answer. Marking happens in revision_answer() on the server.
--   * Pupils only see their own attempts and mastery; teachers see the pupils in the
--     classes they teach; head teacher and admin see everyone.
--   * No AI and no third party: every question, hint and explanation is written or
--     checked by staff and loaded from content/ (see scripts/lessons/sync-revision.mjs).
--   * Pupils cannot write to any table directly; every write goes through the
--     security-definer functions below, which check the attempt is theirs.

-- ── tables ───────────────────────────────────────────────────────────────
create table if not exists public.revision_units (
  id uuid primary key default gen_random_uuid(),
  subject_slug text not null,
  subject text not null,
  year text not null check (year ~ '^(reception|y([1-9]|10|11))$'),
  unit text not null,
  title text not null,
  -- 'lessons': the summary is the unit's lesson slides from the Lesson library.
  -- 'summary': the pack has its own summary slides (and usually a video).
  kind text not null default 'lessons' check (kind in ('lessons', 'summary')),
  summary jsonb not null default '[]'::jsonb check (jsonb_typeof(summary) = 'array'),
  video_path text,
  published boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (subject_slug, year, unit)
);

create index if not exists revision_units_year_idx on public.revision_units (year, subject_slug, sort_order);

create table if not exists public.revision_questions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.revision_units(id) on delete cascade,
  qkey text not null,
  lesson_no integer,
  topic text not null,
  question text not null check (char_length(question) between 3 and 600),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  answer integer not null check (answer >= 0),
  explanation text,
  hint text,
  -- Optional note for a specific wrong option, keyed by option index: {"2": "…"}.
  wrong jsonb not null default '{}'::jsonb check (jsonb_typeof(wrong) = 'object'),
  active boolean not null default true,
  -- false: practice coach only (e.g. key-word questions), not in the unit quiz.
  in_quiz boolean not null default true,
  -- 'content': loaded from content/ by the sync script (which may update or retire it);
  -- 'staff': added in the portal, never touched by the sync.
  source text not null default 'staff' check (source in ('content', 'staff')),
  updated_at timestamptz not null default now(),
  unique (unit_id, qkey),
  check (answer < jsonb_array_length(options))
);

create index if not exists revision_questions_unit_idx on public.revision_questions (unit_id) where active;

create table if not exists public.revision_attempts (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.revision_units(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  mode text not null check (mode in ('quiz', 'practice')),
  topic text,
  total integer not null default 0,
  answered integer not null default 0,
  correct integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists revision_attempts_child_idx on public.revision_attempts (child_id, unit_id, started_at desc);
create index if not exists revision_attempts_unit_idx on public.revision_attempts (unit_id, mode, finished_at desc);

create table if not exists public.revision_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.revision_attempts(id) on delete cascade,
  question_id uuid not null references public.revision_questions(id) on delete cascade,
  chosen integer not null check (chosen >= 0),
  correct boolean not null,
  used_hint boolean not null default false,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists revision_answers_question_idx on public.revision_answers (question_id);

create table if not exists public.revision_mastery (
  child_id uuid not null references public.children(id) on delete cascade,
  unit_id uuid not null references public.revision_units(id) on delete cascade,
  topic text not null,
  level smallint not null default 0 check (level between 0 and 3),
  correct integer not null default 0,
  wrong integer not null default 0,
  last_up_on date,
  next_review_on date,
  updated_at timestamptz not null default now(),
  primary key (child_id, unit_id, topic)
);

-- ── helpers ──────────────────────────────────────────────────────────────
-- "Year 10" / "Y10" / "Reception" -> 'y10' / 'reception' (matches curriculum_lessons.year).
create or replace function public.revision_year_key(p_name text)
returns text
language sql
immutable
as $$
  select case
    when p_name is null then null
    when lower(p_name) like '%reception%' then 'reception'
    when substring(p_name from '(\d{1,2})') is not null
      and substring(p_name from '(\d{1,2})')::int between 1 and 11
      then 'y' || substring(p_name from '(\d{1,2})')::int::text
  end;
$$;

-- The signed-in pupil's child record.
create or replace function public.revision_my_child()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select sa.child_id from public.student_accounts sa where sa.profile_id = auth.uid() limit 1;
$$;

-- The signed-in pupil's year ('y7' …), from their year group, else their classes.
create or replace function public.revision_my_year()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select public.revision_year_key(yg.name)
       from public.student_accounts sa
       join public.children c on c.id = sa.child_id
       join public.year_groups yg on yg.id = c.year_group_id
      where sa.profile_id = auth.uid()
      limit 1),
    (select public.revision_year_key(cl.year_group)
       from public.student_accounts sa
       join public.enrolments e on e.child_id = sa.child_id
       join public.classes cl on cl.id = e.class_id
      where sa.profile_id = auth.uid() and public.revision_year_key(cl.year_group) is not null
      limit 1)
  );
$$;

create or replace function public.revision_is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']::public.learn_role[]);
$$;

create or replace function public.revision_is_leader()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_has_role(array['head_teacher', 'admin']::public.learn_role[]);
$$;

-- Can the signed-in user see this pupil's revision results?
create or replace function public.revision_can_see_child(p_child uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.revision_is_leader()
      or public.child_taught_by(p_child, auth.uid())
      or public.child_belongs_to_student(p_child);
$$;

create or replace function public.revision_attempt_visible(p_attempt uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.revision_attempts a where a.id = p_attempt and public.revision_can_see_child(a.child_id));
$$;

grant execute on function public.revision_year_key(text) to authenticated;
revoke all on function public.revision_my_child() from public, anon;
revoke all on function public.revision_my_year() from public, anon;
revoke all on function public.revision_is_staff() from public, anon;
revoke all on function public.revision_is_leader() from public, anon;
revoke all on function public.revision_can_see_child(uuid) from public, anon;
revoke all on function public.revision_attempt_visible(uuid) from public, anon;
grant execute on function public.revision_my_child() to authenticated;
grant execute on function public.revision_my_year() to authenticated;
grant execute on function public.revision_is_staff() to authenticated;
grant execute on function public.revision_is_leader() to authenticated;
grant execute on function public.revision_can_see_child(uuid) to authenticated;
grant execute on function public.revision_attempt_visible(uuid) to authenticated;

-- ── row level security ───────────────────────────────────────────────────
alter table public.revision_units enable row level security;
alter table public.revision_questions enable row level security;
alter table public.revision_attempts enable row level security;
alter table public.revision_answers enable row level security;
alter table public.revision_mastery enable row level security;

drop policy if exists "revision_units: staff read" on public.revision_units;
create policy "revision_units: staff read"
  on public.revision_units for select to authenticated
  using (public.revision_is_staff());

drop policy if exists "revision_units: pupils read their year" on public.revision_units;
create policy "revision_units: pupils read their year"
  on public.revision_units for select to authenticated
  using (published and year = public.revision_my_year());

drop policy if exists "revision_units: teachers update" on public.revision_units;
create policy "revision_units: teachers update"
  on public.revision_units for update to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[]))
  with check (public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[]));

-- Questions (with answers) are for staff only.
drop policy if exists "revision_questions: staff read" on public.revision_questions;
create policy "revision_questions: staff read"
  on public.revision_questions for select to authenticated
  using (public.revision_is_staff());

drop policy if exists "revision_questions: teachers write" on public.revision_questions;
create policy "revision_questions: teachers write"
  on public.revision_questions for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[]))
  with check (public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[]));

drop policy if exists "revision_attempts: read own or taught" on public.revision_attempts;
create policy "revision_attempts: read own or taught"
  on public.revision_attempts for select to authenticated
  using (public.revision_can_see_child(child_id));

drop policy if exists "revision_answers: read own or taught" on public.revision_answers;
create policy "revision_answers: read own or taught"
  on public.revision_answers for select to authenticated
  using (public.revision_attempt_visible(attempt_id));

drop policy if exists "revision_mastery: read own or taught" on public.revision_mastery;
create policy "revision_mastery: read own or taught"
  on public.revision_mastery for select to authenticated
  using (public.revision_can_see_child(child_id));

drop trigger if exists audit_revision_units on public.revision_units;
create trigger audit_revision_units
  after insert or update or delete on public.revision_units
  for each row execute function public.audit_row_change();

drop trigger if exists audit_revision_questions on public.revision_questions;
create trigger audit_revision_questions
  after insert or update or delete on public.revision_questions
  for each row execute function public.audit_row_change();

-- ── pupil functions ──────────────────────────────────────────────────────
-- Units for the signed-in pupil's year, with their own progress.
create or replace function public.revision_pupil_units()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_child uuid := public.revision_my_child();
  v_year text := public.revision_my_year();
begin
  if v_child is null then
    raise exception 'not a pupil' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'subject', (x->>'sort')::int, x->>'title')
    from (
      select jsonb_build_object(
        'id', u.id, 'subject', u.subject, 'subject_slug', u.subject_slug, 'unit', u.unit, 'title', u.title,
        'kind', u.kind, 'sort', u.sort_order, 'has_video', u.video_path is not null,
        'questions', (select count(*) from public.revision_questions q where q.unit_id = u.id and q.active and q.in_quiz),
        'topics', (select count(distinct q.topic) from public.revision_questions q where q.unit_id = u.id and q.active),
        'mastered', (select count(*) from public.revision_mastery m where m.child_id = v_child and m.unit_id = u.id and m.level >= 3),
        'last_quiz', (
          select jsonb_build_object('correct', a.correct, 'total', a.total, 'at', a.finished_at)
          from public.revision_attempts a
          where a.child_id = v_child and a.unit_id = u.id and a.mode = 'quiz' and a.finished_at is not null
          order by a.finished_at desc limit 1)
      ) as x
      from public.revision_units u
      where u.published and u.year = v_year
        and exists (select 1 from public.revision_questions q where q.unit_id = u.id and q.active)
    ) s
  ), '[]'::jsonb);
end;
$$;

-- One unit for the pupil: summary or lesson list, topics and their mastery.
create or replace function public.revision_pupil_unit(p_unit uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_child uuid := public.revision_my_child();
  u public.revision_units%rowtype;
begin
  if v_child is null then
    raise exception 'not a pupil' using errcode = '42501';
  end if;
  select * into u from public.revision_units where id = p_unit and published and year = public.revision_my_year();
  if not found then
    raise exception 'unit not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', u.id, 'subject', u.subject, 'subject_slug', u.subject_slug, 'unit', u.unit, 'title', u.title,
    'kind', u.kind, 'summary', u.summary, 'video_path', u.video_path, 'year', u.year,
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object('lesson_no', cl.lesson_no, 'title', cl.title, 'objectives', cl.objectives, 'pdf_path', cl.pdf_path) order by cl.lesson_no)
      from public.curriculum_lessons cl
      where u.kind = 'lessons' and cl.subject_slug = u.subject_slug and cl.year = u.year and cl.unit = u.unit), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(t order by (t->>'first')::int nulls last, t->>'topic')
      from (
        select jsonb_build_object(
          'topic', q.topic, 'first', min(coalesce(q.lesson_no, 0)), 'questions', count(*),
          'level', coalesce(max(m.level), 0), 'next_review_on', max(m.next_review_on)) as t
        from public.revision_questions q
        left join public.revision_mastery m on m.child_id = v_child and m.unit_id = u.id and m.topic = q.topic
        where q.unit_id = u.id and q.active
        group by q.topic
      ) s), '[]'::jsonb)
  );
end;
$$;

-- Start a quiz (all questions) or a practice round (one topic). Questions come
-- back without their answers.
create or replace function public.revision_start(p_unit uuid, p_mode text, p_topic text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child uuid := public.revision_my_child();
  v_attempt uuid;
  v_qs jsonb;
begin
  if v_child is null then
    raise exception 'not a pupil' using errcode = '42501';
  end if;
  if p_mode not in ('quiz', 'practice') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  if not exists (select 1 from public.revision_units where id = p_unit and published and year = public.revision_my_year()) then
    raise exception 'unit not found' using errcode = 'P0002';
  end if;
  if p_mode = 'practice' and p_topic is null then
    raise exception 'choose a topic' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'topic', q.topic, 'question', q.question, 'options', q.options, 'hint', q.hint)), '[]'::jsonb)
    into v_qs
  from (
    select * from public.revision_questions q
    where q.unit_id = p_unit and q.active and ((p_mode = 'quiz' and q.in_quiz) or (p_mode = 'practice' and q.topic = p_topic))
    order by
      -- Practice: questions this pupil has got wrong come first.
      case when p_mode = 'practice' then (
        select count(*) from public.revision_answers ra join public.revision_attempts a on a.id = ra.attempt_id
        where a.child_id = v_child and ra.question_id = q.id and not ra.correct) end desc nulls last,
      random()
    limit case when p_mode = 'quiz' then 25 else 8 end
  ) q;

  if jsonb_array_length(v_qs) = 0 then
    raise exception 'no questions' using errcode = 'P0002';
  end if;

  insert into public.revision_attempts (unit_id, child_id, mode, topic, total)
  values (p_unit, v_child, p_mode, case when p_mode = 'practice' then p_topic end, jsonb_array_length(v_qs))
  returning id into v_attempt;

  return jsonb_build_object('attempt', v_attempt, 'questions', v_qs);
end;
$$;

-- Mark one answer. The first answer to a question in an attempt is the one that counts.
create or replace function public.revision_answer(p_attempt uuid, p_question uuid, p_choice integer, p_used_hint boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child uuid := public.revision_my_child();
  a public.revision_attempts%rowtype;
  q public.revision_questions%rowtype;
  m public.revision_mastery%rowtype;
  v_ok boolean;
  v_new uuid;
  v_level smallint;
  v_up date;
  v_next date;
begin
  select * into a from public.revision_attempts where id = p_attempt and child_id = v_child and finished_at is null for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;
  select * into q from public.revision_questions where id = p_question and unit_id = a.unit_id and active;
  if not found then
    raise exception 'question not found' using errcode = 'P0002';
  end if;
  if p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(q.options) then
    raise exception 'invalid choice' using errcode = '22023';
  end if;

  v_ok := p_choice = q.answer;
  insert into public.revision_answers (attempt_id, question_id, chosen, correct, used_hint)
  values (a.id, q.id, p_choice, v_ok, coalesce(p_used_hint, false))
  on conflict (attempt_id, question_id) do nothing
  returning id into v_new;

  if v_new is not null then
    update public.revision_attempts
       set answered = answered + 1, correct = correct + case when v_ok then 1 else 0 end
     where id = a.id;

    -- Mastery: up one step for a correct answer without a hint (at most one step a
    -- day per topic, so mastery needs three different days); down one for a wrong
    -- answer. Mastered topics come back for review after 3 days, then a week.
    select * into m from public.revision_mastery where child_id = v_child and unit_id = a.unit_id and topic = q.topic for update;
    if not found then
      m.level := 0; m.last_up_on := null; m.next_review_on := null; m.correct := 0; m.wrong := 0;
    end if;
    v_level := m.level; v_up := m.last_up_on; v_next := m.next_review_on;
    if v_ok and not coalesce(p_used_hint, false) and (m.last_up_on is distinct from current_date) then
      v_level := least(3, m.level + 1);
      v_up := current_date;
      if v_level >= 3 then
        v_next := current_date + case when m.level >= 3 then 7 else 3 end;
      end if;
    elsif not v_ok then
      v_level := greatest(0, m.level - 1);
      if v_level < 3 then v_next := null; end if;
    end if;
    insert into public.revision_mastery (child_id, unit_id, topic, level, correct, wrong, last_up_on, next_review_on, updated_at)
    values (v_child, a.unit_id, q.topic, v_level, case when v_ok then 1 else 0 end, case when v_ok then 0 else 1 end, v_up, v_next, now())
    on conflict (child_id, unit_id, topic) do update
      set level = excluded.level,
          correct = public.revision_mastery.correct + excluded.correct,
          wrong = public.revision_mastery.wrong + excluded.wrong,
          last_up_on = excluded.last_up_on,
          next_review_on = excluded.next_review_on,
          updated_at = now();
  else
    select ra.correct, ra.chosen into v_ok, p_choice from public.revision_answers ra where ra.attempt_id = a.id and ra.question_id = q.id;
    select level into v_level from public.revision_mastery where child_id = v_child and unit_id = a.unit_id and topic = q.topic;
  end if;

  return jsonb_build_object(
    'correct', v_ok,
    'answer', q.answer,
    'explanation', q.explanation,
    'note', case when v_ok then null else q.wrong ->> p_choice::text end,
    'level', coalesce(v_level, 0)
  );
end;
$$;

create or replace function public.revision_finish(p_attempt uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.revision_attempts%rowtype;
begin
  update public.revision_attempts
     set finished_at = coalesce(finished_at, now())
   where id = p_attempt and child_id = public.revision_my_child()
  returning * into a;
  if not found then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('correct', a.correct, 'answered', a.answered, 'total', a.total);
end;
$$;

-- ── staff functions ──────────────────────────────────────────────────────
-- Results for one unit: questions (with answers), each pupil's latest quiz, their
-- topic mastery and practice. Teachers see the pupils in the classes they teach.
create or replace function public.revision_insights(p_unit uuid, p_class uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  u public.revision_units%rowtype;
  v_leader boolean := public.revision_is_leader();
  v_roster uuid[];
begin
  if not public.revision_is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into u from public.revision_units where id = p_unit;
  if not found then
    raise exception 'unit not found' using errcode = 'P0002';
  end if;
  if p_class is not null and not v_leader and not public.class_taught_by_current_user(p_class) then
    raise exception 'not your class' using errcode = '42501';
  end if;

  if p_class is not null then
    select coalesce(array_agg(distinct e.child_id), '{}') into v_roster from public.enrolments e where e.class_id = p_class;
  else
    select coalesce(array_agg(distinct x.child_id), '{}') into v_roster from (
      select e.child_id
      from public.enrolments e join public.classes cl on cl.id = e.class_id
      where public.revision_year_key(cl.year_group) = u.year
        and (v_leader or public.class_taught_by_current_user(cl.id))
      union
      select a.child_id from public.revision_attempts a
      where a.unit_id = u.id and (v_leader or public.child_taught_by(a.child_id, auth.uid()))
    ) x;
  end if;

  return jsonb_build_object(
    'unit', jsonb_build_object('id', u.id, 'title', u.title, 'subject', u.subject, 'year', u.year, 'unit', u.unit, 'published', u.published),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('id', cl.id, 'name', cl.name) order by cl.name)
      from public.classes cl
      where public.revision_year_key(cl.year_group) = u.year
        and coalesce(cl.is_test, false) = false
        and (v_leader or public.class_taught_by_current_user(cl.id))), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'topic', q.topic, 'lesson_no', q.lesson_no, 'question', q.question,
        'options', q.options, 'answer', q.answer, 'explanation', q.explanation) order by q.lesson_no nulls first, q.qkey)
      from public.revision_questions q where q.unit_id = u.id and q.active and q.in_quiz), '[]'::jsonb),
    'pupils', coalesce((
      select jsonb_agg(p order by p->>'name')
      from (
        select jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'quiz', (
            select jsonb_build_object('at', coalesce(a.finished_at, a.started_at), 'correct', a.correct, 'total', a.total, 'answered', a.answered,
              'answers', coalesce((select jsonb_object_agg(ra.question_id::text, ra.chosen) from public.revision_answers ra where ra.attempt_id = a.id), '{}'::jsonb))
            from public.revision_attempts a
            where a.child_id = c.id and a.unit_id = u.id and a.mode = 'quiz' and a.answered > 0
            order by (a.finished_at is not null) desc, a.started_at desc
            limit 1),
          'quizzes', (select count(*) from public.revision_attempts a where a.child_id = c.id and a.unit_id = u.id and a.mode = 'quiz' and a.finished_at is not null),
          'practice', (select count(*) from public.revision_answers ra join public.revision_attempts a on a.id = ra.attempt_id
                       where a.child_id = c.id and a.unit_id = u.id and a.mode = 'practice'),
          'mastery', coalesce((select jsonb_object_agg(m.topic, m.level) from public.revision_mastery m where m.child_id = c.id and m.unit_id = u.id), '{}'::jsonb)
        ) as p
        from public.children c
        where c.id = any(v_roster) and coalesce(c.is_test, false) = false
      ) s), '[]'::jsonb)
  );
end;
$$;

-- One row per unit that the signed-in staff member's pupils have used.
create or replace function public.revision_overview()
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
    with latest as (
      select distinct on (a.child_id, a.unit_id) a.*
      from public.revision_attempts a
      where a.mode = 'quiz' and a.answered > 0
        and (v_leader or public.child_taught_by(a.child_id, auth.uid()))
      order by a.child_id, a.unit_id, (a.finished_at is not null) desc, a.started_at desc
    ),
    topic_scores as (
      select l.unit_id, q.topic, avg(case when ra.correct then 100.0 else 0 end) as pct
      from latest l
      join public.revision_answers ra on ra.attempt_id = l.id
      join public.revision_questions q on q.id = ra.question_id
      group by l.unit_id, q.topic
    ),
    per_unit as (
      select l.unit_id, count(*) as takers,
             round(avg(case when l.answered > 0 then l.correct * 100.0 / l.answered end)) as avg_pct,
             count(*) filter (where l.answered > 0 and l.correct * 100.0 / l.answered < 60) as under60,
             max(coalesce(l.finished_at, l.started_at)) as last_at
      from latest l group by l.unit_id
    )
    select jsonb_agg(jsonb_build_object(
      'unit_id', u.id, 'title', u.title, 'subject', u.subject, 'subject_slug', u.subject_slug, 'year', u.year, 'unit', u.unit,
      'takers', pu.takers, 'avg_pct', pu.avg_pct, 'under60', pu.under60, 'last_at', pu.last_at,
      'weakest', (select jsonb_build_object('topic', ts.topic, 'pct', round(ts.pct)) from topic_scores ts where ts.unit_id = u.id order by ts.pct asc, ts.topic limit 1)
    ) order by pu.last_at desc)
    from per_unit pu join public.revision_units u on u.id = pu.unit_id
  ), '[]'::jsonb);
end;
$$;

-- Unit ids, question counts and pupil numbers for one year (Lesson library badges).
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
      'questions', (select count(*) from public.revision_questions q where q.unit_id = u.id and q.active and q.in_quiz),
      'practice_questions', (select count(*) from public.revision_questions q where q.unit_id = u.id and q.active and not q.in_quiz),
      'takers', (select count(distinct a.child_id) from public.revision_attempts a
                 where a.unit_id = u.id and a.answered > 0 and (v_leader or public.child_taught_by(a.child_id, auth.uid())))
    ) order by u.subject, u.sort_order, u.title)
    from public.revision_units u where u.year = p_year
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.revision_pupil_units() from public, anon;
revoke all on function public.revision_pupil_unit(uuid) from public, anon;
revoke all on function public.revision_start(uuid, text, text) from public, anon;
revoke all on function public.revision_answer(uuid, uuid, integer, boolean) from public, anon;
revoke all on function public.revision_finish(uuid) from public, anon;
revoke all on function public.revision_insights(uuid, uuid) from public, anon;
revoke all on function public.revision_overview() from public, anon;
revoke all on function public.revision_units_for_year(text) from public, anon;
grant execute on function public.revision_pupil_units() to authenticated;
grant execute on function public.revision_pupil_unit(uuid) to authenticated;
grant execute on function public.revision_start(uuid, text, text) to authenticated;
grant execute on function public.revision_answer(uuid, uuid, integer, boolean) to authenticated;
grant execute on function public.revision_finish(uuid) to authenticated;
grant execute on function public.revision_insights(uuid, uuid) to authenticated;
grant execute on function public.revision_overview() to authenticated;
grant execute on function public.revision_units_for_year(text) to authenticated;

-- ── storage ──────────────────────────────────────────────────────────────
-- Pupils may open the slide PDFs of lessons in a published revision unit for their year.
create or replace function public.revision_pupil_can_read_deck(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.curriculum_lessons cl
    join public.revision_units u
      on u.subject_slug = cl.subject_slug and u.year = cl.year and u.unit = cl.unit and u.published and u.kind = 'lessons'
    where cl.pdf_path = p_name and cl.year = public.revision_my_year()
  );
$$;

revoke all on function public.revision_pupil_can_read_deck(text) from public, anon;
grant execute on function public.revision_pupil_can_read_deck(text) to authenticated;

drop policy if exists "lesson-decks: pupils read revision slides" on storage.objects;
create policy "lesson-decks: pupils read revision slides"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'lesson-decks'
    and public.current_has_role(array['student']::public.learn_role[])
    and public.revision_pupil_can_read_deck(name)
  );

-- Unit videos: private; staff read and upload, pupils read their year's published units.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('revision-media', 'revision-media', false, 209715200, array['video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.revision_pupil_can_read_media(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.revision_units u
    where u.video_path = p_name and u.published and u.year = public.revision_my_year()
  );
$$;

revoke all on function public.revision_pupil_can_read_media(text) from public, anon;
grant execute on function public.revision_pupil_can_read_media(text) to authenticated;

drop policy if exists "revision-media: staff read" on storage.objects;
create policy "revision-media: staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'revision-media' and public.revision_is_staff());

drop policy if exists "revision-media: pupils read their units" on storage.objects;
create policy "revision-media: pupils read their units"
  on storage.objects for select to authenticated
  using (bucket_id = 'revision-media' and public.revision_pupil_can_read_media(name));

drop policy if exists "revision-media: teachers upload" on storage.objects;
create policy "revision-media: teachers upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'revision-media' and public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[]));
