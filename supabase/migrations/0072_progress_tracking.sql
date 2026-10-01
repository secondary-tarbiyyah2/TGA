-- Progress tracking: Qur'an/Hifz scores + targets, GCSE predicted vs actual
-- grades, and parent-evening booking.
--
-- A. Qur'an & Hifz
--    * quran_progress (0011) gains a first-class 0-10 teacher score per
--      session (recitation / tajweed / memorisation quality), the pages
--      covered and the session date. Write access is UNCHANGED: still the
--      assessment_lead gate from 0011, so this migration widens nothing.
--    * quran_targets: "by <date>, reach N pages / juz / surahs". Progress
--      against a target and the milestones are computed from the entries by
--      the app (src/lib/learn/quran.ts), so they can never drift.
-- B. GCSE (Years 10-11): gcse_grades holds target, predicted and actual
--    grade (1-9) per child and subject. The on-track/behind indicator is
--    computed in the app from those numbers.
-- C. Parent evenings: an admin creates an evening (window + slot length) and
--    picks teachers. Parents book through SECURITY DEFINER RPCs only. The
--    no-double-booking guarantee is three partial UNIQUE indexes, so two
--    parents racing for one slot cannot both win: the loser gets 'slot_taken'.
--
-- audit_row_change() needs NEW.id, so every table has a surrogate id.
-- Idempotent: safe to run more than once.

-- ── shared helpers ────────────────────────────────────────────────────────

create or replace function public.progress_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Is the child enrolled in the class?
create or replace function public.child_enrolled_in_class(p_child_id uuid, p_class_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.enrolments e where e.child_id = p_child_id and e.class_id = p_class_id);
$$;

grant execute on function public.child_enrolled_in_class(uuid, uuid) to authenticated;

-- The names of the classes through which p_teacher teaches p_child (class
-- scoped teacher role, or a current class_subject_teachers mapping). Empty
-- array = no teaching relationship. Internal helper: not callable by clients.
create or replace function public.teacher_child_class_names(p_teacher_id uuid, p_child_id uuid)
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct cl.name order by cl.name), '{}'::text[])
  from public.enrolments e
  join public.classes cl on cl.id = e.class_id
  where e.child_id = p_child_id
    and (
      exists (
        select 1 from public.user_roles ur
        where ur.user_id = p_teacher_id
          and ur.role in ('teacher', 'teaching_assistant_cover')
          and ur.scope_type = 'class' and ur.scope_id = e.class_id
      )
      or exists (
        select 1 from public.class_subject_teachers cst
        where cst.teacher_id = p_teacher_id and cst.class_id = e.class_id
          and (cst.valid_to is null or cst.valid_to >= current_date)
          and (cst.valid_from is null or cst.valid_from <= current_date)
      )
    );
$$;

