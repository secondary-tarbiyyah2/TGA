-- Absence notes: parents tell the school why a child was (or will be) away.
-- Staff authorise / don't authorise. Undecided notes count as "unexplained"
-- in the Absences summary until someone decides (aggregation is client-side
-- from RLS-scoped attendance_records + absence_notes).
--
-- Teacher scope uses the existing child_enrolled_in_teachers_class() (0008).

create table public.absence_notes (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null default auth.uid() references public.profiles(id),
  from_date date not null,
  to_date date not null,
  reason text not null,
  status text not null default 'undecided' check (status in ('undecided', 'authorised', 'unauthorised')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  constraint absence_notes_date_order check (to_date >= from_date)
);

create index absence_notes_child_idx on public.absence_notes (child_id, from_date, to_date);
create index absence_notes_status_idx on public.absence_notes (status);

alter table public.absence_notes enable row level security;

create policy "absence_notes: parent reads own children's"
  on public.absence_notes for select
  to authenticated
  using (public.child_belongs_to_parent(absence_notes.child_id));

create policy "absence_notes: parent inserts for own children"
  on public.absence_notes for insert
  to authenticated
  with check (
    public.child_belongs_to_parent(absence_notes.child_id)
    and parent_user_id = auth.uid()
    and status = 'undecided'
    and decided_by is null
  );

create policy "absence_notes: parent edits while undecided"
  on public.absence_notes for update
  to authenticated
  using (public.child_belongs_to_parent(absence_notes.child_id) and status = 'undecided')
  with check (public.child_belongs_to_parent(absence_notes.child_id) and status = 'undecided');

create policy "absence_notes: parent deletes while undecided"
  on public.absence_notes for delete
  to authenticated
  using (public.child_belongs_to_parent(absence_notes.child_id) and status = 'undecided');

create policy "absence_notes: head_teacher/admin manage all"
  on public.absence_notes for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "absence_notes: teacher reads own class's children"
  on public.absence_notes for select
  to authenticated
  using (public.child_enrolled_in_teachers_class(absence_notes.child_id));

create policy "absence_notes: teacher decides own class's children"
  on public.absence_notes for update
  to authenticated
  using (public.child_enrolled_in_teachers_class(absence_notes.child_id))
  with check (public.child_enrolled_in_teachers_class(absence_notes.child_id));

-- Stamp who decided and when, and stop anyone other than the note's own
-- parent (or a Headteacher/Admin) from rewriting what the parent wrote.
create or replace function public.absence_notes_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if not public.current_has_role(array['head_teacher', 'admin'])
       and old.parent_user_id is distinct from auth.uid() then
      new.child_id := old.child_id;
      new.parent_user_id := old.parent_user_id;
      new.from_date := old.from_date;
      new.to_date := old.to_date;
      new.reason := old.reason;
      new.created_at := old.created_at;
    end if;
    if new.status is distinct from old.status or new.decision_note is distinct from old.decision_note then
      if new.status = 'undecided' then
        new.decided_by := null;
        new.decided_at := null;
      else
        new.decided_by := auth.uid();
        new.decided_at := now();
      end if;
    else
      new.decided_by := old.decided_by;
      new.decided_at := old.decided_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger absence_notes_guard
  before update on public.absence_notes
  for each row execute function public.absence_notes_guard();

create trigger audit_absence_notes
  after insert or update or delete on public.absence_notes
  for each row execute function public.audit_row_change();
