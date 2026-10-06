-- Homework: edit / archive, per-assignment options, multi-file submissions.
--
-- 1. Staff can EDIT an assignment (title, instructions, due date, max points,
--    attachments, allowed submission types, late policy, class) and ARCHIVE it
--    (soft delete: submissions, marks and feedback are kept; students and
--    parents stop seeing it). RLS: the assigning teacher, any teacher of the
--    class, and head_teacher/admin may update (0010/0055 already allowed
--    delete for the setter and head/admin; the UI now archives instead).
--    An "edited" stamp is kept by a trigger so the client cannot forge or skip it.
--
-- 2. A submission can carry typed text, a link and MANY files (a jsonb list;
--    homework_submissions.file_path stays as the first file for older readers).
--    The homework row says which of text / file / link are allowed and which
--    kinds of file (pdf, image, document, audio, video); a trigger enforces it
--    so it cannot be bypassed from the browser. Parents may now CREATE the first
--    submission for their child (they could previously only resubmit on request).
--
-- 3. Storage: homework-submissions gets a wider mime allow-list and a 50MB cap
--    (video / audio recitations). New private bucket homework-attachments holds
--    the files a teacher attaches to the assignment itself.
--
-- Conventions as 0010/0055/0071: SECURITY DEFINER stable helpers for
-- cross-table checks, audit_row_change() (needs NEW.id), idempotent.

-- ── homework: new columns ────────────────────────────────────────────────
alter table public.homework
  add column if not exists max_points numeric(7, 2),
  add column if not exists allowed_submission_types text[] not null default array['text', 'file', 'link']::text[],
  add column if not exists allowed_file_types text[] not null default array['pdf', 'image', 'document', 'audio', 'video']::text[],
  add column if not exists late_policy text not null default 'allow',
  add column if not exists attachments jsonb not null default '[]'::jsonb, -- [{path, name, mime, size}] in homework-attachments
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id);

alter table public.homework drop constraint if exists homework_max_points_check;
alter table public.homework add constraint homework_max_points_check
  check (max_points is null or (max_points >= 0 and max_points <= 100000));

alter table public.homework drop constraint if exists homework_allowed_submission_types_check;
alter table public.homework add constraint homework_allowed_submission_types_check
  check (cardinality(allowed_submission_types) >= 1 and allowed_submission_types <@ array['text', 'file', 'link']::text[]);

alter table public.homework drop constraint if exists homework_allowed_file_types_check;
alter table public.homework add constraint homework_allowed_file_types_check
  check (allowed_file_types <@ array['pdf', 'image', 'document', 'audio', 'video']::text[]);

alter table public.homework drop constraint if exists homework_late_policy_check;
alter table public.homework add constraint homework_late_policy_check
  check (late_policy in ('allow', 'block'));

alter table public.homework drop constraint if exists homework_attachments_check;
alter table public.homework add constraint homework_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);

create index if not exists homework_archived_idx on public.homework (class_id, archived_at);

-- ── file-type helper ─────────────────────────────────────────────────────
-- Which allowed_file_types categories an object name belongs to, by extension.
-- .webm can be audio or video, so it counts as both. Unknown extension -> {}.
create or replace function public.homework_file_categories(p_name text)
returns text[]
language sql
immutable
as $$
  select case lower(coalesce(substring(p_name from '\.([A-Za-z0-9]+)$'), ''))
    when 'pdf' then array['pdf']
    when 'png' then array['image'] when 'jpg' then array['image'] when 'jpeg' then array['image']
    when 'webp' then array['image'] when 'gif' then array['image'] when 'heic' then array['image'] when 'heif' then array['image']
    when 'doc' then array['document'] when 'docx' then array['document'] when 'odt' then array['document']
    when 'rtf' then array['document'] when 'txt' then array['document'] when 'pages' then array['document']
    when 'ppt' then array['document'] when 'pptx' then array['document'] when 'xls' then array['document']
    when 'xlsx' then array['document'] when 'csv' then array['document']
    when 'mp3' then array['audio'] when 'm4a' then array['audio'] when 'aac' then array['audio']
    when 'wav' then array['audio'] when 'ogg' then array['audio'] when 'oga' then array['audio'] when 'opus' then array['audio']
    when 'webm' then array['audio', 'video']
    when 'mp4' then array['video'] when 'mov' then array['video'] when 'm4v' then array['video'] when '3gp' then array['video']
    else array[]::text[]
  end;
