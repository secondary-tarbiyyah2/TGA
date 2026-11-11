-- Classwork quizzes (owner feedback 11 Nov 2026, items 6, 15 and 17;
-- docs/owner-briefs/2026-11-11-feedback-2.md).
--
-- A quiz is a homework row with kind = 'quiz' (0125). This adds what a real
-- quiz needs:
--   * homework_quizzes          its settings: shuffle, time limit, attempts,
--                               when pupils see the answers.
--   * homework_quiz_questions   the questions, built one by one by the teacher
--                               (or drafted with AI and checked by the teacher).
--                               Nine types: single choice, multiple answer,
--                               true/false, short answer, long answer,
--                               matching, ordering, numeric and label a diagram.
--   * homework_quiz_attempts    a pupil's sitting: question order, answers
--                               saved as they go, the deadline when timed, the
--                               marks.
--
-- Safeguards:
--   * Answers never reach pupils' browsers before they finish: pupils cannot
--     read homework_quiz_questions at all (staff only). They start, save and
--     submit through security-definer functions that hand out questions
--     without answers and mark on the server.
--   * The clock is the server's: a timed attempt has a deadline_at; saves
--     after it (plus a short grace for the network) are refused and the
--     attempt is finished with what was saved.
--   * Finishing writes the pupil's homework_submissions row (so the quiz shows
--     as handed in everywhere homework does). When every question marks
--     itself, the mark is returned at once (homework_feedback, 0071/0078);
--     when there is a long answer (or an unmatched short answer) the
--     submission waits in the teacher's To review queue as any homework does.
--   * RLS on every new table, default deny; only staff who can see the class
--     read attempts, and families read their own child's.

-- ── tables ───────────────────────────────────────────────────────────────
create table if not exists public.homework_quizzes (
  homework_id uuid primary key references public.homework(id) on delete cascade,
  shuffle_questions boolean not null default false,
  shuffle_options boolean not null default true,
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes between 1 and 300),
  max_attempts integer not null default 1 check (max_attempts between 1 and 10),
  -- after_submit: right away; after_due: once the due time has passed; never: the score only.
  show_answers text not null default 'after_submit' check (show_answers in ('after_submit', 'after_due', 'never')),
  drafted_with_ai boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.homework_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework(id) on delete cascade,
  position integer not null default 0,
  qtype text not null check (qtype in ('single', 'multiple', 'true_false', 'short', 'long', 'matching', 'ordering', 'numeric', 'label')),
  prompt text not null check (char_length(prompt) between 1 and 2000),
  -- single/multiple: ["option", ...]; ordering: items in the right order;
  -- matching: [{"left","right"}]; label: [{"x","y","label"}] (x, y from 0 to 1).
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 12),
  -- single: {"correct": 0}; multiple: {"correct": [0, 2]}; true_false: {"correct": true};
  -- short: {"accept": ["..."]}; numeric: {"value": 3.5, "tolerance": 0}; long: {"model": "..."};
  -- matching, ordering, label: {} (the right answer is the order of options).
  answer jsonb not null default '{}'::jsonb check (jsonb_typeof(answer) = 'object'),
  marks numeric(6, 2) not null default 1 check (marks >= 0 and marks <= 100),
  explanation text check (explanation is null or char_length(explanation) <= 2000),
  -- An image for the question (required for label): object name in homework-attachments,
  -- under the homework's own folder.
  image_path text,
  difficulty text check (difficulty is null or difficulty in ('easy', 'medium', 'hard')),
  drafted_by_ai boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homework_quiz_questions_image_folder check (image_path is null or split_part(image_path, '/', 1) = homework_id::text)
);

create index if not exists homework_quiz_questions_hw_idx on public.homework_quiz_questions (homework_id, position);

