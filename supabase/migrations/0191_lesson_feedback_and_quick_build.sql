-- Tafweed T34 and T35 (owner, 9 November 2026).
--
-- T34. Lesson feedback: staff leave a note on a lesson or one part of it ("this slide needs a
--      picture", "answer 3 is wrong"). The Headteacher and Admin see every note in the Action
--      centre (Curriculum) and answer it: accept (and change the lesson), done, or declined with
--      a reason. The member of staff who wrote it sees the answer. Every change is logged
--      (curriculum_lesson_feedback_events, plus the audit log). Pupils and parents never see it:
--      only staff roles have any policy. There is no subject lead role yet; when one is added,
--      give it the same read and update policies as the Headteacher.
--
-- T35. Edit a lesson directly and download it straight away:
--      * curriculum_can_edit_lesson(): teachers edit lessons in their own subjects (from their
--        class subject assignments, their class roles and the subjects on their staff profile),
--        or every lesson if no subject is recorded for them; Headteacher and Admin edit all.
--        curriculum_save_lesson_content (0179) now uses it, so it is enforced in the database.
--      * curriculum_lesson_builds: the one-lesson quick build's progress (queued, building,
--        ready, failed), written by the "Build one lesson" workflow (service role) and watched
--        by the editor. Requested through curriculum_request_lesson_build().
--
-- Idempotent: safe to run again.

-- ── T35: who may edit which lesson ──────────────────────────────────────────
create or replace function public.curriculum_subject_key(p text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p, ''), '[^A-Za-z]', '', 'g'));
$$;

-- The subjects a member of staff is recorded as teaching (normalised), from all three places
-- the portal keeps them. Empty when none is recorded.
create or replace function public.curriculum_my_subject_keys()
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct k) filter (where k <> ''), '{}')
    from (
      select public.curriculum_subject_key(s.name) as k
        from public.class_subject_teachers cst
        join public.subjects s on s.id = cst.subject_id
       where cst.teacher_id = auth.uid() and (cst.valid_to is null or cst.valid_to >= current_date)
      union all
      select public.curriculum_subject_key(s.name)
        from public.user_roles ur
        join public.classes c on c.id = ur.scope_id
        join public.subjects s on s.id = c.subject_id
       where ur.user_id = auth.uid() and ur.role = 'teacher' and ur.scope_type = 'class'
      union all
      select public.curriculum_subject_key(x)
        from public.staff_profiles sp, unnest(sp.subjects_taught) x
       where sp.user_id = auth.uid()
    ) t;
$$;

revoke all on function public.curriculum_my_subject_keys() from public, anon;
grant execute on function public.curriculum_my_subject_keys() to authenticated;

-- Subject names are typed by people ("Maths", "Mathematics", "GCSE Combined Science"), so two
-- names match when one contains the other or they start with the same four letters.
create or replace function public.curriculum_subject_matches(p_mine text[], p_subject text, p_slug text)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
      from unnest(p_mine) m,
           unnest(array[public.curriculum_subject_key(p_subject), public.curriculum_subject_key(p_slug)]) l
     where l <> '' and m <> ''
       and (m = l or position(m in l) > 0 or position(l in m) > 0 or (length(m) >= 4 and length(l) >= 4 and left(m, 4) = left(l, 4)))
  );
$$;

