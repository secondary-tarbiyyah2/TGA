-- Term resources (owner, Nov 2026: "make those resources for everything"). Every resource a lesson
-- names, listed once per term (content/resources/<term>.json, built by scripts/resources/register.mjs),
-- with the printable PDFs TGA makes itself (worksheets, quizzes, tests and mocks with a separate mark
-- scheme, knowledge organisers, writing frames, printable grids, practical guides). The workflow
-- "Build term resources" (scripts/resources/upload.mjs) writes this table with the service role and
-- stores the files in the private lesson-decks bucket under 'resources/<subject>/<year>/<id>…'.
--
-- Staff only: staff read the table and (already, 0091) the bucket. Pupils never read it: a teacher
-- shares a resource's PDF to a class (Classwork, class_materials), the existing share-to-class path.

create table if not exists public.curriculum_resources (
  id text primary key,
  terms text[] not null default '{}',
  title text not null,
  type text not null,
  subject text not null default '',
  subject_slug text not null,
  year text not null,
  units text[] not null default '{}',
  lesson_nos integer[] not null default '{}',
  lessons jsonb not null default '[]'::jsonb,
  source text not null,
  status text not null,
  wording text,
  pdf_path text,
  mark_scheme_path text,
  docx_path text,
  built_hash text,
  updated_at timestamptz not null default now()
);

comment on table public.curriculum_resources is
  'Term resource register: one row per resource the lessons name (content/resources/<term>.json), with the storage paths (bucket lesson-decks) of the PDFs TGA made. Written by the Build term resources workflow; staff read only.';

create index if not exists curriculum_resources_subject_year on public.curriculum_resources (subject_slug, year);
create index if not exists curriculum_resources_lessons on public.curriculum_resources using gin (lesson_nos);
create index if not exists curriculum_resources_terms on public.curriculum_resources using gin (terms);

alter table public.curriculum_resources enable row level security;

drop policy if exists "curriculum_resources: staff read" on public.curriculum_resources;
create policy "curriculum_resources: staff read"
  on public.curriculum_resources for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']::public.learn_role[]));

-- No insert, update or delete policy: only the workflow (service role) writes the register.
revoke all on public.curriculum_resources from anon;
grant select on public.curriculum_resources to authenticated;