create table if not exists public.homework_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  attempt_no integer not null default 1,
  question_order uuid[] not null default '{}',
  -- {question_id: [original option index, ...]} in the order shown to this pupil.
  option_orders jsonb not null default '{}'::jsonb,
  responses jsonb not null default '{}'::jsonb check (jsonb_typeof(responses) = 'object' and octet_length(responses::text) <= 200000),
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  saved_at timestamptz,
  submitted_at timestamptz,
  -- {question_id: {"marks": n | null, "correct": true | false | null}}; null marks = the teacher marks it.
  results jsonb not null default '{}'::jsonb,
  -- {question_id: n}: the teacher's marks for long (and any overridden) answers.
  teacher_marks jsonb not null default '{}'::jsonb,
  score numeric(7, 2),
  total numeric(7, 2),
  needs_marking boolean not null default false,
  unique (homework_id, child_id, attempt_no)
);

create index if not exists homework_quiz_attempts_hw_idx on public.homework_quiz_attempts (homework_id, child_id);

alter table public.homework_quizzes enable row level security;
alter table public.homework_quiz_questions enable row level security;
alter table public.homework_quiz_attempts enable row level security;

-- ── helpers ──────────────────────────────────────────────────────────────
-- Staff who may build and mark this homework's quiz: the class's teachers and the head/admin.
create or replace function public.quiz_staff_can_edit(p_homework uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.class_taught_by_current_user(public.homework_class_id(p_homework))
      or public.current_has_role(array['head_teacher', 'admin']::public.learn_role[]);
$$;

revoke all on function public.quiz_staff_can_edit(uuid) from public, anon;
grant execute on function public.quiz_staff_can_edit(uuid) to authenticated;

-- ── policies ─────────────────────────────────────────────────────────────
drop policy if exists "homework_quizzes: staff manage" on public.homework_quizzes;
create policy "homework_quizzes: staff manage"
  on public.homework_quizzes for all to authenticated
  using (public.quiz_staff_can_edit(homework_id))
  with check (public.quiz_staff_can_edit(homework_id));

drop policy if exists "homework_quizzes: academic staff read" on public.homework_quizzes;
create policy "homework_quizzes: academic staff read"
  on public.homework_quizzes for select to authenticated
  using (public.current_has_permission('manage_academic'));

drop policy if exists "homework_quiz_questions: staff manage" on public.homework_quiz_questions;
create policy "homework_quiz_questions: staff manage"
  on public.homework_quiz_questions for all to authenticated
  using (public.quiz_staff_can_edit(homework_id))
  with check (public.quiz_staff_can_edit(homework_id));

drop policy if exists "homework_quiz_questions: academic staff read" on public.homework_quiz_questions;
create policy "homework_quiz_questions: academic staff read"
  on public.homework_quiz_questions for select to authenticated
  using (public.current_has_permission('manage_academic'));

-- Attempts: read only. Pupils start, save and submit through the functions below;
-- teachers mark through quiz_mark.
drop policy if exists "homework_quiz_attempts: staff read" on public.homework_quiz_attempts;
create policy "homework_quiz_attempts: staff read"
  on public.homework_quiz_attempts for select to authenticated
  using (public.quiz_staff_can_edit(homework_id) or public.current_has_permission('manage_academic'));

drop policy if exists "homework_quiz_attempts: pupil reads own" on public.homework_quiz_attempts;
create policy "homework_quiz_attempts: pupil reads own"
  on public.homework_quiz_attempts for select to authenticated
  using (public.child_belongs_to_student(child_id));

drop policy if exists "homework_quiz_attempts: parent reads own child's finished" on public.homework_quiz_attempts;
create policy "homework_quiz_attempts: parent reads own child's finished"
  on public.homework_quiz_attempts for select to authenticated
  using (submitted_at is not null and public.child_belongs_to_parent(child_id));

drop trigger if exists audit_homework_quiz_questions on public.homework_quiz_questions;
create trigger audit_homework_quiz_questions
  after insert or update or delete on public.homework_quiz_questions
  for each row execute function public.audit_row_change();

drop trigger if exists audit_homework_quiz_attempts on public.homework_quiz_attempts;
create trigger audit_homework_quiz_attempts
  after insert or update or delete on public.homework_quiz_attempts
  for each row execute function public.audit_row_change();

-- ── marking ──────────────────────────────────────────────────────────────
-- Marks for one answer: a number, or null when a teacher has to mark it.
create or replace function public.quiz_mark_one(q public.homework_quiz_questions, r jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  n integer := jsonb_array_length(q.options);
  right_count integer := 0;
  i integer;
  v text;
  num numeric;
  target numeric;
  tol numeric;
  want jsonb;
begin
  if r is null or r = 'null'::jsonb then
    return case when q.qtype = 'long' then null else 0 end;
  end if;
  case q.qtype
    when 'single' then
      return case when jsonb_typeof(r) = 'number' and r::text::int = (q.answer ->> 'correct')::int then q.marks else 0 end;
    when 'multiple' then
      want := coalesce(q.answer -> 'correct', '[]'::jsonb);
      if jsonb_typeof(r) <> 'array' then return 0; end if;
      return case
        when (select coalesce(array_agg(x::int order by x::int), '{}') from jsonb_array_elements_text(r) x)
           = (select coalesce(array_agg(x::int order by x::int), '{}') from jsonb_array_elements_text(want) x)
        then q.marks else 0 end;
    when 'true_false' then
      return case when jsonb_typeof(r) = 'boolean' and r = (q.answer -> 'correct') then q.marks else 0 end;
    when 'short' then
      if jsonb_typeof(r) <> 'string' then return 0; end if;
      v := lower(regexp_replace(btrim(r #>> '{}'), '\s+', ' ', 'g'));
      if v = '' then return 0; end if;
      if exists (
        select 1 from jsonb_array_elements_text(coalesce(q.answer -> 'accept', '[]'::jsonb)) a
        where lower(regexp_replace(btrim(a), '\s+', ' ', 'g')) = regexp_replace(v, '[.!]+$', '')
           or lower(regexp_replace(btrim(a), '\s+', ' ', 'g')) = v
      ) then
        return q.marks;
      end if;
      -- Not one of the accepted answers: the teacher decides (it may be a fair wording).
      return null;
    when 'long' then
      return null;
    when 'numeric' then
      begin
        num := replace(btrim(r #>> '{}'), ',', '')::numeric;
      exception when others then
        return 0;
      end;
      target := (q.answer ->> 'value')::numeric;
      tol := coalesce((q.answer ->> 'tolerance')::numeric, 0);
      return case when target is not null and abs(num - target) <= tol then q.marks else 0 end;
    when 'ordering' then
      if jsonb_typeof(r) <> 'array' or jsonb_array_length(r) <> n then return 0; end if;
      for i in 0 .. n - 1 loop
        if (r ->> i) is distinct from i::text then return 0; end if;
      end loop;
      return q.marks;
    when 'matching', 'label' then
      if jsonb_typeof(r) <> 'object' or n = 0 then return 0; end if;
      for i in 0 .. n - 1 loop
        if (r ->> i::text) = i::text then right_count := right_count + 1; end if;
      end loop;
      -- Part marks for each pair (or label) put right.
      return round(q.marks * right_count / n, 2);
    else
      return 0;
  end case;
end;
$$;

-- Marks a finished attempt from its responses and the teacher's marks; returns nothing.
create or replace function public.quiz_score_attempt(p_attempt uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.homework_quiz_attempts;
  q public.homework_quiz_questions;
  m numeric;
  res jsonb := '{}'::jsonb;
  v_score numeric := 0;
  v_total numeric := 0;
  pending boolean := false;
begin
  select * into a from public.homework_quiz_attempts where id = p_attempt;
  if a.id is null then return; end if;
  for q in select * from public.homework_quiz_questions where id = any (a.question_order) loop
    v_total := v_total + q.marks;
    if a.teacher_marks ? q.id::text then
      m := least(q.marks, greatest(0, (a.teacher_marks ->> q.id::text)::numeric));
    else
      m := public.quiz_mark_one(q, a.responses -> q.id::text);
    end if;
    if m is null then
      pending := true;
    else
      v_score := v_score + m;
    end if;
    res := res || jsonb_build_object(q.id::text, jsonb_build_object('marks', m, 'correct', case when m is null then null else m >= q.marks and q.marks > 0 end));
  end loop;
  update public.homework_quiz_attempts
     set results = res, score = v_score, total = v_total, needs_marking = pending
   where id = p_attempt;
end;
$$;

revoke all on function public.quiz_score_attempt(uuid) from public, anon, authenticated;

-- After an attempt is finished or marked: the pupil's submission (handed in), and the mark
-- returned when nothing is left for the teacher. The best finished attempt counts.
create or replace function public.quiz_sync_submission(p_homework uuid, p_child uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  best public.homework_quiz_attempts;
  sub_id uuid;
  hw public.homework;
  summary text;
begin
  select * into hw from public.homework where id = p_homework;
  select * into best from public.homework_quiz_attempts
   where homework_id = p_homework and child_id = p_child and submitted_at is not null
   order by needs_marking asc, score desc nulls last, submitted_at desc
   limit 1;
  if best.id is null then return; end if;
  summary := 'Quiz handed in (attempt ' || best.attempt_no || '). '
    || case when best.needs_marking then 'Marked so far: ' || trim_scale(coalesce(best.score, 0)) || ' out of ' || trim_scale(coalesce(best.total, 0)) || '; some answers need the teacher.'
            else 'Score: ' || trim_scale(coalesce(best.score, 0)) || ' out of ' || trim_scale(coalesce(best.total, 0)) || '.' end;

  -- The submission guard checks 'text' is allowed; a quiz always allows it.
  if not ('text' = any (coalesce(hw.allowed_submission_types, array['text']::text[]))) then
    update public.homework set allowed_submission_types = array_append(allowed_submission_types, 'text') where id = p_homework;
  end if;

  insert into public.homework_submissions (homework_id, child_id, kind, response_text, submitted_at)
  values (p_homework, p_child, 'text', summary, coalesce(best.submitted_at, now()))
  on conflict (homework_id, child_id) do update
    set response_text = excluded.response_text, submitted_at = excluded.submitted_at, kind = 'text'
  returning id into sub_id;

  if not best.needs_marking then
    insert into public.homework_feedback as f (submission_id, status, feedback_text, mark, given_by)
    values (sub_id, 'feedback_given', 'Quiz score: ' || trim_scale(coalesce(best.score, 0)) || ' out of ' || trim_scale(coalesce(best.total, 0)) || '.', best.score, hw.teacher_id)
    on conflict (submission_id) do update
      set status = 'feedback_given', mark = excluded.mark,
          feedback_text = case when f.feedback_text like 'Quiz score:%' or f.feedback_text is null then excluded.feedback_text else f.feedback_text end;
  end if;
end;
$$;

revoke all on function public.quiz_sync_submission(uuid, uuid) from public, anon, authenticated;

-- Finishes an attempt (on Submit, or when its time ran out): marks it and hands it in.
create or replace function public.quiz_finish(p_attempt uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.homework_quiz_attempts;
begin
  update public.homework_quiz_attempts
     set submitted_at = coalesce(submitted_at, least(now(), coalesce(deadline_at, now())))
   where id = p_attempt
  returning * into a;
  if a.id is null then return; end if;
  perform public.quiz_score_attempt(a.id);
  perform public.quiz_sync_submission(a.homework_id, a.child_id);
end;
$$;

revoke all on function public.quiz_finish(uuid) from public, anon, authenticated;

-- The questions as a pupil sees them: no answers, options in this attempt's order.
create or replace function public.quiz_pupil_questions(p_attempt uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  a public.homework_quiz_attempts;
  v_out jsonb := '[]'::jsonb;
  q public.homework_quiz_questions;
  perm jsonb;
  item jsonb;
  qid uuid;
begin
  select * into a from public.homework_quiz_attempts where id = p_attempt;
  foreach qid in array a.question_order loop
    select * into q from public.homework_quiz_questions where id = qid;
    if q.id is null then continue; end if;
    perm := coalesce(a.option_orders -> q.id::text, '[]'::jsonb);
    item := jsonb_build_object('id', q.id, 'qtype', q.qtype, 'prompt', q.prompt, 'marks', q.marks, 'image_path', q.image_path);
    if q.qtype in ('single', 'multiple', 'ordering') then
      item := item || jsonb_build_object('choices', (select coalesce(jsonb_agg(jsonb_build_object('i', p::int, 'text', q.options ->> p::int) order by ord), '[]'::jsonb) from jsonb_array_elements_text(perm) with ordinality as t(p, ord)));
      if q.qtype = 'multiple' then
        item := item || jsonb_build_object('pick', jsonb_array_length(coalesce(q.answer -> 'correct', '[]'::jsonb)));
      end if;
    elsif q.qtype = 'matching' then
      item := item
        || jsonb_build_object('lefts', (select coalesce(jsonb_agg(jsonb_build_object('i', o.idx - 1, 'text', o.v ->> 'left') order by o.idx), '[]'::jsonb) from jsonb_array_elements(q.options) with ordinality as o(v, idx)))
        || jsonb_build_object('rights', (select coalesce(jsonb_agg(jsonb_build_object('i', p::int, 'text', q.options -> p::int ->> 'right') order by ord), '[]'::jsonb) from jsonb_array_elements_text(perm) with ordinality as t(p, ord)));
    elsif q.qtype = 'label' then
      item := item
        || jsonb_build_object('pins', (select coalesce(jsonb_agg(jsonb_build_object('i', o.idx - 1, 'x', o.v -> 'x', 'y', o.v -> 'y') order by o.idx), '[]'::jsonb) from jsonb_array_elements(q.options) with ordinality as o(v, idx)))
        || jsonb_build_object('bank', (select coalesce(jsonb_agg(jsonb_build_object('i', p::int, 'text', q.options -> p::int ->> 'label') order by ord), '[]'::jsonb) from jsonb_array_elements_text(perm) with ordinality as t(p, ord)));
    end if;
    v_out := v_out || jsonb_build_array(item);
  end loop;
  return v_out;
end;
$$;

revoke all on function public.quiz_pupil_questions(uuid) from public, anon, authenticated;

-- ── what a pupil calls ───────────────────────────────────────────────────
-- The pupil's child (null for anyone else).
create or replace function public.quiz_my_child()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select sa.child_id from public.student_accounts sa where sa.profile_id = auth.uid() limit 1;
$$;

revoke all on function public.quiz_my_child() from public, anon;
grant execute on function public.quiz_my_child() to authenticated;

-- Can this child sit this quiz (enrolled, set for them, not archived)?
create or replace function public.quiz_child_may_sit(p_homework uuid, p_child uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.homework h
    join public.enrolments e on e.class_id = h.class_id and e.child_id = p_child
    where h.id = p_homework and h.archived_at is null and coalesce(h.kind, 'assignment') = 'quiz'
      and (h.assigned_child_ids is null or p_child = any (h.assigned_child_ids))
  );
$$;

revoke all on function public.quiz_child_may_sit(uuid, uuid) from public, anon, authenticated;

-- A quiz's facts for the pupil's page: how many questions, time, attempts used, the open attempt.
create or replace function public.quiz_info(p_homework uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  child uuid := public.quiz_my_child();
  s public.homework_quizzes;
  h public.homework;
  open_a public.homework_quiz_attempts;
  used integer;
begin
  if child is null or not public.quiz_child_may_sit(p_homework, child) then
    raise exception 'not_your_quiz' using errcode = '42501';
  end if;
  select * into h from public.homework where id = p_homework;
  select * into s from public.homework_quizzes where homework_id = p_homework;
  -- An attempt whose time ran out while the pupil was away is finished now.
  for open_a in select * from public.homework_quiz_attempts where homework_id = p_homework and child_id = child and submitted_at is null and deadline_at is not null and deadline_at + interval '1 minute' < now() loop
    perform public.quiz_finish(open_a.id);
  end loop;
  select * into open_a from public.homework_quiz_attempts where homework_id = p_homework and child_id = child and submitted_at is null order by attempt_no desc limit 1;
  select count(*) into used from public.homework_quiz_attempts where homework_id = p_homework and child_id = child;
  return jsonb_build_object(
    'title', h.title,
    'instructions', h.instructions,
    'due_at', h.due_at,
    'questions', (select count(*) from public.homework_quiz_questions where homework_id = p_homework),
    'total', (select coalesce(sum(marks), 0) from public.homework_quiz_questions where homework_id = p_homework),
    'time_limit_minutes', s.time_limit_minutes,
    'max_attempts', coalesce(s.max_attempts, 1),
    'attempts_used', used,
    'open_attempt', open_a.id,
    'accepts', public.homework_accepts_submission(p_homework, child),
    'finished', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'attempt_no', a.attempt_no, 'score', a.score, 'total', a.total, 'needs_marking', a.needs_marking, 'submitted_at', a.submitted_at) order by a.attempt_no), '[]'::jsonb)
                   from public.homework_quiz_attempts a where a.homework_id = p_homework and a.child_id = child and a.submitted_at is not null)
  );
end;
$$;

revoke all on function public.quiz_info(uuid) from public, anon;
grant execute on function public.quiz_info(uuid) to authenticated;

-- Start (or carry on) a quiz. Returns the attempt, its deadline, the server's time and the questions.
create or replace function public.quiz_start(p_homework uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  child uuid := public.quiz_my_child();
  s public.homework_quizzes;
  a public.homework_quiz_attempts;
  used integer;
  q public.homework_quiz_questions;
  qorder uuid[];
  perms jsonb := '{}'::jsonb;
  perm jsonb;
  n integer;
begin
  if child is null or not public.quiz_child_may_sit(p_homework, child) then
    raise exception 'not_your_quiz' using errcode = '42501';
  end if;
  select * into s from public.homework_quizzes where homework_id = p_homework;

  for a in select * from public.homework_quiz_attempts where homework_id = p_homework and child_id = child and submitted_at is null and deadline_at is not null and deadline_at + interval '1 minute' < now() loop
    perform public.quiz_finish(a.id);
  end loop;

  select * into a from public.homework_quiz_attempts where homework_id = p_homework and child_id = child and submitted_at is null order by attempt_no desc limit 1;
  if a.id is null then
    if not public.homework_accepts_submission(p_homework, child) then
      raise exception 'quiz_closed' using errcode = '42501';
    end if;
    select count(*) into used from public.homework_quiz_attempts where homework_id = p_homework and child_id = child;
    if used >= coalesce(s.max_attempts, 1) then
      raise exception 'no_attempts_left' using errcode = '42501';
    end if;
    if not exists (select 1 from public.homework_quiz_questions where homework_id = p_homework) then
      raise exception 'quiz_empty' using errcode = '22023';
    end if;
    if coalesce(s.shuffle_questions, false) then
      select array_agg(id order by random()) into qorder from public.homework_quiz_questions where homework_id = p_homework;
    else
      select array_agg(id order by position, created_at) into qorder from public.homework_quiz_questions where homework_id = p_homework;
    end if;
    for q in select * from public.homework_quiz_questions where homework_id = p_homework loop
      n := jsonb_array_length(q.options);
      if q.qtype in ('matching', 'label', 'ordering') or (q.qtype in ('single', 'multiple') and coalesce(s.shuffle_options, true)) then
        select coalesce(jsonb_agg(g order by random()), '[]'::jsonb) into perm from generate_series(0, n - 1) g;
        -- Ordering must never be shown already in the right order.
        if q.qtype = 'ordering' and n > 1 and perm = (select jsonb_agg(g order by g) from generate_series(0, n - 1) g) then
          select jsonb_agg(g order by g desc) into perm from generate_series(0, n - 1) g;
        end if;
      else
        select coalesce(jsonb_agg(g order by g), '[]'::jsonb) into perm from generate_series(0, n - 1) g;
      end if;
      perms := perms || jsonb_build_object(q.id::text, perm);
    end loop;
    insert into public.homework_quiz_attempts (homework_id, child_id, attempt_no, question_order, option_orders, deadline_at)
    values (p_homework, child, used + 1, qorder, perms, case when s.time_limit_minutes is not null then now() + make_interval(mins => s.time_limit_minutes) end)
    returning * into a;
  end if;

  return jsonb_build_object(
    'attempt_id', a.id,
    'attempt_no', a.attempt_no,
    'max_attempts', coalesce(s.max_attempts, 1),
    'deadline_at', a.deadline_at,
    'server_now', now(),
    'responses', a.responses,
    'questions', public.quiz_pupil_questions(a.id)
  );
end;
$$;

revoke all on function public.quiz_start(uuid) from public, anon;
grant execute on function public.quiz_start(uuid) to authenticated;

-- Autosave. Refused once submitted; after the deadline (plus a minute's grace) the attempt is finished instead.
create or replace function public.quiz_save(p_attempt uuid, p_responses jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.homework_quiz_attempts;
begin
  select * into a from public.homework_quiz_attempts where id = p_attempt;
  if a.id is null or not public.child_belongs_to_student(a.child_id) then
    raise exception 'not_your_quiz' using errcode = '42501';
  end if;
  if a.submitted_at is not null then
    return jsonb_build_object('ok', false, 'submitted', true);
  end if;
  if jsonb_typeof(p_responses) <> 'object' then
    raise exception 'invalid_responses' using errcode = '22023';
  end if;
  if a.deadline_at is not null and now() > a.deadline_at + interval '1 minute' then
    perform public.quiz_finish(a.id);
    return jsonb_build_object('ok', false, 'submitted', true, 'timed_out', true);
  end if;
  update public.homework_quiz_attempts set responses = p_responses, saved_at = now() where id = a.id;
  return jsonb_build_object('ok', true, 'saved_at', now(), 'server_now', now());
end;
$$;

revoke all on function public.quiz_save(uuid, jsonb) from public, anon;
grant execute on function public.quiz_save(uuid, jsonb) to authenticated;

-- Hand in. Saves the last answers (if in time), marks, and returns the result.
create or replace function public.quiz_submit(p_attempt uuid, p_responses jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.homework_quiz_attempts;
begin
  select * into a from public.homework_quiz_attempts where id = p_attempt;
  if a.id is null or not public.child_belongs_to_student(a.child_id) then
    raise exception 'not_your_quiz' using errcode = '42501';
  end if;
  if a.submitted_at is null then
    if p_responses is not null and jsonb_typeof(p_responses) = 'object'
       and (a.deadline_at is null or now() <= a.deadline_at + interval '1 minute') then
      update public.homework_quiz_attempts set responses = p_responses, saved_at = now() where id = a.id;
    end if;
    perform public.quiz_finish(a.id);
  end if;
  return public.quiz_result(p_attempt);
end;
$$;

-- A finished attempt, question by question. Pupils see the right answers and explanations
-- as the quiz allows (show_answers); staff always do.
create or replace function public.quiz_result(p_attempt uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.homework_quiz_attempts;
  h public.homework;
  s public.homework_quizzes;
  is_staff boolean;
  reveal boolean;
  items jsonb := '[]'::jsonb;
  q public.homework_quiz_questions;
  qid uuid;
  rq jsonb;
begin
  select * into a from public.homework_quiz_attempts where id = p_attempt;
  if a.id is null then
    raise exception 'not_found' using errcode = '42501';
  end if;
  is_staff := public.quiz_staff_can_edit(a.homework_id) or public.current_has_permission('manage_academic');
  if not (is_staff or public.child_belongs_to_student(a.child_id) or public.child_belongs_to_parent(a.child_id)) then
    raise exception 'not_your_quiz' using errcode = '42501';
  end if;
  if a.submitted_at is null and not is_staff then
    raise exception 'not_finished' using errcode = '42501';
  end if;
  select * into h from public.homework where id = a.homework_id;
  select * into s from public.homework_quizzes where homework_id = a.homework_id;
  reveal := is_staff or coalesce(s.show_answers, 'after_submit') = 'after_submit' or (s.show_answers = 'after_due' and now() > h.due_at);

  foreach qid in array a.question_order loop
    select * into q from public.homework_quiz_questions where id = qid;
    if q.id is null then continue; end if;
    rq := jsonb_build_object(
      'id', q.id, 'qtype', q.qtype, 'prompt', q.prompt, 'marks', q.marks, 'image_path', q.image_path,
      'response', a.responses -> q.id::text,
      'awarded', a.results -> q.id::text -> 'marks',
      'correct', a.results -> q.id::text -> 'correct'
    );
    if reveal then
      rq := rq || jsonb_build_object('options', q.options, 'answer', q.answer, 'explanation', q.explanation);
    elsif q.qtype in ('single', 'multiple', 'ordering', 'matching', 'label') then
      -- Without the answers, still show what the pupil chose.
      rq := rq || jsonb_build_object('options', case
        when q.qtype = 'matching' then (select jsonb_agg(jsonb_build_object('left', v ->> 'left', 'right', v ->> 'right')) from jsonb_array_elements(q.options) v)
        when q.qtype = 'label' then (select jsonb_agg(jsonb_build_object('x', v -> 'x', 'y', v -> 'y', 'label', v ->> 'label')) from jsonb_array_elements(q.options) v)
        else q.options end);
    end if;
    items := items || jsonb_build_array(rq);
  end loop;

  return jsonb_build_object(
    'attempt_id', a.id, 'attempt_no', a.attempt_no, 'title', h.title,
    'submitted_at', a.submitted_at, 'score', a.score, 'total', a.total,
    'needs_marking', a.needs_marking, 'answers_shown', reveal,
    'show_answers', coalesce(s.show_answers, 'after_submit'), 'due_at', h.due_at,
    'questions', items
  );
end;
$$;

revoke all on function public.quiz_result(uuid) from public, anon;
grant execute on function public.quiz_result(uuid) to authenticated;
revoke all on function public.quiz_submit(uuid, jsonb) from public, anon;
grant execute on function public.quiz_submit(uuid, jsonb) to authenticated;

-- ── what a teacher calls ─────────────────────────────────────────────────
-- Mark long answers (or change any question's marks) on a finished attempt: {question_id: marks}.
create or replace function public.quiz_mark(p_attempt uuid, p_marks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.homework_quiz_attempts;
  k text;
  merged jsonb;
begin
  select * into a from public.homework_quiz_attempts where id = p_attempt;
  if a.id is null or not public.quiz_staff_can_edit(a.homework_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if a.submitted_at is null then
    raise exception 'not_finished' using errcode = '22023';
  end if;
  if jsonb_typeof(p_marks) <> 'object' then
    raise exception 'invalid_marks' using errcode = '22023';
  end if;
  merged := a.teacher_marks;
  for k in select jsonb_object_keys(p_marks) loop
    if not (k::uuid = any (a.question_order)) then continue; end if;
    if p_marks -> k is null or p_marks -> k = 'null'::jsonb then
      merged := merged - k;
    else
      merged := merged || jsonb_build_object(k, (p_marks ->> k)::numeric);
    end if;
  end loop;
  update public.homework_quiz_attempts set teacher_marks = merged where id = a.id;
  perform public.quiz_score_attempt(a.id);
  perform public.quiz_sync_submission(a.homework_id, a.child_id);
  return public.quiz_result(a.id);
end;
$$;

revoke all on function public.quiz_mark(uuid, jsonb) from public, anon;
grant execute on function public.quiz_mark(uuid, jsonb) to authenticated;

-- Let a pupil try again (a teacher's choice): one more attempt than they have used.
create or replace function public.quiz_allow_retry(p_homework uuid, p_child uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.quiz_staff_can_edit(p_homework) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- Raises the quiz's attempt limit to one more than this pupil has used (finished attempts are kept as evidence).
  update public.homework_quizzes q
     set max_attempts = least(10, greatest(q.max_attempts, (select count(*) from public.homework_quiz_attempts a where a.homework_id = p_homework and a.child_id = p_child) + 1))
   where q.homework_id = p_homework;
end;
$$;

revoke all on function public.quiz_allow_retry(uuid, uuid) from public, anon;
grant execute on function public.quiz_allow_retry(uuid, uuid) to authenticated;

-- ── AI usage: drafting quiz questions shares the daily cap (ai-assist "quiz_questions") ──
alter table public.ai_usage drop constraint if exists ai_usage_task_check;
alter table public.ai_usage add constraint ai_usage_task_check
  check (task in ('report_comment', 'tarbiyah_note', 'message_triage', 'recruitment_screen', 'revision_questions', 'quiz_questions'));