create or replace function public.curriculum_can_edit_lesson(p_lesson uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  mine text[];
  l record;
begin
  if public.current_has_role(array['head_teacher', 'admin']) then
    return true;
  end if;
  if not public.current_has_role(array['teacher']) then
    return false;
  end if;
  mine := public.curriculum_my_subject_keys();
  if coalesce(array_length(mine, 1), 0) = 0 then
    return true; -- no subject recorded for this teacher: every lesson, as before
  end if;
  select subject, subject_slug into l from public.curriculum_lessons where id = p_lesson;
  if not found then
    return false;
  end if;
  return public.curriculum_subject_matches(mine, l.subject, l.subject_slug);
end;
$$;

revoke all on function public.curriculum_can_edit_lesson(uuid) from public, anon;
grant execute on function public.curriculum_can_edit_lesson(uuid) to authenticated;

-- The editor's save (0179), now limited to lessons the teacher may edit. Otherwise unchanged:
-- every field of the lesson object is kept as sent (fields this version of the portal does not
-- know about included).
create or replace function public.curriculum_save_lesson_content(p_lesson uuid, p_content jsonb, p_note text, p_rebuild_slides boolean, p_expected timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.curriculum_lessons%rowtype;
  who text;
  c jsonb;
  stamp timestamptz := now();
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']) or not public.curriculum_can_edit_lesson(p_lesson) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'invalid content' using errcode = '22023';
  end if;
  if coalesce(btrim(p_content ->> 'title'), '') = '' or coalesce(btrim(p_content ->> 'unit'), '') = '' then
    raise exception 'title and unit are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_content -> 'objectives') is distinct from 'array' or jsonb_array_length(p_content -> 'objectives') < 1 then
    raise exception 'at least one objective is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_content -> 'teach') is distinct from 'array' or jsonb_array_length(p_content -> 'teach') not between 3 and 7 then
    raise exception 'a lesson needs 3 to 7 teaching slides' using errcode = '22023';
  end if;
  if octet_length(p_content::text) > 200000 then
    raise exception 'lesson too long' using errcode = '22023';
  end if;
  select * into l from public.curriculum_lessons where id = p_lesson for update;
  if not found then
    raise exception 'lesson not found' using errcode = 'P0002';
  end if;
  if p_expected is not null and l.content_updated_at is distinct from p_expected then
    raise exception 'edited_elsewhere' using errcode = '40001';
  end if;
  c := jsonb_set(p_content, '{n}', to_jsonb(l.lesson_no));
  if c = l.content and not coalesce(p_rebuild_slides, false) then
    return l.content_updated_at;
  end if;
  select full_name into who from public.profiles where id = auth.uid();
  if l.content is not null then
    insert into public.curriculum_lesson_content_versions (lesson_id, content, note, edited_by, edited_by_name, edited_at, replaced_at)
    values (l.id, l.content, nullif(btrim(p_note), ''), l.content_updated_by, l.content_updated_by_name, coalesce(l.content_updated_at, l.created_at), stamp);
  end if;
  update public.curriculum_lessons
     set content = c,
         title = btrim(c ->> 'title'),
         unit = btrim(c ->> 'unit'),
         objectives = c -> 'objectives',
         duration = case when jsonb_typeof(c -> 'duration') = 'number' then (c ->> 'duration')::numeric::integer else duration end,
         content_updated_at = stamp,
         content_updated_by = auth.uid(),
         content_updated_by_name = coalesce(who, 'A member of staff'),
         rebuild_requested = true,
         custom_deck = case when coalesce(p_rebuild_slides, false) then false else custom_deck end
   where id = l.id;
  return stamp;
end;
$$;

revoke all on function public.curriculum_save_lesson_content(uuid, jsonb, text, boolean, timestamptz) from public, anon;
grant execute on function public.curriculum_save_lesson_content(uuid, jsonb, text, boolean, timestamptz) to authenticated;

-- ── T35: the one-lesson quick build ─────────────────────────────────────────
create table if not exists public.curriculum_lesson_builds (
  lesson_id uuid primary key references public.curriculum_lessons(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'building', 'ready', 'failed')),
  requested_at timestamptz not null default now(),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_name text,
  started_at timestamptz,
  finished_at timestamptz,
  message text check (message is null or char_length(message) <= 500)
);

alter table public.curriculum_lesson_builds enable row level security;

drop policy if exists "curriculum_lesson_builds: staff read" on public.curriculum_lesson_builds;
create policy "curriculum_lesson_builds: staff read"
  on public.curriculum_lesson_builds for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));