revoke all on function public.teacher_child_class_names(uuid, uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- A. Qur'an & Hifz
-- ═══════════════════════════════════════════════════════════════════════

alter table public.quran_progress
  add column if not exists score smallint check (score is null or (score >= 0 and score <= 10)),
  add column if not exists pages smallint check (pages is null or (pages >= 0 and pages <= 604)),
  add column if not exists session_date date;

update public.quran_progress set session_date = recorded_at::date where session_date is null;
alter table public.quran_progress alter column session_date set default current_date;
alter table public.quran_progress alter column session_date set not null;

create index if not exists quran_progress_child_session_idx on public.quran_progress (child_id, session_date desc);

create table if not exists public.quran_targets (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  target_kind text not null check (target_kind in ('pages', 'juz', 'surah')),
  target_amount int not null check (target_amount >= 1),
  start_date date not null default current_date,
  due_date date not null,
  note text check (note is null or char_length(note) <= 500),
  set_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quran_targets_dates check (due_date >= start_date),
  constraint quran_targets_amount check (
    (target_kind = 'pages' and target_amount <= 604)
    or (target_kind = 'juz' and target_amount <= 30)
    or (target_kind = 'surah' and target_amount <= 114)
  )
);

create index if not exists quran_targets_child_idx on public.quran_targets (child_id, due_date);

alter table public.quran_targets enable row level security;

drop policy if exists "quran_targets: assessment lead or head/admin manage" on public.quran_targets;
create policy "quran_targets: assessment lead or head/admin manage"
  on public.quran_targets for all
  to authenticated
  using (public.current_has_permission('assessment_lead') or public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_permission('assessment_lead') or public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "quran_targets: manage_academic staff read all" on public.quran_targets;
create policy "quran_targets: manage_academic staff read all"
  on public.quran_targets for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

drop policy if exists "quran_targets: teacher of class reads own class's" on public.quran_targets;
create policy "quran_targets: teacher of class reads own class's"
  on public.quran_targets for select
  to authenticated
  using (quran_targets.class_id is not null and public.class_taught_by_current_user(quran_targets.class_id));

drop policy if exists "quran_targets: parent reads own child's" on public.quran_targets;
create policy "quran_targets: parent reads own child's"
  on public.quran_targets for select
  to authenticated
  using (public.child_belongs_to_parent(quran_targets.child_id));

drop policy if exists "quran_targets: student reads own" on public.quran_targets;
create policy "quran_targets: student reads own"
  on public.quran_targets for select
  to authenticated
  using (public.child_belongs_to_student(quran_targets.child_id));

drop trigger if exists quran_targets_touch on public.quran_targets;
create trigger quran_targets_touch
  before update on public.quran_targets
  for each row execute function public.progress_touch_updated_at();

drop trigger if exists audit_quran_targets on public.quran_targets;
create trigger audit_quran_targets
  after insert or update or delete on public.quran_targets
  for each row execute function public.audit_row_change();

-- ═══════════════════════════════════════════════════════════════════════
-- B. GCSE predicted vs actual grades (1-9)
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.gcse_grades (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  target_grade smallint check (target_grade is null or (target_grade >= 1 and target_grade <= 9)),
  predicted_grade smallint check (predicted_grade is null or (predicted_grade >= 1 and predicted_grade <= 9)),
  actual_grade smallint check (actual_grade is null or (actual_grade >= 1 and actual_grade <= 9)),
  actual_assessment_id uuid references public.assessments(id) on delete set null,
  comment text check (comment is null or char_length(comment) <= 500),
  entered_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id, subject_id)
);

create index if not exists gcse_grades_class_idx on public.gcse_grades (class_id);

alter table public.gcse_grades enable row level security;

drop policy if exists "gcse_grades: teacher of class manages" on public.gcse_grades;
create policy "gcse_grades: teacher of class manages"
  on public.gcse_grades for all
  to authenticated
  using (gcse_grades.class_id is not null and public.class_taught_by_current_user(gcse_grades.class_id))
  with check (
    gcse_grades.class_id is not null
    and public.class_taught_by_current_user(gcse_grades.class_id)
    and public.child_enrolled_in_class(gcse_grades.child_id, gcse_grades.class_id)
  );

drop policy if exists "gcse_grades: head/admin and academic staff manage all" on public.gcse_grades;
create policy "gcse_grades: head/admin and academic staff manage all"
  on public.gcse_grades for all
  to authenticated
  using (
    public.current_has_role(array['head_teacher', 'admin'])
    or public.current_has_permission('manage_academic')
    or public.current_has_permission('assessment_lead')
  )
  with check (
    public.current_has_role(array['head_teacher', 'admin'])
    or public.current_has_permission('manage_academic')
    or public.current_has_permission('assessment_lead')
  );

drop policy if exists "gcse_grades: parent reads own child's" on public.gcse_grades;
create policy "gcse_grades: parent reads own child's"
  on public.gcse_grades for select
  to authenticated
  using (public.child_belongs_to_parent(gcse_grades.child_id));

drop policy if exists "gcse_grades: student reads own" on public.gcse_grades;
create policy "gcse_grades: student reads own"
  on public.gcse_grades for select
  to authenticated
  using (public.child_belongs_to_student(gcse_grades.child_id));

drop trigger if exists gcse_grades_touch on public.gcse_grades;
create trigger gcse_grades_touch
  before update on public.gcse_grades
  for each row execute function public.progress_touch_updated_at();

drop trigger if exists audit_gcse_grades on public.gcse_grades;
create trigger audit_gcse_grades
  after insert or update or delete on public.gcse_grades
  for each row execute function public.audit_row_change();

-- ═══════════════════════════════════════════════════════════════════════
-- C. Parent evenings
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.parent_evenings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  slot_minutes int not null check (slot_minutes between 5 and 60),
  location text check (location is null or char_length(location) <= 200),
  join_url text check (join_url is null or join_url ~* '^https://[^[:space:]]+$'),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_evenings_window check (ends_at - starts_at >= slot_minutes * interval '1 minute')
);

