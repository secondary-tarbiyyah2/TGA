-- Homework marking: in-browser annotation of submitted PDFs / images.
--
-- A teacher marks a submitted file in the browser (pen, highlighter, text,
-- ticks...). Three things are stored:
--   * homework_markup        the VECTOR strokes (jsonb) per submitted file, so the
--                            teacher can reopen and carry on, plus a pointer to the
--                            flattened "marked" copy. Staff only: a family never
--                            reads the strokes, only the flattened copy.
--   * homework-marked bucket the flattened marked file (a NEW object each save;
--                            the student's original is never overwritten).
--   * homework_feedback      (0071) gains mark + marked_files. "Return to student"
--                            writes these and sets the existing status, so the
--                            0071 feedback flow (feedback_given ->
--                            resubmission_requested -> resubmitted) is reused as is.
--
-- A marked file is readable by the family only once a feedback row lists it
-- (i.e. after "Return to student"); drafts stay staff-only.
--
-- homework_markup is deliberately NOT audited by audit_row_change(): that
-- trigger copies the whole row into audit_log and the strokes can be large.
-- The return itself is audited through homework_feedback.
--
-- Idempotent.

-- ── homework_feedback: mark + marked files ───────────────────────────────
alter table public.homework_feedback
  add column if not exists mark numeric(7, 2),
  add column if not exists marked_files jsonb not null default '[]'::jsonb; -- [{source, path, name, mime}] in homework-marked

alter table public.homework_feedback drop constraint if exists homework_feedback_mark_check;
alter table public.homework_feedback add constraint homework_feedback_mark_check
  check (mark is null or (mark >= 0 and mark <= 100000));

alter table public.homework_feedback drop constraint if exists homework_feedback_marked_files_check;
alter table public.homework_feedback add constraint homework_feedback_marked_files_check
  check (jsonb_typeof(marked_files) = 'array' and jsonb_array_length(marked_files) <= 10);

-- A returned piece of work may carry only a mark or only a marked file.
alter table public.homework_feedback drop constraint if exists homework_feedback_has_content;
alter table public.homework_feedback add constraint homework_feedback_has_content check (
  char_length(btrim(coalesce(feedback_text, ''))) > 0
  or audio_path is not null
  or mark is not null
  or jsonb_array_length(marked_files) > 0
);

-- Same guard as 0071, plus: every marked file must live in this submission's own folder.
create or replace function public.homework_feedback_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_homework uuid;
  v_child uuid;
  v_requested boolean := false;
  v_item jsonb;
  v_path text;
begin
  select hs.homework_id, hs.child_id into v_homework, v_child
  from public.homework_submissions hs where hs.id = new.submission_id;
  if v_homework is null then
    raise exception 'submission_not_found' using errcode = '23503';
  end if;

  if new.audio_path is not null
     and (split_part(new.audio_path, '/', 1) <> v_homework::text
          or split_part(new.audio_path, '/', 2) <> v_child::text
          or split_part(new.audio_path, '/', 3) = '') then
    raise exception 'invalid_audio_path' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(new.marked_files) loop
    v_path := v_item ->> 'path';
    if v_path is null
       or split_part(v_path, '/', 1) <> v_homework::text
       or split_part(v_path, '/', 2) <> v_child::text
       or split_part(v_path, '/', 3) = '' then
      raise exception 'invalid_marked_path' using errcode = '22023';
    end if;
  end loop;

  if tg_op = 'UPDATE' then
    new.submission_id := old.submission_id;
    -- Only the definer trigger (0071) may move requested -> resubmitted; it
    -- also bumps these two columns. Every other write keeps them as they were.
    if not (old.status = 'resubmission_requested' and new.status = 'resubmitted') then
      new.resubmit_count := old.resubmit_count;
      new.resubmitted_at := old.resubmitted_at;
    end if;
    v_requested := old.status = 'resubmission_requested';
  end if;

  if new.status = 'resubmission_requested' and not v_requested then
    new.requested_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ── homework_markup: strokes + the latest flattened copy ─────────────────
create table if not exists public.homework_markup (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.homework_submissions(id) on delete cascade,
  source_path text not null, -- the submitted file (object name in homework-submissions)
  strokes jsonb not null default '{}'::jsonb, -- {v, pages: {"1": [shape, ...]}} written by the annotator
  marked_path text, -- latest flattened copy (object name in homework-marked)
  marked_name text,
  marked_mime text,
  marked_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, source_path),
  constraint homework_markup_strokes_size check (octet_length(strokes::text) <= 4000000)
);