$$;

grant execute on function public.homework_file_categories(text) to authenticated;

-- ── homework guard: stamps, locks, archive bookkeeping ───────────────────
-- SECURITY DEFINER so it can see whether any submission exists even when the
-- editor (e.g. an assigning teacher who no longer teaches the class) could not.
create or replace function public.homework_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The original setter stays the setter, whoever edits.
  new.teacher_id := old.teacher_id;
  new.created_at := old.created_at;

  if new.class_id is distinct from old.class_id then
    -- Moving homework to another class would orphan its submissions.
    if exists (select 1 from public.homework_submissions hs where hs.homework_id = old.id) then
      raise exception 'class_locked_has_submissions' using errcode = '23514';
    end if;
    if not (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.current_has_permission('manage_academic')
      or public.class_taught_by_current_user(new.class_id)
    ) then
      raise exception 'not_your_class' using errcode = '42501';
    end if;
  end if;

  -- "Edited" stamp. Skipped for two minutes after creation so the attachment
  -- upload that follows "set homework" does not mark a new assignment as edited.
  if old.created_at < now() - interval '2 minutes'
     and (new.title, new.instructions, new.due_at, new.resources, new.max_points, new.allowed_submission_types,
          new.allowed_file_types, new.late_policy, new.attachments, new.class_id)
         is distinct from
         (old.title, old.instructions, old.due_at, old.resources, old.max_points, old.allowed_submission_types,
          old.allowed_file_types, old.late_policy, old.attachments, old.class_id)
  then
    new.edited_at := now();
    new.edited_by := auth.uid();
    new.updated_at := now();
  else
    new.edited_at := old.edited_at;
    new.edited_by := old.edited_by;
  end if;

  if new.archived_at is distinct from old.archived_at then
    new.archived_by := case when new.archived_at is null then null else auth.uid() end;
  else
    new.archived_by := old.archived_by;
  end if;
  return new;
end;
$$;

drop trigger if exists homework_guard on public.homework;
create trigger homework_guard
  before update on public.homework
  for each row execute function public.homework_guard();

-- ── homework: who may update / see ───────────────────────────────────────
-- Any teacher of the class may edit it (0010 only allowed the original setter,
-- because of its teacher_id = auth.uid() check)...
drop policy if exists "homework: class teacher updates" on public.homework;
create policy "homework: class teacher updates"
  on public.homework for update
  to authenticated
  using (public.class_taught_by_current_user(homework.class_id))
  with check (public.class_taught_by_current_user(homework.class_id));

-- ...and the teacher who set it may always edit or archive their own.
-- (Moving it to a class they do not teach is refused by homework_guard.)
drop policy if exists "homework: assigning teacher updates" on public.homework;
create policy "homework: assigning teacher updates"
  on public.homework for update
  to authenticated
  using (homework.teacher_id = auth.uid())
  with check (homework.teacher_id = auth.uid());

-- Families stop seeing archived homework. Staff policies are unchanged, so
-- staff can still list and restore it.
drop policy if exists "homework: parent reads own child's class" on public.homework;
create policy "homework: parent reads own child's class"
  on public.homework for select
  to authenticated
  using (public.class_has_parents_child(homework.class_id) and homework.archived_at is null);

drop policy if exists "homework: student reads own class" on public.homework;
create policy "homework: student reads own class"
  on public.homework for select
  to authenticated
  using (public.class_has_students_own_enrolment(homework.class_id) and homework.archived_at is null);

-- ── homework_submissions: files, link ────────────────────────────────────
alter table public.homework_submissions
  add column if not exists link_url text,
  add column if not exists files jsonb not null default '[]'::jsonb; -- [{path, name, mime, size}]

alter table public.homework_submissions drop constraint if exists homework_submissions_link_url_check;
alter table public.homework_submissions add constraint homework_submissions_link_url_check
  check (link_url is null or (char_length(link_url) <= 2000 and link_url ~* '^https?://'));

alter table public.homework_submissions drop constraint if exists homework_submissions_files_check;
alter table public.homework_submissions add constraint homework_submissions_files_check
  check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 10);

alter table public.homework_submissions drop constraint if exists homework_submissions_kind_check;
alter table public.homework_submissions add constraint homework_submissions_kind_check
  check (kind in ('text', 'file', 'link', 'mixed'));

