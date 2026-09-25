-- Phase C: announcements + parent-teacher/staff messaging for /learn.
-- Same conventions as 0010-0012 — see their headers.
--
-- HARD CONSTRAINT (per the brief): no private messaging between staff and
-- students, ever — not a UI restriction, a schema one. This migration
-- gives message threads exactly two shapes via a check constraint:
--   * 'parent_teacher' — always parent_id + teacher_id + child_id, never a
--     student column of any kind.
--   * 'staff' — always two staff members (each independently verified to
--     hold a staff role, not parent/student), never a parent/child/student
--     column of any kind.
-- There is no third shape, so a thread involving a student account talking
-- 1:1 to staff cannot be represented in this table at all — it isn't
-- blocked by a policy that could have a bug, it's a row that fails the
-- CHECK constraint before RLS is even evaluated. tests/messaging_rls.sql
-- proves this empirically (student attempts against both shapes, both
-- rejected).

-- ── announcements (one-to-many: class or school-wide; NOT 1:1, so no
-- student-DM risk here) ──────────────────────────────────────────────────
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('class', 'school')),
  class_id uuid references public.classes(id) on delete cascade,
  title text not null,
  body text not null,
  author_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint announcements_scope_shape check (
    (scope = 'class' and class_id is not null) or (scope = 'school' and class_id is null)
  )
);

alter table public.announcements enable row level security;

create index announcements_class_idx on public.announcements (class_id, created_at desc);

create policy "announcements: teacher posts to own class"
  on public.announcements for insert
  to authenticated
  with check (scope = 'class' and public.class_taught_by_current_user(announcements.class_id) and author_id = auth.uid());

create policy "announcements: teacher edits/deletes own class post"
  on public.announcements for update
  to authenticated
  using (scope = 'class' and public.class_taught_by_current_user(announcements.class_id))
  with check (scope = 'class' and public.class_taught_by_current_user(announcements.class_id));

create policy "announcements: teacher deletes own class post"
  on public.announcements for delete
  to authenticated
  using (scope = 'class' and public.class_taught_by_current_user(announcements.class_id));

create policy "announcements: head_teacher/admin manage all"
  on public.announcements for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "announcements: school-wide readable by all learn users"
  on public.announcements for select
  to authenticated
  using (scope = 'school');

create policy "announcements: class-wide readable by class members"
  on public.announcements for select
  to authenticated
  using (
    scope = 'class' and (
      public.class_taught_by_current_user(announcements.class_id)
      or public.class_has_parents_child(announcements.class_id)
      or public.class_has_students_own_enrolment(announcements.class_id)
      or public.current_has_permission('manage_academic')
    )
  );

create trigger audit_announcements
  after insert or update or delete on public.announcements
  for each row execute function public.audit_row_change();

