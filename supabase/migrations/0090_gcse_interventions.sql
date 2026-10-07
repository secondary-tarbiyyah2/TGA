-- GCSE interventions (extends 0072 gcse_grades / 0089 gcse_grade_history).
--
-- A flag raised against one pupil in one subject when their GCSE progress
-- needs action: why, an owner (the member of staff responsible), the next
-- step with an optional due date, and running notes. Status moves
-- open -> in_progress -> resolved.
--
-- These are STAFF working notes: only the class's teacher, head/admin and
-- academic staff can read or write them. Parents and pupils see the grades
-- (gcse_grades), never the internal flags.
-- audit_row_change() needs NEW.id, so the table has a surrogate id.
-- Idempotent: safe to run more than once.

create table if not exists public.gcse_interventions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  note text check (note is null or char_length(note) <= 2000),
  owner_id uuid references public.profiles(id) on delete set null,
  owner_name text check (owner_name is null or char_length(owner_name) <= 120),
  next_step text check (next_step is null or char_length(next_step) <= 300),
  next_step_due date,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists gcse_interventions_child_idx on public.gcse_interventions (child_id, subject_id);
create index if not exists gcse_interventions_open_idx on public.gcse_interventions (status, next_step_due);
create index if not exists gcse_interventions_class_idx on public.gcse_interventions (class_id);

-- Keeps updated_at / resolved_at honest whoever writes the row.
create or replace function public.gcse_interventions_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status is distinct from 'resolved') then
    new.resolved_at := now();
  elsif new.status <> 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists gcse_interventions_touch on public.gcse_interventions;
create trigger gcse_interventions_touch
  before insert or update on public.gcse_interventions
  for each row execute function public.gcse_interventions_touch();

alter table public.gcse_interventions enable row level security;

drop policy if exists "gcse_interventions: head/admin and academic staff manage all" on public.gcse_interventions;
create policy "gcse_interventions: head/admin and academic staff manage all"
  on public.gcse_interventions for all
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

drop policy if exists "gcse_interventions: teacher of class reads" on public.gcse_interventions;
create policy "gcse_interventions: teacher of class reads"
  on public.gcse_interventions for select
  to authenticated
  using (gcse_interventions.class_id is not null and public.class_taught_by_current_user(gcse_interventions.class_id));

drop policy if exists "gcse_interventions: teacher of class adds" on public.gcse_interventions;
create policy "gcse_interventions: teacher of class adds"
  on public.gcse_interventions for insert
  to authenticated
  with check (
    gcse_interventions.class_id is not null
    and public.class_taught_by_current_user(gcse_interventions.class_id)
    and public.child_enrolled_in_class(gcse_interventions.child_id, gcse_interventions.class_id)
  );

drop policy if exists "gcse_interventions: teacher of class updates" on public.gcse_interventions;
create policy "gcse_interventions: teacher of class updates"
  on public.gcse_interventions for update
  to authenticated
  using (gcse_interventions.class_id is not null and public.class_taught_by_current_user(gcse_interventions.class_id))
  with check (
    gcse_interventions.class_id is not null
    and public.class_taught_by_current_user(gcse_interventions.class_id)
    and public.child_enrolled_in_class(gcse_interventions.child_id, gcse_interventions.class_id)
  );

drop trigger if exists audit_gcse_interventions on public.gcse_interventions;
create trigger audit_gcse_interventions
  after insert or update or delete on public.gcse_interventions
  for each row execute function public.audit_row_change();
