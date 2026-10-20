-- Need-to-know access (October 2026 review).
--
-- Teachers: see what they need to teach safely, and no more.
--   * Medical, allergy, medication, dietary and additional-needs information
--     and the two consents, for pupils they teach — through
--     teacher_pupil_health(). They no longer read the rest of the family's
--     record (home address, ethnicity, previous school, GP, siblings) or the
--     emergency contacts; the office holds those and acts in an emergency.
--   * Absences: they read the reason a family gave (and the office's
--     decision), but deciding, recording reasons and follow-ups are the
--     office's job, so those writes are removed.
-- Families: "Meet your teachers" shows who teaches their child and what, the
--   teacher's photo, title and short introduction. Qualifications, years of
--   experience, languages and a direct email are for staff only; families
--   use portal messages.

-- ── pupil records ────────────────────────────────────────────────────────
drop policy if exists "pupil_details: teacher reads own class's children" on public.pupil_details;
drop policy if exists "pupil_emergency_contacts: teacher reads own class's children" on public.pupil_emergency_contacts;

create or replace function public.teacher_pupil_health()
returns table (
  child_id uuid,
  medical_conditions text,
  allergies text,
  medication text,
  dietary_needs text,
  sen_notes text,
  health_confirmed boolean,
  photo_consent boolean,
  trip_consent boolean,
  completed_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select d.child_id, d.medical_conditions, d.allergies, d.medication, d.dietary_needs, d.sen_notes,
         d.health_confirmed, d.photo_consent, d.trip_consent, d.completed_at, d.updated_at
  from public.pupil_details d
  where public.child_enrolled_in_teachers_class(d.child_id);
$$;

revoke all on function public.teacher_pupil_health() from public, anon;
grant execute on function public.teacher_pupil_health() to authenticated;

-- ── absences ─────────────────────────────────────────────────────────────
drop policy if exists "absence_notes: teacher decides own class's children" on public.absence_notes;

drop policy if exists "absence_reasons: teacher manages own class's children" on public.absence_reasons;
drop policy if exists "absence_reasons: teacher reads own class's children" on public.absence_reasons;
create policy "absence_reasons: teacher reads own class's children"
  on public.absence_reasons for select to authenticated
  using (public.child_enrolled_in_teachers_class(absence_reasons.child_id));

drop policy if exists "absence_followups: teacher manages own class's children" on public.absence_followups;
drop policy if exists "absence_followups: teacher reads own class's children" on public.absence_followups;
create policy "absence_followups: teacher reads own class's children"
  on public.absence_followups for select to authenticated
  using (public.child_enrolled_in_teachers_class(absence_followups.child_id));

drop policy if exists "absence_followup_events: teacher manages own class's children" on public.absence_followup_events;

-- ── "Meet your teachers" for families ────────────────────────────────────
create or replace function public.meet_my_teachers(p_class_id uuid default null)
returns table (
  teacher_id uuid,
  full_name text,
  display_title text,
  bio text,
  qualifications text,
  subjects_taught text[],
  years_experience int,
  languages text[],
  photo_path text,
  contact_email text,
  class_names text[]
)
language sql
security definer
stable
set search_path = public
as $$
  with me as (
    select public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']::public.learn_role[]) as staff
  ),
  my_classes as (
    select e.class_id as cid
    from public.enrolments e
    join public.children c on c.id = e.child_id
    where (
        c.parent_user_id = auth.uid()
        or exists (select 1 from public.student_accounts sa where sa.child_id = c.id and sa.profile_id = auth.uid())
      )
      and (p_class_id is null or e.class_id = p_class_id)
    union
    select cl.id
    from public.classes cl
    where p_class_id is not null
      and cl.id = p_class_id
      and (public.current_has_role(array['head_teacher', 'admin']) or public.class_taught_by_current_user(cl.id))
  ),
  teacher_classes as (
    select ur.user_id as tid, ur.scope_id as cid
    from public.user_roles ur
    where ur.role in ('teacher', 'teaching_assistant_cover')
      and ur.scope_type = 'class'
      and ur.scope_id in (select cid from my_classes)
    union
    select cst.teacher_id, cst.class_id
    from public.class_subject_teachers cst
    where cst.class_id in (select cid from my_classes)
      and (cst.valid_to is null or cst.valid_to >= current_date)
      and (cst.valid_from is null or cst.valid_from <= current_date)
    union
    select ts.teacher_user_id, ts.class_id
    from public.timetable_slots ts
    join public.timetable_runs tr on tr.id = ts.run_id and tr.status = 'published'
    where ts.class_id in (select cid from my_classes)
  )
  select
    p.id,
    p.full_name,
    sp.display_title,
    sp.bio,
    case when (select staff from me) then sp.qualifications end,
    coalesce(sp.subjects_taught, '{}'::text[]),
    case when (select staff from me) then sp.years_experience end,
    case when (select staff from me) then coalesce(sp.languages, '{}'::text[]) else '{}'::text[] end,
    sp.photo_path,
    case when (select staff from me) and coalesce(sp.contact_visible, false) then p.email else null end,
    array_agg(distinct cl.name order by cl.name)
  from teacher_classes tc
  join public.profiles p on p.id = tc.tid
  join public.classes cl on cl.id = tc.cid
  left join public.staff_profiles sp on sp.user_id = p.id
  group by p.id, p.full_name, p.email, sp.display_title, sp.bio, sp.qualifications, sp.subjects_taught,
           sp.years_experience, sp.languages, sp.photo_path, sp.contact_visible
  order by p.full_name;
$$;

revoke all on function public.meet_my_teachers(uuid) from public, anon;
grant execute on function public.meet_my_teachers(uuid) to authenticated;

-- ── Revision results for parents ─────────────────────────────────────────
-- A parent sees, for each published revision unit in their child's year:
-- the latest and best quiz scores, how many topics are mastered, and the
-- topic to practise next. Answers and questions are never exposed.
create or replace function public.family_revision(p_child uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_year text;
begin
  if not (public.child_belongs_to_parent(p_child) or public.child_belongs_to_student(p_child)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select public.revision_year_key(yg.name) into v_year
  from public.children c left join public.year_groups yg on yg.id = c.year_group_id
  where c.id = p_child;

  return coalesce((
    select jsonb_agg(x order by x->>'subject', x->>'title')
    from (
      select jsonb_build_object(
        'id', u.id, 'subject', u.subject, 'unit', u.unit, 'title', u.title, 'has_video', u.video_path is not null,
        'topics', (select count(distinct q.topic) from public.revision_questions q where q.unit_id = u.id and q.active),
        'mastered', (select count(*) from public.revision_mastery m where m.child_id = p_child and m.unit_id = u.id and m.level >= 3),
        'quizzes', (select count(*) from public.revision_attempts a where a.child_id = p_child and a.unit_id = u.id and a.mode = 'quiz' and a.finished_at is not null),
        'practice', (select count(*) from public.revision_attempts a where a.child_id = p_child and a.unit_id = u.id and a.mode = 'practice' and a.answered > 0),
        'last_quiz', (
          select jsonb_build_object('correct', a.correct, 'total', a.total, 'at', a.finished_at)
          from public.revision_attempts a
          where a.child_id = p_child and a.unit_id = u.id and a.mode = 'quiz' and a.finished_at is not null
          order by a.finished_at desc limit 1),
        'best_pct', (
          select max(round(a.correct * 100.0 / nullif(a.total, 0)))
          from public.revision_attempts a
          where a.child_id = p_child and a.unit_id = u.id and a.mode = 'quiz' and a.finished_at is not null),
        'practise_next', (
          select m.topic from public.revision_mastery m
          where m.child_id = p_child and m.unit_id = u.id
          order by m.level asc, m.next_review_on asc nulls last limit 1)
      ) as x
      from public.revision_units u
      where u.published and u.year = v_year
        and exists (select 1 from public.revision_questions q where q.unit_id = u.id and q.active)
    ) s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.family_revision(uuid) from public, anon;
grant execute on function public.family_revision(uuid) to authenticated;