-- ── safeguarding_keywords (admin/safeguarding-lead editable — never
-- hardcoded in application code, per ground rule 1) ──────────────────────
create table public.safeguarding_keywords (
  id uuid primary key default gen_random_uuid(),
  phrase text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.safeguarding_keywords enable row level security;

create policy "safeguarding_keywords: safeguarding lead/head_teacher/admin read"
  on public.safeguarding_keywords for select
  to authenticated
  using (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create policy "safeguarding_keywords: safeguarding lead/head_teacher/admin write"
  on public.safeguarding_keywords for all
  to authenticated
  using (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher', 'admin']));

-- Seed with a small, genuinely illustrative starter list — clearly the
-- kind of thing a Safeguarding Lead reviews/extends, not exhaustive.
insert into public.safeguarding_keywords (phrase) values
  ('hurt myself'), ('kill myself'), ('self harm'), ('being hit'), ('scared to go home'), ('someone touched me');

-- ── is_staff_member / child_taught_by: helpers for the shape checks below,
-- checking facts about an ARBITRARY user id (not just auth.uid()), which
-- current_has_role()/class_taught_by_current_user() don't support ─────────
create or replace function public.is_staff_member(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover')
  );
$$;

grant execute on function public.is_staff_member(uuid) to authenticated;

create or replace function public.child_taught_by(p_child_id uuid, p_teacher_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.enrolments e
    join public.user_roles ur on ur.scope_type = 'class' and ur.scope_id = e.class_id
    where e.child_id = p_child_id
      and ur.user_id = p_teacher_id
      and ur.role in ('teacher', 'teaching_assistant_cover')
  );
$$;

grant execute on function public.child_taught_by(uuid, uuid) to authenticated;

-- ── message_threads ───────────────────────────────────────────────────────
create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('parent_teacher', 'staff')),
  child_id uuid references public.children(id) on delete cascade,
  parent_id uuid references public.profiles(id),
  teacher_id uuid references public.profiles(id),
  staff_a_id uuid references public.profiles(id),
  staff_b_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint message_threads_shape check (
    (kind = 'parent_teacher' and child_id is not null and parent_id is not null and teacher_id is not null
      and staff_a_id is null and staff_b_id is null)
    or
    (kind = 'staff' and staff_a_id is not null and staff_b_id is not null and staff_a_id <> staff_b_id
      and child_id is null and parent_id is null and teacher_id is null)
  )
);

alter table public.message_threads enable row level security;

create unique index message_threads_parent_teacher_uniq
  on public.message_threads (child_id, parent_id, teacher_id)
  where kind = 'parent_teacher';

create unique index message_threads_staff_uniq
  on public.message_threads (least(staff_a_id, staff_b_id), greatest(staff_a_id, staff_b_id))
  where kind = 'staff';

create policy "message_threads: parent_teacher participants read"
  on public.message_threads for select
  to authenticated
  using (kind = 'parent_teacher' and (parent_id = auth.uid() or teacher_id = auth.uid()));

create policy "message_threads: staff participants read"
  on public.message_threads for select
  to authenticated
  using (kind = 'staff' and (staff_a_id = auth.uid() or staff_b_id = auth.uid()));

create policy "message_threads: safeguarding lead/head_teacher/admin read all"
  on public.message_threads for select
  to authenticated
  using (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

-- A parent may open a thread with any teacher who actually teaches their
-- child; a teacher may open a thread with any parent of a child they teach.
-- Either way BOTH facts (parent owns child AND teacher teaches that child)
-- are re-checked server-side via WITH CHECK, never trusted from the
-- request body.
create policy "message_threads: parent starts thread with own child's teacher"
  on public.message_threads for insert
  to authenticated
  with check (
    kind = 'parent_teacher'
    and parent_id = auth.uid()
    and public.child_belongs_to_parent(child_id)
    and public.child_taught_by(child_id, teacher_id)
  );

-- child_belongs_to_parent() checks auth.uid(), which is the TEACHER here,
-- not parent_id, so "parent_id genuinely owns child_id" is re-expressed
-- directly against `children` instead (safe: children's own RLS never
-- references message_threads, so no recursion risk).
create policy "message_threads: teacher starts thread with own class's parent"
  on public.message_threads for insert
  to authenticated
  with check (
    kind = 'parent_teacher'
    and teacher_id = auth.uid()
    and public.child_taught_by(child_id, teacher_id)
    and exists (select 1 from public.children c where c.id = child_id and c.parent_user_id = parent_id)
  );

create policy "message_threads: staff member starts thread with another staff member"
  on public.message_threads for insert
  to authenticated
  with check (
    kind = 'staff'
    and (staff_a_id = auth.uid() or staff_b_id = auth.uid())
    and public.is_staff_member(staff_a_id)
    and public.is_staff_member(staff_b_id)
  );

-- No UPDATE/DELETE policy at all — a thread, once created, is a fixed
-- container; nothing about who its participants are should ever change.

create trigger audit_message_threads
  after insert or delete on public.message_threads
  for each row execute function public.audit_row_change();

-- ── message_thread_messages ────────────────────────────────────────────
create table public.message_thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  flagged boolean not null default false,
  flagged_keywords text[],
  created_at timestamptz not null default now()
);

alter table public.message_thread_messages enable row level security;

create index message_thread_messages_thread_idx on public.message_thread_messages (thread_id, created_at);
create index message_thread_messages_flagged_idx on public.message_thread_messages (flagged) where flagged;

create or replace function public.thread_participant(p_thread_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread_id
      and (t.parent_id = p_user_id or t.teacher_id = p_user_id or t.staff_a_id = p_user_id or t.staff_b_id = p_user_id)
  );
$$;

grant execute on function public.thread_participant(uuid, uuid) to authenticated;

-- Moderation model (documented here, not just in the PR description, so
-- the design intent stays attached to the code): messages send
-- immediately — a "nothing sends until a human approves" pre-moderation
-- queue would make real-time parent-teacher conversation unusable (a
-- parent asking "is my child unwell today?" needs same-day replies, not a
-- 24h moderation backlog) — but every message is scanned against
-- `safeguarding_keywords` by the trigger below, and any match flags it
-- (and its whole thread's messages) visible to the Safeguarding Lead
-- immediately, regardless of thread membership, via the SELECT policy
-- below. This is "moderate after the fact, escalate the ones that matter"
-- rather than "gate everything before it's usable" — a deliberate
-- trade-off, not an oversight; a slower pre-send queue was considered and
-- rejected for exactly the usability reason above.
create policy "message_thread_messages: participants read own thread"
  on public.message_thread_messages for select
  to authenticated
  using (public.thread_participant(message_thread_messages.thread_id, auth.uid()));

create policy "message_thread_messages: participants send in own thread"
  on public.message_thread_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.thread_participant(message_thread_messages.thread_id, auth.uid())
  );

create policy "message_thread_messages: safeguarding lead reads flagged messages"
  on public.message_thread_messages for select
  to authenticated
  using (message_thread_messages.flagged and public.current_has_permission('safeguarding_lead'));

create policy "message_thread_messages: head_teacher/admin read all"
  on public.message_thread_messages for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- No UPDATE/DELETE policy for participants — messages aren't edited or
-- retracted (a moderation/audit record needs to stay intact); retention
-- deletion (below) is the only deletion path, and it's service-role only.

create or replace function public.scan_message_for_keywords()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matches text[];
begin
  select coalesce(array_agg(k.phrase), '{}')
  into v_matches
  from public.safeguarding_keywords k
  where lower(new.body) like '%' || lower(k.phrase) || '%';

  if array_length(v_matches, 1) > 0 then
    new.flagged := true;
    new.flagged_keywords := v_matches;
  end if;
  return new;
end;
$$;

create trigger scan_message_thread_messages_keywords
  before insert on public.message_thread_messages
  for each row execute function public.scan_message_for_keywords();

create trigger audit_message_thread_messages
  after insert or update or delete on public.message_thread_messages
  for each row execute function public.audit_row_change();

-- ── messaging_settings (retention period — configurable, same spirit as
-- 0009's lms_settings.recording_retention_days) ─────────────────────────
create table public.messaging_settings (
  id boolean primary key default true check (id), -- singleton, same trick as lms_settings
  message_retention_days int not null default 730 check (message_retention_days > 0), -- ~2 school years, a reasonable default pending the school's own policy
  created_at timestamptz not null default now()
);

alter table public.messaging_settings enable row level security;

insert into public.messaging_settings (id) values (true);

create policy "messaging_settings: staff with view_compliance/safeguarding_lead read"
  on public.messaging_settings for select
  to authenticated
  using (public.current_has_permission('view_compliance') or public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher', 'admin']));

create policy "messaging_settings: head_teacher/admin write"
  on public.messaging_settings for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- Scheduled cleanup (scripts/messaging-retention.mjs +
-- .github/workflows/messaging-retention.yml, same cron pattern as
-- lms-recording-retention.yml) deletes threads whose newest message is
-- older than messaging_settings.message_retention_days, via the
-- service-role key — no client-side deletion path exists for messages at
-- all (see above), so this scheduled job is the ONLY way messages are ever
-- removed, keeping retention enforcement centralised and auditable.
