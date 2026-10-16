-- Teacher-made revision packs (builds on 0094_unit_revision.sql).
--
-- Until now a summary pack (summary slides + video + questions) could only be
-- added from content/revision/ by the sync script. Teachers can now make one in
-- the portal: upload one summary video, mark where each chapter starts, write
-- the chapter slides and quiz questions, then show it to pupils.
--
--   * source = 'staff' marks a pack made in the portal; the sync script never
--     touches those (scripts/lessons/sync-revision.mjs skips them).
--   * A staff pack can only be shown to pupils once a teacher has confirmed the
--     Arabic and the Qur'an / hadith references are checked (checked_at), the
--     same human check DESIGN.md asks for on every pack.
--   * Chapters of one video are time ranges on the summary slides
--     ({"start": 0, "end": 152.4}); the pupil player stops at the end of each
--     chapter, so a chapter never runs into the next one.
--
-- Also fixes 0094: pupils could only open the unit's own video, not the
-- per-chapter videos stored on summary slides, so chapters 2+ wouldn't play.

alter table public.revision_units
  add column if not exists source text not null default 'content',
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists checked_by uuid references public.profiles(id) on delete set null,
  add column if not exists checked_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'revision_units_source_check') then
    alter table public.revision_units add constraint revision_units_source_check check (source in ('content', 'staff'));
  end if;
end $$;

-- A staff pack stays hidden until it has been checked.
create or replace function public.revision_units_guard()
returns trigger
language plpgsql
as $$
begin
  if new.source = 'staff' and new.published and new.checked_at is null then
    raise exception 'A teacher must confirm the Arabic and references are checked before pupils can see this pack.'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists revision_units_guard_trg on public.revision_units;
create trigger revision_units_guard_trg
  before insert or update on public.revision_units
  for each row execute function public.revision_units_guard();

-- Teachers can create packs (staff packs only, never pretending to be content).
drop policy if exists "revision_units: teachers create" on public.revision_units;
create policy "revision_units: teachers create"
  on public.revision_units for insert to authenticated
  with check (
    source = 'staff'
    and public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[])
  );

-- Teachers can delete the packs made in the portal (content packs come back from the repo).
drop policy if exists "revision_units: teachers delete staff packs" on public.revision_units;
create policy "revision_units: teachers delete staff packs"
  on public.revision_units for delete to authenticated
  using (
    source = 'staff'
    and public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[])
  );

-- Replacing a video: teachers may remove files they uploaded under staff/.
drop policy if exists "revision-media: teachers remove staff uploads" on storage.objects;
create policy "revision-media: teachers remove staff uploads"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'revision-media'
    and name like 'staff/%'
    and public.current_has_role(array['head_teacher', 'admin', 'teacher']::public.learn_role[])
  );

-- Pupils: the unit video OR any chapter video on a slide of a published unit for their year.
create or replace function public.revision_pupil_can_read_media(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.revision_units u
    where u.published
      and u.year = public.revision_my_year()
      and (
        u.video_path = p_name
        or exists (select 1 from jsonb_array_elements(u.summary) s where s->>'video_path' = p_name)
      )
  );
$$;

revoke all on function public.revision_pupil_can_read_media(text) from public, anon;
grant execute on function public.revision_pupil_can_read_media(text) to authenticated;

-- Staff list: also say who made the pack and whether it has been checked.
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
      'source', u.source, 'checked_at', u.checked_at,
      'questions', (select count(*) from public.revision_questions q where q.unit_id = u.id and q.active and q.in_quiz),
      'practice_questions', (select count(*) from public.revision_questions q where q.unit_id = u.id and q.active and not q.in_quiz),
      'takers', (select count(distinct a.child_id) from public.revision_attempts a
                 where a.unit_id = u.id and a.answered > 0 and (v_leader or public.child_taught_by(a.child_id, auth.uid())))
    ) order by u.subject, u.sort_order, u.title)
    from public.revision_units u where u.year = p_year
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.revision_units_for_year(text) from public, anon;
grant execute on function public.revision_units_for_year(text) to authenticated;
