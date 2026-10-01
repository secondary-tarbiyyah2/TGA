-- Teacher acknowledgements of pupil information, and audited staff reads.
--
-- A teacher marks "I've read the medical & emergency information" for a
-- child they teach. The row snapshots pupil_details.updated_at so the
-- acknowledgement shows as out of date once the family changes anything.

create table public.pupil_detail_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  teacher_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  details_updated_at timestamptz, -- pupil_details.updated_at when acknowledged
  unique (child_id, teacher_id)
);

alter table public.pupil_detail_acknowledgements enable row level security;

create index pupil_detail_acknowledgements_child_idx on public.pupil_detail_acknowledgements (child_id);

create policy "pupil_detail_acknowledgements: head_teacher/admin read"
  on public.pupil_detail_acknowledgements for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

create policy "pupil_detail_acknowledgements: teacher reads own"
  on public.pupil_detail_acknowledgements for select
  to authenticated
  using (teacher_id = auth.uid());

create policy "pupil_detail_acknowledgements: teacher acknowledges own class's children"
  on public.pupil_detail_acknowledgements for insert
  to authenticated
  with check (
    teacher_id = auth.uid()
    and public.child_enrolled_in_teachers_class(pupil_detail_acknowledgements.child_id)
  );

create policy "pupil_detail_acknowledgements: teacher re-acknowledges"
  on public.pupil_detail_acknowledgements for update
  to authenticated
  using (teacher_id = auth.uid() and public.child_enrolled_in_teachers_class(pupil_detail_acknowledgements.child_id))
  with check (teacher_id = auth.uid() and public.child_enrolled_in_teachers_class(pupil_detail_acknowledgements.child_id));

-- Server decides the time and the snapshot; teachers can't backdate or
-- acknowledge on someone else's behalf.
create or replace function public.pupil_detail_acknowledgements_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.teacher_id := coalesce(case when tg_op = 'UPDATE' then old.teacher_id end, auth.uid(), new.teacher_id);
  if tg_op = 'UPDATE' then
    new.child_id := old.child_id;
  end if;
  new.acknowledged_at := now();
  select pd.updated_at into new.details_updated_at
  from public.pupil_details pd where pd.child_id = new.child_id;
  return new;
end;
$$;

create trigger pupil_detail_acknowledgements_guard
  before insert or update on public.pupil_detail_acknowledgements
  for each row execute function public.pupil_detail_acknowledgements_guard();

create trigger audit_pupil_detail_acknowledgements
  after insert or update or delete on public.pupil_detail_acknowledgements
  for each row execute function public.audit_row_change();

-- ── audited staff reads ─────────────────────────────────────────────────
-- The repo has no read-audit pattern, so this adds one: the staff UI calls
-- this when it opens a pupil's full record (not for list views). It writes a
-- 'VIEW' row to audit_log (visible to admins only, like every audit row).
create or replace function public.log_pupil_detail_view(p_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not (
    public.current_has_role(array['head_teacher', 'admin'])
    or public.child_enrolled_in_teachers_class(p_child_id)
  ) then
    raise exception 'Not allowed to view this pupil record';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, changes)
  values (auth.uid(), v_email, 'VIEW', 'pupil_details', p_child_id::text, null);
end;
$$;

grant execute on function public.log_pupil_detail_view(uuid) to authenticated;
