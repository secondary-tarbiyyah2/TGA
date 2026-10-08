-- Curriculum library: one row per lesson (a branded PowerPoint + PDF in storage),
-- with a version history so teachers can edit a deck (download, edit, re-upload)
-- when they fall behind schedule, and anyone can restore an earlier version.
--
-- Generated decks are loaded by the "Build lesson decks" workflow using the
-- service role (RLS bypassed). Staff changes go through the two RPCs below.

create table if not exists public.curriculum_lessons (
  id uuid primary key default gen_random_uuid(),
  subject_slug text not null,
  subject text not null,
  year text not null check (year ~ '^(reception|y([1-9]|10|11))$'),
  board text,
  unit text,
  lesson_no integer not null check (lesson_no > 0),
  title text not null,
  duration integer,
  objectives jsonb not null default '[]'::jsonb,
  deck_path text,
  pdf_path text,
  version integer not null default 1,
  edited_by uuid references public.profiles(id),
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subject_slug, year, lesson_no)
);

create index if not exists curriculum_lessons_browse_idx on public.curriculum_lessons (year, subject_slug, lesson_no);

create table if not exists public.curriculum_lesson_versions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade,
  version integer not null,
  deck_path text,
  pdf_path text,
  note text check (note is null or char_length(note) <= 500),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (lesson_id, version)
);

alter table public.curriculum_lessons enable row level security;
alter table public.curriculum_lesson_versions enable row level security;

drop policy if exists "curriculum_lessons: staff read" on public.curriculum_lessons;
create policy "curriculum_lessons: staff read"
  on public.curriculum_lessons for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));

drop policy if exists "curriculum_lesson_versions: staff read" on public.curriculum_lesson_versions;
create policy "curriculum_lesson_versions: staff read"
  on public.curriculum_lesson_versions for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));

drop trigger if exists audit_curriculum_lessons on public.curriculum_lessons;
create trigger audit_curriculum_lessons
  after insert or update or delete on public.curriculum_lessons
  for each row execute function public.audit_row_change();

-- ── RPC: replace a lesson's deck with a newly uploaded file ──────────────
create or replace function public.curriculum_replace_deck(p_lesson uuid, p_deck_path text, p_pdf_path text, p_note text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.curriculum_lessons%rowtype;
  v integer;
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into l from public.curriculum_lessons where id = p_lesson for update;
  if not found then
    raise exception 'lesson not found' using errcode = 'P0002';
  end if;
  if p_deck_path is null or p_deck_path not like (l.subject_slug || '/' || l.year || '/%') then
    raise exception 'invalid deck path' using errcode = '22023';
  end if;
  if p_pdf_path is not null and p_pdf_path not like (l.subject_slug || '/' || l.year || '/%') then
    raise exception 'invalid pdf path' using errcode = '22023';
  end if;
  v := l.version + 1;
  insert into public.curriculum_lesson_versions (lesson_id, version, deck_path, pdf_path, note, uploaded_by)
  values (l.id, v, p_deck_path, p_pdf_path, nullif(btrim(p_note), ''), auth.uid());
  update public.curriculum_lessons
     set deck_path = p_deck_path, pdf_path = p_pdf_path, version = v, edited_by = auth.uid(), edited_at = now()
   where id = l.id;
  return v;
end;
$$;

revoke all on function public.curriculum_replace_deck(uuid, text, text, text) from public, anon;
grant execute on function public.curriculum_replace_deck(uuid, text, text, text) to authenticated;

-- ── RPC: restore an earlier version (as a new version) ───────────────────
create or replace function public.curriculum_restore_version(p_version uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  old public.curriculum_lesson_versions%rowtype;
  cur_v integer;
  v integer;
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into old from public.curriculum_lesson_versions where id = p_version;
  if not found then
    raise exception 'version not found' using errcode = 'P0002';
  end if;
  select version into cur_v from public.curriculum_lessons where id = old.lesson_id for update;
  v := cur_v + 1;
  insert into public.curriculum_lesson_versions (lesson_id, version, deck_path, pdf_path, note, uploaded_by)
  values (old.lesson_id, v, old.deck_path, old.pdf_path, 'Restored version ' || old.version, auth.uid());
  update public.curriculum_lessons
     set deck_path = old.deck_path, pdf_path = old.pdf_path, version = v, edited_by = auth.uid(), edited_at = now()
   where id = old.lesson_id;
  return v;
end;
$$;

revoke all on function public.curriculum_restore_version(uuid) from public, anon;
grant execute on function public.curriculum_restore_version(uuid) to authenticated;

-- ── storage: lesson-decks (private) ──────────────────────────────────────
-- Path: '<subject_slug>/<year>/<lesson_no>/v<version>-<file>'. Objects are
-- never updated or deleted by users: every edit is a new object, so history is kept.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-decks',
  'lesson-decks',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.presentation'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lesson-decks: staff read" on storage.objects;
create policy "lesson-decks: staff read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'lesson-decks'
    and public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover'])
  );

drop policy if exists "lesson-decks: teachers upload" on storage.objects;
create policy "lesson-decks: teachers upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'lesson-decks'
    and public.current_has_role(array['head_teacher', 'admin', 'teacher'])
  );
