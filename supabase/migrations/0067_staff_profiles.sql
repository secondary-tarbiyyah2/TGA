-- Teacher information.
--  * staff_profiles: the public-facing "about me" a teacher writes for
--    families (title, bio, qualifications, subjects, photo). Teachers edit
--    their own row; Headteacher/Admin edit any. Families and students never
--    read the table directly: they use meet_my_teachers() (SECURITY DEFINER)
--    which returns a safe subset for teachers who teach their class/child.
--  * Internal HR-ish dates live in the EXISTING Single Central Record,
--    staff_vetting_records (0015, Headteacher/Admin only) rather than a
--    duplicate table: DBS check/renewal and right-to-work are already there,
--    so this only adds safeguarding_training_date and start_date.
--
-- Conventions follow 0015/0039/0044: RLS default deny, SECURITY DEFINER
-- helpers, audit_row_change(). NOTE: the shared audit_row_change() reads
-- NEW/OLD.id unconditionally, so staff_profiles keeps a surrogate `id`
-- and a UNIQUE user_id (one row per member of staff).

-- ── staff_vetting_records: two extra compliance dates ─────────────────────
alter table public.staff_vetting_records
  add column if not exists safeguarding_training_date date,
  add column if not exists start_date date;

-- ── staff_profiles ──────────────────────────────────────────────────────
create table public.staff_profiles (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  display_title text check (display_title is null or char_length(display_title) <= 20), -- e.g. 'Mr', 'Mrs', 'Ustadh'
  bio text check (bio is null or char_length(bio) <= 2000),
  qualifications text check (qualifications is null or char_length(qualifications) <= 1000),
  subjects_taught text[] not null default '{}',
  years_experience int check (years_experience is null or (years_experience >= 0 and years_experience <= 60)),
  languages text[] not null default '{}',
  photo_path text, -- object name inside the private staff-photos bucket: <user_id>/<file>
  contact_visible boolean not null default false, -- share the work email with families who teach/are taught by this person
  updated_at timestamptz not null default now()
);

alter table public.staff_profiles enable row level security;

create policy "staff_profiles: head_teacher/admin all"
  on public.staff_profiles for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "staff_profiles: teacher reads own"
  on public.staff_profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "staff_profiles: teacher creates own"
  on public.staff_profiles for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.current_has_role(array['teacher', 'teaching_assistant_cover'])
  );

create policy "staff_profiles: teacher updates own"
  on public.staff_profiles for update
  to authenticated
  using (user_id = auth.uid() and public.current_has_role(array['teacher', 'teaching_assistant_cover']))
  with check (user_id = auth.uid() and public.current_has_role(array['teacher', 'teaching_assistant_cover']));

create or replace function public.staff_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger staff_profiles_guard
  before insert or update on public.staff_profiles
  for each row execute function public.staff_profiles_guard();

create trigger audit_staff_profiles
  after insert or update or delete on public.staff_profiles
  for each row execute function public.audit_row_change();

-- ── does the caller's family have a teaching relationship with p_teacher? ──
-- True for the teacher themselves, Headteacher/Admin, and a parent/student
-- whose child is enrolled in a class this teacher teaches (class-scoped
-- role, or a current class_subject_teachers mapping).
create or replace function public.teacher_visible_to_me(p_teacher uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() = p_teacher
    or public.current_has_role(array['head_teacher', 'admin'])
    or exists (
      select 1
      from public.enrolments e
      join public.children c on c.id = e.child_id
      where (
          c.parent_user_id = auth.uid()
          or exists (select 1 from public.student_accounts sa where sa.child_id = c.id and sa.profile_id = auth.uid())
        )
        and (
          exists (
            select 1 from public.user_roles ur
            where ur.user_id = p_teacher
              and ur.role in ('teacher', 'teaching_assistant_cover')
              and ur.scope_type = 'class' and ur.scope_id = e.class_id
          )
          or exists (
            select 1 from public.class_subject_teachers cst
            where cst.teacher_id = p_teacher and cst.class_id = e.class_id
              and (cst.valid_to is null or cst.valid_to >= current_date)
              and (cst.valid_from is null or cst.valid_from <= current_date)
          )
        )
    );
$$;

grant execute on function public.teacher_visible_to_me(uuid) to authenticated;

-- ── meet_my_teachers: the safe subset families and students may see ───────
-- Returns name, title, bio, qualifications, subjects, languages, experience,
-- photo path and (only when the teacher opted in) work email, for teachers of
-- the caller's own children's classes. p_class_id narrows to one class the
-- caller is enrolled in / teaches (staff callers get the class's teachers).
-- Never returns any compliance data.
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
  with my_classes as (
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
  )
  select
    p.id,
    p.full_name,
    sp.display_title,
    sp.bio,
    sp.qualifications,
    coalesce(sp.subjects_taught, '{}'::text[]),
    sp.years_experience,
    coalesce(sp.languages, '{}'::text[]),
    sp.photo_path,
    case when coalesce(sp.contact_visible, false) then p.email else null end,
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

-- ── staff-photos bucket (private; signed URLs) ───────────────────────────
-- Objects are namespaced <user_id>/<file>. Readable by the owner,
-- Headteacher/Admin, and families with a teaching relationship to the owner.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-photos', 'staff-photos', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "staff-photos: owner/head_teacher/admin/family read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'staff-photos'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        then public.teacher_visible_to_me(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

create policy "staff-photos: owner/head_teacher/admin upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'staff-photos'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and public.current_has_role(array['teacher', 'teaching_assistant_cover'])
      )
    )
  );

create policy "staff-photos: owner/head_teacher/admin replace"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'staff-photos'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create policy "staff-photos: owner/head_teacher/admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'staff-photos'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );
