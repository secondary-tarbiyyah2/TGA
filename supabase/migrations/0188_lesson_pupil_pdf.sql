-- Lessons v3: a pupil PDF for every lesson (all the slides pupils need plus a worksheet with
-- space to write, A4, printable or for a drawing tablet). "Build lesson decks"
-- (scripts/lessons/upload-decks.mjs) stores it in the lesson-decks bucket at
-- '<subject>/<year>/<lesson_no>/pupil-<file>.pdf' and records the path here. The first slide of
-- each deck and the lesson plan link to the portal page /lesson-pdf/?s=&y=&n=, which opens it for
-- staff, and for pupils in that lesson's year (the same year rule as the revision slides, 0094).

alter table public.curriculum_lessons add column if not exists pupil_pdf_path text;
comment on column public.curriculum_lessons.pupil_pdf_path is
  'Storage path (bucket lesson-decks) of the pupil PDF: the slides pupils need and a worksheet. Written by the Build lesson decks workflow.';

-- The pupil PDF's path for one lesson, if the caller may open it: staff, or a pupil in that year.
create or replace function public.lesson_pupil_pdf_path(p_subject text, p_year text, p_lesson integer)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select cl.pupil_pdf_path
  from public.curriculum_lessons cl
  where cl.subject_slug = p_subject
    and cl.year = p_year
    and cl.lesson_no = p_lesson
    and (
      public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']::public.learn_role[])
      or cl.year = public.revision_my_year()
    );
$$;

revoke all on function public.lesson_pupil_pdf_path(text, text, integer) from public, anon;
grant execute on function public.lesson_pupil_pdf_path(text, text, integer) to authenticated;

-- Storage: a pupil may read the pupil PDF of a lesson in their own year (staff already read the bucket).
create or replace function public.lesson_pupil_can_read_pdf(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.curriculum_lessons cl
    where cl.pupil_pdf_path = p_name and cl.year = public.revision_my_year()
  );
$$;

revoke all on function public.lesson_pupil_can_read_pdf(text) from public, anon;
grant execute on function public.lesson_pupil_can_read_pdf(text) to authenticated;

drop policy if exists "lesson-decks: pupils read lesson PDFs" on storage.objects;
create policy "lesson-decks: pupils read lesson PDFs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'lesson-decks'
    and public.current_has_role(array['student']::public.learn_role[])
    and public.lesson_pupil_can_read_pdf(name)
  );
