-- Behaviour module: merits, demerits, incidents, detentions and badges.
-- Safeguarding concerns are NOT recorded here (see /report-concern and
-- /admin/compliance). Conventions follow 0010/0013: RLS default deny,
-- SECURITY DEFINER helpers for membership checks, audit_row_change().

-- ── behaviour_records ───────────────────────────────────────────────────
create table public.behaviour_records (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  kind text not null check (kind in ('merit', 'demerit', 'incident')),
  points int not null default 0,
  category text not null,
  note text,
  recorded_by uuid not null default auth.uid() references public.profiles(id),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  constraint behaviour_records_points_sign check (
    (kind = 'merit' and points > 0)
    or (kind = 'demerit' and points < 0)
    or (kind = 'incident' and points = 0)
  )
);

alter table public.behaviour_records enable row level security;

create index behaviour_records_child_idx on public.behaviour_records (child_id, occurred_on desc);
create index behaviour_records_class_idx on public.behaviour_records (class_id, occurred_on desc);

create policy "behaviour_records: head_teacher/admin all"
  on public.behaviour_records for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "behaviour_records: teacher reads own children"
  on public.behaviour_records for select
  to authenticated
  using (public.child_taught_by(behaviour_records.child_id, auth.uid()));

create policy "behaviour_records: teacher logs for own children"
  on public.behaviour_records for insert
  to authenticated
  with check (
    public.child_taught_by(behaviour_records.child_id, auth.uid())
    and recorded_by = auth.uid()
  );

create policy "behaviour_records: teacher voids for own children"
  on public.behaviour_records for update
  to authenticated
  using (public.child_taught_by(behaviour_records.child_id, auth.uid()))
  with check (public.child_taught_by(behaviour_records.child_id, auth.uid()));

-- Parents see merits and demerits, never incident notes.
create policy "behaviour_records: parent reads own child's (not incidents)"
  on public.behaviour_records for select
  to authenticated
  using (
    kind <> 'incident'
    and voided_at is null
    and public.child_belongs_to_parent(behaviour_records.child_id)
  );

-- Students see everything about themselves except incidents.
create policy "behaviour_records: student reads own (not incidents)"
  on public.behaviour_records for select
  to authenticated
  using (
    kind <> 'incident'
    and voided_at is null
    and public.child_belongs_to_student(behaviour_records.child_id)
  );

-- Teachers may only void a record (set voided_at); everything else is
-- immutable for them. Head teacher/admin may edit freely.
create or replace function public.behaviour_records_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_has_role(array['head_teacher', 'admin']) then
    return new;
  end if;
  if new.child_id is distinct from old.child_id
     or new.class_id is distinct from old.class_id
     or new.kind is distinct from old.kind
     or new.points is distinct from old.points
     or new.category is distinct from old.category
     or new.note is distinct from old.note
     or new.recorded_by is distinct from old.recorded_by
     or new.occurred_on is distinct from old.occurred_on
     or new.created_at is distinct from old.created_at then
    raise exception 'Only voiding a behaviour record is allowed';
  end if;
  return new;
end;
$$;

create trigger behaviour_records_guard
  before update on public.behaviour_records
  for each row execute function public.behaviour_records_guard();

create trigger audit_behaviour_records
  after insert or update or delete on public.behaviour_records
  for each row execute function public.audit_row_change();

-- ── detentions ──────────────────────────────────────────────────────────
create table public.detentions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  behaviour_record_id uuid references public.behaviour_records(id) on delete set null,
  scheduled_for date not null,
  duration_minutes int not null default 30 check (duration_minutes > 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'served', 'missed', 'cancelled')),
  notes text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.detentions enable row level security;

create index detentions_child_idx on public.detentions (child_id, scheduled_for);
create index detentions_status_idx on public.detentions (status, scheduled_for);

create policy "detentions: head_teacher/admin all"
  on public.detentions for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "detentions: teacher reads own children"
  on public.detentions for select
  to authenticated
  using (public.child_taught_by(detentions.child_id, auth.uid()));

create policy "detentions: teacher issues for own children"
  on public.detentions for insert
  to authenticated
  with check (
    public.child_taught_by(detentions.child_id, auth.uid())
    and created_by = auth.uid()
  );

create policy "detentions: teacher updates status for own children"
  on public.detentions for update
  to authenticated
  using (public.child_taught_by(detentions.child_id, auth.uid()))
  with check (public.child_taught_by(detentions.child_id, auth.uid()));

create policy "detentions: parent reads own child's"
  on public.detentions for select
  to authenticated
  using (public.child_belongs_to_parent(detentions.child_id));

create policy "detentions: student reads own"
  on public.detentions for select
  to authenticated
  using (public.child_belongs_to_student(detentions.child_id));

-- Teachers may only change status/notes on a detention.
create or replace function public.detentions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_has_role(array['head_teacher', 'admin']) then
    return new;
  end if;
  if new.child_id is distinct from old.child_id
     or new.behaviour_record_id is distinct from old.behaviour_record_id
     or new.scheduled_for is distinct from old.scheduled_for
     or new.duration_minutes is distinct from old.duration_minutes
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the status and notes of a detention can be changed';
  end if;
  return new;
end;
$$;

create trigger detentions_guard
  before update on public.detentions
  for each row execute function public.detentions_guard();

create trigger audit_detentions
  after insert or update or delete on public.detentions
  for each row execute function public.audit_row_change();

-- ── behaviour_badges ────────────────────────────────────────────────────
-- Badge types live in the client (src/components/learn/behaviour/constants.ts).
create table public.behaviour_badges (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  badge text not null,
  awarded_on date not null default current_date,
  awarded_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.behaviour_badges enable row level security;

create index behaviour_badges_child_idx on public.behaviour_badges (child_id, awarded_on desc);

create policy "behaviour_badges: head_teacher/admin all"
  on public.behaviour_badges for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "behaviour_badges: teacher reads own children"
  on public.behaviour_badges for select
  to authenticated
  using (public.child_taught_by(behaviour_badges.child_id, auth.uid()));

create policy "behaviour_badges: teacher awards to own children"
  on public.behaviour_badges for insert
  to authenticated
  with check (
    public.child_taught_by(behaviour_badges.child_id, auth.uid())
    and awarded_by = auth.uid()
  );

create policy "behaviour_badges: parent reads own child's"
  on public.behaviour_badges for select
  to authenticated
  using (public.child_belongs_to_parent(behaviour_badges.child_id));

create policy "behaviour_badges: student reads own"
  on public.behaviour_badges for select
  to authenticated
  using (public.child_belongs_to_student(behaviour_badges.child_id));

create trigger audit_behaviour_badges
  after insert or update or delete on public.behaviour_badges
  for each row execute function public.audit_row_change();