-- No insert/update/delete policies: written by curriculum_request_lesson_build and the workflow.

create or replace function public.curriculum_request_lesson_build(p_lesson uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
  stamp timestamptz := now();
begin
  if not public.curriculum_can_edit_lesson(p_lesson) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.curriculum_lessons where id = p_lesson) then
    raise exception 'lesson not found' using errcode = 'P0002';
  end if;
  select full_name into who from public.profiles where id = auth.uid();
  insert into public.curriculum_lesson_builds (lesson_id, status, requested_at, requested_by, requested_by_name, started_at, finished_at, message)
  values (p_lesson, 'queued', stamp, auth.uid(), coalesce(who, 'A member of staff'), null, null, null)
  on conflict (lesson_id) do update
     set status = 'queued', requested_at = stamp, requested_by = excluded.requested_by, requested_by_name = excluded.requested_by_name,
         started_at = null, finished_at = null, message = null;
  return stamp;
end;
$$;

revoke all on function public.curriculum_request_lesson_build(uuid) from public, anon;
grant execute on function public.curriculum_request_lesson_build(uuid) to authenticated;

-- ── T34: lesson feedback ────────────────────────────────────────────────────
create table if not exists public.curriculum_lesson_feedback (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade,
  -- Which part: 'lesson' (the whole lesson), 'title', 'objectives', 'hook', 'keywords', 'starter',
  -- 'teach:<0-based index>', 'practice', 'independent', 'exit', 'homework' or 'plan'.
  part text not null default 'lesson' check (part ~ '^(lesson|title|objectives|hook|keywords|starter|teach:[0-9]{1,2}|practice|independent|exit|homework|plan)$'),
  part_label text check (part_label is null or char_length(part_label) <= 200),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'accepted', 'done', 'declined')),
  response text check (response is null or char_length(response) <= 1000),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_name text,
  created_at timestamptz not null default now(),
  handled_by uuid references public.profiles(id) on delete set null,
  handled_by_name text,
  handled_at timestamptz,
  constraint curriculum_lesson_feedback_decline_reason check (status <> 'declined' or char_length(btrim(coalesce(response, ''))) > 0)
);

create index if not exists curriculum_lesson_feedback_queue_idx on public.curriculum_lesson_feedback (status, created_at desc);
create index if not exists curriculum_lesson_feedback_lesson_idx on public.curriculum_lesson_feedback (lesson_id, created_at desc);
create index if not exists curriculum_lesson_feedback_author_idx on public.curriculum_lesson_feedback (author_id, handled_at desc);

-- Who changed what: one row per event, written only by the trigger below.
create table if not exists public.curriculum_lesson_feedback_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.curriculum_lesson_feedback(id) on delete cascade,
  action text not null check (action in ('created', 'accepted', 'done', 'declined', 'reopened', 'response')),
  from_status text,
  to_status text,
  note text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  at timestamptz not null default now()
);

create index if not exists curriculum_lesson_feedback_events_idx on public.curriculum_lesson_feedback_events (feedback_id, at);

-- Stamp the author on insert (always the signed-in person, always open) and the person who
-- answered on update. The note itself, its lesson, part and author never change after it is sent.
create or replace function public.curriculum_lesson_feedback_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
begin
  select full_name into who from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.author_id := auth.uid();
    end if;
    select full_name into new.author_name from public.profiles where id = new.author_id;
    new.author_name := coalesce(new.author_name, 'A member of staff');
    new.status := 'open';
    new.response := null;
    new.handled_by := null;
    new.handled_by_name := null;
    new.handled_at := null;
    new.created_at := now();
    new.body := btrim(new.body);
    return new;
  end if;
  if new.lesson_id is distinct from old.lesson_id or new.part is distinct from old.part or new.body is distinct from old.body
     or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'feedback cannot be rewritten' using errcode = '42501';
  end if;
  if new.status is distinct from old.status or new.response is distinct from old.response then
    new.handled_by := auth.uid();
    new.handled_by_name := coalesce(who, 'A member of staff');
    new.handled_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists curriculum_lesson_feedback_stamp on public.curriculum_lesson_feedback;
