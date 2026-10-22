-- Teacher sign-off for curriculum content. A row says who checked a specification unit
-- or a lesson, when, and with what result. The row is the current state; every change is
-- also kept in the audit log (audit_row_change), so the history of a sign-off is never lost.
--
-- scope 'spec'   : ref is a specification unit reference (e.g. '1.1', '3.2.1', 'Biology 2').
-- scope 'lesson' : ref is '<year>/<lesson_no>' (e.g. 'y10/12').

create table if not exists public.curriculum_signoffs (
  id uuid primary key default gen_random_uuid(),
  subject_slug text not null,
  scope text not null check (scope in ('spec', 'lesson')),
  ref text not null check (char_length(ref) between 1 and 80),
  status text not null check (status in ('in_review', 'approved', 'changes_needed')),
  note text check (note is null or char_length(note) <= 500),
  checked_by uuid references public.profiles(id),
  checked_name text,
  checked_at timestamptz not null default now(),
  unique (subject_slug, scope, ref)
);

create index if not exists curriculum_signoffs_subject_idx on public.curriculum_signoffs (subject_slug, scope);

alter table public.curriculum_signoffs enable row level security;

drop policy if exists "curriculum_signoffs: staff read" on public.curriculum_signoffs;
create policy "curriculum_signoffs: staff read"
  on public.curriculum_signoffs for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));

drop trigger if exists audit_curriculum_signoffs on public.curriculum_signoffs;
create trigger audit_curriculum_signoffs
  after insert or update or delete on public.curriculum_signoffs
  for each row execute function public.audit_row_change();

-- Set or change a sign-off as the signed-in teacher. Passing status null clears it.
create or replace function public.curriculum_set_signoff(p_subject text, p_scope text, p_ref text, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_scope not in ('spec', 'lesson') then
    raise exception 'invalid scope' using errcode = '22023';
  end if;
  if p_status is null then
    delete from public.curriculum_signoffs where subject_slug = p_subject and scope = p_scope and ref = p_ref;
    return;
  end if;
  if p_status not in ('in_review', 'approved', 'changes_needed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  select full_name into who from public.profiles where id = auth.uid();
  insert into public.curriculum_signoffs (subject_slug, scope, ref, status, note, checked_by, checked_name, checked_at)
  values (p_subject, p_scope, p_ref, p_status, nullif(btrim(p_note), ''), auth.uid(), who, now())
  on conflict (subject_slug, scope, ref)
  do update set status = excluded.status, note = excluded.note, checked_by = excluded.checked_by, checked_name = excluded.checked_name, checked_at = excluded.checked_at;
end;
$$;

revoke all on function public.curriculum_set_signoff(text, text, text, text, text) from public, anon;
grant execute on function public.curriculum_set_signoff(text, text, text, text, text) to authenticated;
