-- Live-lesson joins, no-show alerts and teacher cover.
--
--  * lesson_joins: one row each time a child (or a parent joining for their
--    child) or a teacher presses "Join lesson". It is a JOIN LOG only: there
--    is deliberately no recording of children anywhere in this feature. The
--    class register uses it to PRE-FILL 'present'; the teacher can override.
--  * noshow_alerts: the idempotency record for the scheduled noshow-alerts
--    edge function (one row per lesson + child, so a lesson is never alerted
--    twice). Written with the service role only.
--  * teacher_absences: when a member of staff is away (dates + reason). It
--    drives the "Suggest cover" panel on the admin Absences page. (The
--    existing absences tables record CHILDREN's absence, not staff.)
--  * cover_assignments.families_notified_at: set once the cover-notify edge
--    function has emailed the class's families about a cover teacher.
--
-- Idempotent. RLS conventions follow 0066/0067. audit_row_change() reads
-- NEW/OLD.id unconditionally, so the bigint-keyed tables keep a surrogate id.

-- ── helper: do I teach this lesson (class role, or cover/effective teacher)? ─
create or replace function public.i_teach_lesson(p_instance_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.class_taught_by_current_user(public.lesson_instance_class_id(p_instance_id))
    or exists (
      select 1 from public.lesson_instances li
      where li.id = p_instance_id and li.teacher_user_id = auth.uid()
    );
$$;

revoke all on function public.i_teach_lesson(uuid) from public;
grant execute on function public.i_teach_lesson(uuid) to authenticated;

-- ── lesson_joins ────────────────────────────────────────────────────────
create table if not exists public.lesson_joins (
  id bigint generated always as identity primary key,
  lesson_instance_id uuid not null references public.lesson_instances(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, -- who pressed the button (child, parent or teacher)
  child_id uuid references public.children(id) on delete cascade,        -- set when the join is for a child
  role text not null check (role in ('child', 'teacher')),
  joined_at timestamptz not null default now(),
  check ((role = 'child' and child_id is not null) or (role = 'teacher' and child_id is null))
);

create index if not exists lesson_joins_lesson_idx on public.lesson_joins (lesson_instance_id);
create index if not exists lesson_joins_child_idx on public.lesson_joins (child_id, joined_at);

alter table public.lesson_joins enable row level security;

-- A child, their parent or their teacher records their own join; the
-- lesson must belong to a class the child is enrolled in.
drop policy if exists "lesson_joins: record own join" on public.lesson_joins;
create policy "lesson_joins: record own join"
  on public.lesson_joins for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (
        role = 'teacher'
        and child_id is null
        and (public.i_teach_lesson(lesson_instance_id) or public.current_has_role(array['head_teacher', 'admin']))
      )
      or (
        role = 'child'
        and child_id is not null
        and (public.child_belongs_to_parent(child_id) or public.child_belongs_to_student(child_id))
        and exists (
          select 1 from public.enrolments e
          where e.child_id = lesson_joins.child_id
            and e.class_id = public.lesson_instance_class_id(lesson_joins.lesson_instance_id)
        )
      )
    )
  );

drop policy if exists "lesson_joins: reads own" on public.lesson_joins;
create policy "lesson_joins: reads own"
  on public.lesson_joins for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "lesson_joins: teacher reads own lesson's" on public.lesson_joins;
create policy "lesson_joins: teacher reads own lesson's"
  on public.lesson_joins for select to authenticated
  using (public.i_teach_lesson(lesson_instance_id));

drop policy if exists "lesson_joins: parent reads own child's" on public.lesson_joins;
create policy "lesson_joins: parent reads own child's"
  on public.lesson_joins for select to authenticated
  using (child_id is not null and public.child_belongs_to_parent(child_id));

drop policy if exists "lesson_joins: student reads own" on public.lesson_joins;
create policy "lesson_joins: student reads own"
  on public.lesson_joins for select to authenticated
  using (child_id is not null and public.child_belongs_to_student(child_id));

drop policy if exists "lesson_joins: head/admin and manage_academic read" on public.lesson_joins;
create policy "lesson_joins: head/admin and manage_academic read"
  on public.lesson_joins for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']) or public.current_has_permission('manage_academic'));

-- No update/delete policy: the log is append-only from the client.

-- The join time is the server's, never the client's.
create or replace function public.lesson_joins_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.joined_at := now();
  return new;
end;
$$;

drop trigger if exists lesson_joins_guard on public.lesson_joins;
create trigger lesson_joins_guard
  before insert on public.lesson_joins
  for each row execute function public.lesson_joins_guard();

drop trigger if exists audit_lesson_joins on public.lesson_joins;
create trigger audit_lesson_joins
  after insert on public.lesson_joins
  for each row execute function public.audit_row_change();

-- ── noshow_alerts ───────────────────────────────────────────────────────
create table if not exists public.noshow_alerts (
  id bigint generated always as identity primary key,
  lesson_instance_id uuid not null references public.lesson_instances(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  alerted_at timestamptz not null default now(),
  parent_emailed boolean not null default false,
  detail text,
  unique (lesson_instance_id, child_id)
);

create index if not exists noshow_alerts_child_idx on public.noshow_alerts (child_id, alerted_at);

alter table public.noshow_alerts enable row level security;

-- Written by the noshow-alerts edge function (service role, bypasses RLS).
-- Read-only for the people who act on it.
drop policy if exists "noshow_alerts: head/admin and safeguarding lead read" on public.noshow_alerts;
create policy "noshow_alerts: head/admin and safeguarding lead read"
  on public.noshow_alerts for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']) or public.current_has_permission('safeguarding_lead'));

-- ── teacher_absences ────────────────────────────────────────────────────
create table if not exists public.teacher_absences (
  id uuid primary key default gen_random_uuid(),
  teacher_user_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists teacher_absences_dates_idx on public.teacher_absences (starts_on, ends_on);

alter table public.teacher_absences enable row level security;

drop policy if exists "teacher_absences: head/admin all" on public.teacher_absences;
create policy "teacher_absences: head/admin all"
  on public.teacher_absences for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "teacher_absences: manage_academic all" on public.teacher_absences;
create policy "teacher_absences: manage_academic all"
  on public.teacher_absences for all to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

drop policy if exists "teacher_absences: teacher reads own" on public.teacher_absences;
create policy "teacher_absences: teacher reads own"
  on public.teacher_absences for select to authenticated
  using (teacher_user_id = auth.uid());

drop trigger if exists audit_teacher_absences on public.teacher_absences;
create trigger audit_teacher_absences
  after insert or update or delete on public.teacher_absences
  for each row execute function public.audit_row_change();

-- ── cover_assignments: families told? ────────────────────────────────────
alter table public.cover_assignments
  add column if not exists families_notified_at timestamptz;