-- Teachers taking part, each with their own optional meeting link.
create table if not exists public.parent_evening_teachers (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null references public.parent_evenings(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  join_url text check (join_url is null or join_url ~* '^https://[^[:space:]]+$'),
  created_at timestamptz not null default now(),
  unique (evening_id, teacher_id)
);

create table if not exists public.parent_evening_bookings (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null references public.parent_evenings(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references public.profiles(id) on delete cascade,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  constraint parent_evening_bookings_slot_order check (slot_end > slot_start)
);

-- The race-safety. Only 'booked' rows are constrained, so a cancelled slot
-- is free again and a rebook is just a new row.
--   * a teacher can't have two meetings in one slot
create unique index if not exists parent_evening_bookings_teacher_slot
  on public.parent_evening_bookings (evening_id, teacher_id, slot_start) where status = 'booked';
--   * a parent can't be in two meetings at the same time
create unique index if not exists parent_evening_bookings_parent_slot
  on public.parent_evening_bookings (evening_id, parent_user_id, slot_start) where status = 'booked';
--   * one meeting per child per teacher
create unique index if not exists parent_evening_bookings_child_teacher
  on public.parent_evening_bookings (evening_id, child_id, teacher_id) where status = 'booked';

create index if not exists parent_evening_bookings_parent_idx on public.parent_evening_bookings (parent_user_id, slot_start);
create index if not exists parent_evening_bookings_teacher_idx on public.parent_evening_bookings (teacher_id, slot_start);

alter table public.parent_evenings enable row level security;
alter table public.parent_evening_teachers enable row level security;
alter table public.parent_evening_bookings enable row level security;

-- Changing the window or slot length once people have booked would strand
-- their bookings off the slot grid.
create or replace function public.parent_evenings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if (new.starts_at is distinct from old.starts_at
        or new.ends_at is distinct from old.ends_at
        or new.slot_minutes is distinct from old.slot_minutes)
       and exists (select 1 from public.parent_evening_bookings b where b.evening_id = old.id and b.status = 'booked') then
      raise exception 'evening_has_bookings';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists parent_evenings_guard on public.parent_evenings;
create trigger parent_evenings_guard
  before insert or update on public.parent_evenings
  for each row execute function public.parent_evenings_guard();

-- parent_evenings: head/admin manage; everyone signed in reads open/closed
-- evenings (title and times are not sensitive); drafts stay with admin.
drop policy if exists "parent_evenings: head_teacher/admin manage" on public.parent_evenings;
create policy "parent_evenings: head_teacher/admin manage"
  on public.parent_evenings for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "parent_evenings: authenticated read published" on public.parent_evenings;
create policy "parent_evenings: authenticated read published"
  on public.parent_evenings for select
  to authenticated
  using (parent_evenings.status in ('open', 'closed'));

-- parent_evening_teachers: head/admin manage; a teacher reads their own row.
-- Parents never read this table (it holds meeting links): they use the RPCs.
drop policy if exists "parent_evening_teachers: head_teacher/admin manage" on public.parent_evening_teachers;
create policy "parent_evening_teachers: head_teacher/admin manage"
  on public.parent_evening_teachers for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "parent_evening_teachers: teacher reads own" on public.parent_evening_teachers;
create policy "parent_evening_teachers: teacher reads own"
  on public.parent_evening_teachers for select
  to authenticated
  using (parent_evening_teachers.teacher_id = auth.uid());

-- parent_evening_bookings: read-only to clients. All writes go through the
-- RPCs below (there is deliberately no insert/update/delete policy).
drop policy if exists "parent_evening_bookings: head_teacher/admin read" on public.parent_evening_bookings;
create policy "parent_evening_bookings: head_teacher/admin read"
  on public.parent_evening_bookings for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "parent_evening_bookings: parent reads own" on public.parent_evening_bookings;
create policy "parent_evening_bookings: parent reads own"
  on public.parent_evening_bookings for select
  to authenticated
  using (parent_evening_bookings.parent_user_id = auth.uid());

drop policy if exists "parent_evening_bookings: teacher reads own" on public.parent_evening_bookings;
create policy "parent_evening_bookings: teacher reads own"
  on public.parent_evening_bookings for select
  to authenticated
  using (parent_evening_bookings.teacher_id = auth.uid());

drop trigger if exists audit_parent_evenings on public.parent_evenings;
create trigger audit_parent_evenings
  after insert or update or delete on public.parent_evenings
  for each row execute function public.audit_row_change();

drop trigger if exists audit_parent_evening_teachers on public.parent_evening_teachers;
create trigger audit_parent_evening_teachers
  after insert or update or delete on public.parent_evening_teachers
  for each row execute function public.audit_row_change();

drop trigger if exists audit_parent_evening_bookings on public.parent_evening_bookings;
create trigger audit_parent_evening_bookings
  after insert or update or delete on public.parent_evening_bookings
  for each row execute function public.audit_row_change();

-- ── book a slot ──────────────────────────────────────────────────────────
-- Errors (message text is the contract with the UI):
--   not_authenticated / forbidden (42501), evening_not_open,
--   teacher_not_in_evening, teacher_does_not_teach_child, invalid_slot,
--   slot_in_past, slot_taken, parent_clash, already_booked_with_teacher.
create or replace function public.book_parent_evening_slot(
  p_evening_id uuid,
  p_teacher_id uuid,
  p_child_id uuid,
  p_slot_start timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ev public.parent_evenings%rowtype;
  v_len interval;
  v_id uuid;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.child_belongs_to_parent(p_child_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_ev from public.parent_evenings where id = p_evening_id;
  if not found or v_ev.status <> 'open' then
    raise exception 'evening_not_open';
  end if;
  if not exists (select 1 from public.parent_evening_teachers t where t.evening_id = p_evening_id and t.teacher_id = p_teacher_id) then
    raise exception 'teacher_not_in_evening';
  end if;
  if cardinality(public.teacher_child_class_names(p_teacher_id, p_child_id)) = 0 then
    raise exception 'teacher_does_not_teach_child';
  end if;

  v_len := v_ev.slot_minutes * interval '1 minute';
  if p_slot_start is null
     or p_slot_start < v_ev.starts_at
     or p_slot_start + v_len > v_ev.ends_at
     or (extract(epoch from (p_slot_start - v_ev.starts_at))::bigint % (v_ev.slot_minutes * 60)) <> 0 then
    raise exception 'invalid_slot';
  end if;
  if p_slot_start <= now() then
    raise exception 'slot_in_past';
  end if;

  begin
    insert into public.parent_evening_bookings (evening_id, teacher_id, child_id, parent_user_id, slot_start, slot_end)
    values (p_evening_id, p_teacher_id, p_child_id, v_uid, p_slot_start, p_slot_start + v_len)
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'parent_evening_bookings_teacher_slot' then
      raise exception 'slot_taken';
    elsif v_constraint = 'parent_evening_bookings_parent_slot' then
      raise exception 'parent_clash';
    else
      raise exception 'already_booked_with_teacher';
    end if;
  end;

  return v_id;
end;
$$;

-- ── cancel ───────────────────────────────────────────────────────────────
-- The booking's parent, its teacher, or head/admin.
create or replace function public.cancel_parent_evening_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.parent_evening_bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_b from public.parent_evening_bookings where id = p_booking_id and status = 'booked' for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if not (v_b.parent_user_id = v_uid or v_b.teacher_id = v_uid or public.current_has_role(array['head_teacher', 'admin'])) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.parent_evening_bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
   where id = p_booking_id;
end;
$$;

-- ── rebook: move a booking to another slot, all or nothing ───────────────
-- If the new slot is taken the whole call fails and the old booking stays.
create or replace function public.rebook_parent_evening_slot(p_booking_id uuid, p_new_slot_start timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.parent_evening_bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_b from public.parent_evening_bookings
   where id = p_booking_id and status = 'booked' and parent_user_id = v_uid for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  update public.parent_evening_bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
   where id = p_booking_id;
  return public.book_parent_evening_slot(v_b.evening_id, v_b.teacher_id, v_b.child_id, p_new_slot_start);
end;
$$;

-- ── which slots are already taken (no names) ─────────────────────────────
create or replace function public.parent_evening_taken_slots(p_evening_id uuid, p_teacher_id uuid)
returns table (slot_start timestamptz, mine boolean)
language sql
security definer
stable
set search_path = public
as $$
  select b.slot_start, (b.parent_user_id = auth.uid())
  from public.parent_evening_bookings b
  join public.parent_evenings e on e.id = b.evening_id
  where auth.uid() is not null
    and b.evening_id = p_evening_id
    and b.teacher_id = p_teacher_id
    and b.status = 'booked'
    and e.status in ('open', 'closed');
$$;

-- ── what the signed-in parent can book ──────────────────────────────────
-- One row per (open evening, child, teacher who teaches that child).
create or replace function public.parent_evening_options()
returns table (
  evening_id uuid,
  child_id uuid,
  child_name text,
  teacher_id uuid,
  teacher_name text,
  class_names text[]
)
language sql
security definer
stable
set search_path = public
as $$
  select e.id, c.id, c.name, p.id, p.full_name, public.teacher_child_class_names(pet.teacher_id, c.id)
  from public.parent_evenings e
  join public.parent_evening_teachers pet on pet.evening_id = e.id
  join public.profiles p on p.id = pet.teacher_id
  join public.children c on c.parent_user_id = auth.uid()
  where e.status = 'open'
    and cardinality(public.teacher_child_class_names(pet.teacher_id, c.id)) > 0
  order by e.starts_at, c.name, p.full_name;
$$;

-- ── the signed-in parent's own bookings, with the meeting link ───────────
create or replace function public.my_parent_evening_bookings()
returns table (
  booking_id uuid,
  evening_id uuid,
  evening_title text,
  location text,
  child_id uuid,
  child_name text,
  teacher_id uuid,
  teacher_name text,
  slot_start timestamptz,
  slot_end timestamptz,
  join_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select b.id, e.id, e.title, e.location, c.id, c.name, p.id, p.full_name, b.slot_start, b.slot_end,
         coalesce(nullif(pet.join_url, ''), e.join_url)
  from public.parent_evening_bookings b
  join public.parent_evenings e on e.id = b.evening_id
  join public.children c on c.id = b.child_id
  join public.profiles p on p.id = b.teacher_id
  left join public.parent_evening_teachers pet on pet.evening_id = b.evening_id and pet.teacher_id = b.teacher_id
  where b.parent_user_id = auth.uid() and b.status = 'booked'
  order by b.slot_start;
$$;

-- ── a teacher's schedule for one evening ─────────────────────────────────
create or replace function public.my_parent_evening_schedule(p_evening_id uuid)
returns table (
  booking_id uuid,
  child_name text,
  parent_name text,
  slot_start timestamptz,
  slot_end timestamptz,
  join_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select b.id, c.name, pp.full_name, b.slot_start, b.slot_end, coalesce(nullif(pet.join_url, ''), e.join_url)
  from public.parent_evening_bookings b
  join public.parent_evenings e on e.id = b.evening_id
  join public.children c on c.id = b.child_id
  join public.profiles pp on pp.id = b.parent_user_id
  left join public.parent_evening_teachers pet on pet.evening_id = b.evening_id and pet.teacher_id = b.teacher_id
  where b.teacher_id = auth.uid() and b.evening_id = p_evening_id and b.status = 'booked'
  order by b.slot_start;
$$;

-- ── every booking of one evening, for head/admin ─────────────────────────
create or replace function public.parent_evening_admin_bookings(p_evening_id uuid)
returns table (
  booking_id uuid,
  teacher_id uuid,
  teacher_name text,
  child_name text,
  parent_name text,
  slot_start timestamptz,
  slot_end timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select b.id, b.teacher_id, tp.full_name, c.name, pp.full_name, b.slot_start, b.slot_end
    from public.parent_evening_bookings b
    join public.profiles tp on tp.id = b.teacher_id
    join public.profiles pp on pp.id = b.parent_user_id
    join public.children c on c.id = b.child_id
    where b.evening_id = p_evening_id and b.status = 'booked'
    order by tp.full_name, b.slot_start;
end;
$$;

-- ── a teacher sets their own meeting link for an evening ─────────────────
create or replace function public.set_parent_evening_join_url(p_evening_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_url is not null and v_url !~* '^https://[^[:space:]]+$' then
    raise exception 'invalid_url';
  end if;
  update public.parent_evening_teachers
     set join_url = v_url
   where evening_id = p_evening_id and teacher_id = auth.uid();
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'book_parent_evening_slot(uuid, uuid, uuid, timestamptz)',
    'cancel_parent_evening_booking(uuid)',
    'rebook_parent_evening_slot(uuid, timestamptz)',
    'parent_evening_taken_slots(uuid, uuid)',
    'parent_evening_options()',
    'my_parent_evening_bookings()',
    'my_parent_evening_schedule(uuid)',
    'parent_evening_admin_bookings(uuid)',
    'set_parent_evening_join_url(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