alter table public.homework_submissions drop constraint if exists homework_submissions_content_shape;
alter table public.homework_submissions add constraint homework_submissions_content_shape
  check (
    (kind = 'text' and response_text is not null and file_path is null)
    or (kind = 'file' and file_path is not null)
    or (kind = 'link' and link_url is not null)
    or (kind = 'mixed' and (response_text is not null or file_path is not null or link_url is not null))
  );

-- ── helpers ──────────────────────────────────────────────────────────────
create or replace function public.homework_has_submission(p_homework_id uuid, p_child_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.homework_submissions s
    where s.homework_id = p_homework_id and s.child_id = p_child_id
  );
$$;

grant execute on function public.homework_has_submission(uuid, uuid) to authenticated;

-- Can this child still hand work in? Not once archived; and not after the due
-- date when the assignment's late policy is 'block' (unless the teacher has
-- asked for a resubmission).
create or replace function public.homework_accepts_submission(p_homework_id uuid, p_child_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.homework h
    where h.id = p_homework_id
      and h.archived_at is null
      and (
        h.late_policy = 'allow'
        or now() <= h.due_at
        or public.homework_resubmission_requested(h.id, p_child_id)
      )
  );
$$;

grant execute on function public.homework_accepts_submission(uuid, uuid) to authenticated;

-- ── submissions guard: allowed types, folder scoping ─────────────────────
create or replace function public.homework_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_types text[];
  v_files text[];
  v_prefix text;
  v_item jsonb;
  v_path text;
  v_paths text[] := array[]::text[];
begin
  -- Rows that are merely touched (e.g. by the resubmission bookkeeping) are not re-judged.
  if tg_op = 'UPDATE'
     and new.response_text is not distinct from old.response_text
     and new.file_path is not distinct from old.file_path
     and new.files is not distinct from old.files
     and new.link_url is not distinct from old.link_url
  then
    return new;
  end if;

  select h.allowed_submission_types, h.allowed_file_types into v_types, v_files
  from public.homework h where h.id = new.homework_id;
  if v_types is null then
    raise exception 'homework_not_found' using errcode = '23503';
  end if;

  v_prefix := new.homework_id::text || '/' || new.child_id::text || '/';

  if jsonb_typeof(new.files) <> 'array' then
    raise exception 'invalid_files' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(new.files) loop
    v_path := v_item ->> 'path';
    if v_path is null then
      raise exception 'invalid_files' using errcode = '22023';
    end if;
    v_paths := v_paths || v_path;
  end loop;
  if new.file_path is not null then
    v_paths := v_paths || new.file_path;
  end if;

  -- file_path always mirrors the first file in the list.
  if jsonb_array_length(new.files) > 0 then
    new.file_path := new.files -> 0 ->> 'path';
  end if;

  if coalesce(btrim(new.response_text), '') <> '' and not ('text' = any (v_types)) then
    raise exception 'text_not_allowed' using errcode = '23514';
  end if;
  if new.link_url is not null and not ('link' = any (v_types)) then
    raise exception 'link_not_allowed' using errcode = '23514';
  end if;
  if cardinality(v_paths) > 0 and not ('file' = any (v_types)) then
    raise exception 'file_not_allowed' using errcode = '23514';
  end if;

  foreach v_path in array v_paths loop
    if left(v_path, char_length(v_prefix)) <> v_prefix or char_length(v_path) = char_length(v_prefix) then
      raise exception 'invalid_file_path' using errcode = '22023';
    end if;
    if not (v_files && public.homework_file_categories(v_path)) then
      raise exception 'file_type_not_allowed' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists homework_submissions_guard on public.homework_submissions;
create trigger homework_submissions_guard
  before insert or update on public.homework_submissions
  for each row execute function public.homework_submissions_guard();

-- A change to files or the link also counts as a resubmission (0071).
drop trigger if exists homework_submission_resubmitted on public.homework_submissions;
create trigger homework_submission_resubmitted
  after update on public.homework_submissions
  for each row
  when (
    old.response_text is distinct from new.response_text
    or old.file_path is distinct from new.file_path
    or old.files is distinct from new.files
    or old.link_url is distinct from new.link_url
    or old.kind is distinct from new.kind
    or old.submitted_at is distinct from new.submitted_at
  )
  execute function public.homework_submission_resubmitted();

-- ── submissions: RLS ─────────────────────────────────────────────────────
-- Student: unchanged except that the homework must still accept work.
drop policy if exists "homework_submissions: student manages own" on public.homework_submissions;
create policy "homework_submissions: student manages own"
  on public.homework_submissions for all
  to authenticated
  using (public.child_belongs_to_student(homework_submissions.child_id))
  with check (
    public.child_belongs_to_student(homework_submissions.child_id)
    and public.homework_child_enrolled(homework_submissions.homework_id, homework_submissions.child_id)
    and public.homework_accepts_submission(homework_submissions.homework_id, homework_submissions.child_id)
  );

-- Parent: may create the first submission on their child's behalf. (Updating
-- one stays limited to an open resubmission request, policy from 0071.)
drop policy if exists "homework_submissions: parent submits for own child" on public.homework_submissions;
create policy "homework_submissions: parent submits for own child"
  on public.homework_submissions for insert
  to authenticated
  with check (
    public.child_belongs_to_parent(homework_submissions.child_id)
    and public.homework_child_enrolled(homework_submissions.homework_id, homework_submissions.child_id)
    and public.homework_accepts_submission(homework_submissions.homework_id, homework_submissions.child_id)
  );

-- ── storage: homework-submissions (wider types, 50MB) ────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homework-submissions',
  'homework-submissions',
  false,
  52428800, -- 50MB (a Supabase project-wide upload limit below this still applies)
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/rtf', 'text/rtf', 'text/plain', 'text/csv',
    'application/vnd.apple.pages', 'application/x-iwork-pages-sffpages',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav',
    'audio/webm', 'audio/ogg', 'audio/opus',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-m4v'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A parent uploading the FIRST submission for their child (the 0071 policy only
-- covers a requested resubmission).
drop policy if exists "homework-submissions: parent uploads first submission" on storage.objects;
create policy "homework-submissions: parent uploads first submission"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'homework-submissions'
    and public.child_belongs_to_parent(public.storage_path_uuid_part(name, 2))
    and public.homework_child_enrolled(public.storage_path_uuid_part(name, 1), public.storage_path_uuid_part(name, 2))
    and public.homework_accepts_submission(public.storage_path_uuid_part(name, 1), public.storage_path_uuid_part(name, 2))
    and not public.homework_has_submission(public.storage_path_uuid_part(name, 1), public.storage_path_uuid_part(name, 2))
  );

-- ── storage: homework-attachments (files the teacher attaches) ──────────
-- Path: '<homework_id>/<file>'.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homework-attachments',
  'homework-attachments',
  false,
  52428800,
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/rtf', 'text/rtf', 'text/plain', 'text/csv',
    'application/vnd.apple.pages', 'application/x-iwork-pages-sffpages',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav',
    'audio/webm', 'audio/ogg', 'audio/opus',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-m4v'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "homework-attachments: staff read" on storage.objects;
create policy "homework-attachments: staff read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'homework-attachments'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.current_has_permission('manage_academic')
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

drop policy if exists "homework-attachments: class families read" on storage.objects;
create policy "homework-attachments: class families read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'homework-attachments'
    and (
      public.class_has_parents_child(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
      or public.class_has_students_own_enrolment(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

drop policy if exists "homework-attachments: staff upload" on storage.objects;
create policy "homework-attachments: staff upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'homework-attachments'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

drop policy if exists "homework-attachments: staff replace" on storage.objects;
create policy "homework-attachments: staff replace"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'homework-attachments'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

drop policy if exists "homework-attachments: staff delete" on storage.objects;
create policy "homework-attachments: staff delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'homework-attachments'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

-- ── Late & missing: leave archived homework out ─────────────────────────
create or replace view public.homework_attention
  with (security_invoker = true) as
  select
    hs.homework_id,
    h.title as homework_title,
    hs.class_id,
    c.name as class_name,
    hs.due_at,
    hs.child_id,
    ch.name as child_name,
    hs.submission_id,
    hs.submitted_at,
    case when hf.status = 'resubmission_requested' then 'resubmission_requested' else hs.status end as attention,
    hf.requested_at as resubmission_requested_at
  from public.homework_status hs
  join public.homework h on h.id = hs.homework_id
  left join public.classes c on c.id = hs.class_id
  left join public.children ch on ch.id = hs.child_id
  left join public.homework_feedback hf on hf.submission_id = hs.submission_id
  where (hs.status in ('late', 'missing') or hf.status = 'resubmission_requested')
    and h.archived_at is null;

grant select on public.homework_attention to authenticated;