create trigger curriculum_lesson_feedback_stamp
  before insert or update on public.curriculum_lesson_feedback
  for each row execute function public.curriculum_lesson_feedback_stamp();

create or replace function public.curriculum_lesson_feedback_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.curriculum_lesson_feedback_events (feedback_id, action, to_status, note, actor_id, actor_name)
    values (new.id, 'created', new.status, new.body, new.author_id, new.author_name);
  elsif new.status is distinct from old.status then
    insert into public.curriculum_lesson_feedback_events (feedback_id, action, from_status, to_status, note, actor_id, actor_name)
    values (new.id, case when new.status = 'open' then 'reopened' else new.status end, old.status, new.status, new.response, new.handled_by, new.handled_by_name);
  elsif new.response is distinct from old.response then
    insert into public.curriculum_lesson_feedback_events (feedback_id, action, from_status, to_status, note, actor_id, actor_name)
    values (new.id, 'response', old.status, new.status, new.response, new.handled_by, new.handled_by_name);
  end if;
  return new;
end;
$$;

drop trigger if exists curriculum_lesson_feedback_log on public.curriculum_lesson_feedback;
create trigger curriculum_lesson_feedback_log
  after insert or update on public.curriculum_lesson_feedback
  for each row execute function public.curriculum_lesson_feedback_log();

drop trigger if exists audit_curriculum_lesson_feedback on public.curriculum_lesson_feedback;
create trigger audit_curriculum_lesson_feedback
  after insert or update or delete on public.curriculum_lesson_feedback
  for each row execute function public.audit_row_change();

alter table public.curriculum_lesson_feedback enable row level security;
alter table public.curriculum_lesson_feedback_events enable row level security;

-- Staff send feedback as themselves.
drop policy if exists "curriculum_lesson_feedback: staff create own" on public.curriculum_lesson_feedback;
create policy "curriculum_lesson_feedback: staff create own"
  on public.curriculum_lesson_feedback for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover'])
  );

-- Staff read their own; the Headteacher and Admin read every note.
drop policy if exists "curriculum_lesson_feedback: read own or head" on public.curriculum_lesson_feedback;
create policy "curriculum_lesson_feedback: read own or head"
  on public.curriculum_lesson_feedback for select
  to authenticated
  using (
    public.current_has_role(array['head_teacher', 'admin'])
    or (author_id = auth.uid() and public.current_has_role(array['teacher', 'teaching_assistant_cover']))
  );

-- Only the Headteacher and Admin answer (status and response; the trigger stamps who).
drop policy if exists "curriculum_lesson_feedback: head update" on public.curriculum_lesson_feedback;
create policy "curriculum_lesson_feedback: head update"
  on public.curriculum_lesson_feedback for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));
-- No delete policy: notes are kept.

revoke insert, update, delete on public.curriculum_lesson_feedback from anon, authenticated;
grant select on public.curriculum_lesson_feedback to authenticated;
grant insert (id, lesson_id, part, part_label, body) on public.curriculum_lesson_feedback to authenticated;
grant update (status, response) on public.curriculum_lesson_feedback to authenticated;

drop policy if exists "curriculum_lesson_feedback_events: as the feedback" on public.curriculum_lesson_feedback_events;
create policy "curriculum_lesson_feedback_events: as the feedback"
  on public.curriculum_lesson_feedback_events for select
  to authenticated
  using (exists (select 1 from public.curriculum_lesson_feedback f where f.id = feedback_id));
-- No insert/update/delete policies: written only by the trigger.
revoke insert, update, delete on public.curriculum_lesson_feedback_events from anon, authenticated;