alter table public.homework_markup enable row level security;

create index if not exists homework_markup_submission_idx on public.homework_markup (submission_id);

-- Keeps the object names inside this submission's own folders and the
-- identity columns fixed.
create or replace function public.homework_markup_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_homework uuid;
  v_child uuid;
begin
  select hs.homework_id, hs.child_id into v_homework, v_child
  from public.homework_submissions hs where hs.id = new.submission_id;
  if v_homework is null then
    raise exception 'submission_not_found' using errcode = '23503';
  end if;

  if split_part(new.source_path, '/', 1) <> v_homework::text
     or split_part(new.source_path, '/', 2) <> v_child::text
     or split_part(new.source_path, '/', 3) = '' then
    raise exception 'invalid_source_path' using errcode = '22023';
  end if;
  if new.marked_path is not null
     and (split_part(new.marked_path, '/', 1) <> v_homework::text
          or split_part(new.marked_path, '/', 2) <> v_child::text
          or split_part(new.marked_path, '/', 3) = '') then
    raise exception 'invalid_marked_path' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    new.submission_id := old.submission_id;
    new.source_path := old.source_path;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists homework_markup_guard on public.homework_markup;
create trigger homework_markup_guard
  before insert or update on public.homework_markup
  for each row execute function public.homework_markup_guard();

drop policy if exists "homework_markup: teacher of class manages" on public.homework_markup;
create policy "homework_markup: teacher of class manages"
  on public.homework_markup for all
  to authenticated
  using (public.class_taught_by_current_user(public.submission_homework_class_id(homework_markup.submission_id)))
  with check (public.class_taught_by_current_user(public.submission_homework_class_id(homework_markup.submission_id)));

drop policy if exists "homework_markup: head_teacher/admin manage all" on public.homework_markup;
create policy "homework_markup: head_teacher/admin manage all"
  on public.homework_markup for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "homework_markup: manage_academic staff manage all" on public.homework_markup;
create policy "homework_markup: manage_academic staff manage all"
  on public.homework_markup for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

-- ── storage: homework-marked (private; '<homework_id>/<child_id>/<file>') ─
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homework-marked', 'homework-marked', false, 52428800, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Has a teacher returned this marked file (does a feedback row list it)?
create or replace function public.homework_marked_returned(p_path text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.homework_feedback f
    where f.marked_files @> jsonb_build_array(jsonb_build_object('path', p_path))
  );
$$;

grant execute on function public.homework_marked_returned(text) to authenticated;

drop policy if exists "homework-marked: teacher/head read" on storage.objects;
create policy "homework-marked: teacher/head read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'homework-marked'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.current_has_permission('manage_academic')
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

drop policy if exists "homework-marked: parent/student read returned" on storage.objects;
create policy "homework-marked: parent/student read returned"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'homework-marked'
    and (
      public.child_belongs_to_parent(public.storage_path_uuid_part(name, 2))
      or public.child_belongs_to_student(public.storage_path_uuid_part(name, 2))
    )
    and public.homework_marked_returned(name)
  );

drop policy if exists "homework-marked: teacher/head upload" on storage.objects;
create policy "homework-marked: teacher/head upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'homework-marked'
    and public.homework_child_enrolled(public.storage_path_uuid_part(name, 1), public.storage_path_uuid_part(name, 2))
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

drop policy if exists "homework-marked: teacher/head replace" on storage.objects;
create policy "homework-marked: teacher/head replace"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'homework-marked'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

drop policy if exists "homework-marked: teacher/head delete" on storage.objects;
create policy "homework-marked: teacher/head delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'homework-marked'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );
