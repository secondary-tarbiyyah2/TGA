-- Progress reports: review, approval and a published-version record.
--
-- The draft -> pending_approval -> released statuses already existed (0012),
-- but the database only checked WHO could write, not what a step needed:
--   * a report could be submitted or issued with no comment and no data;
--   * "approved by / when" was whatever the client wrote;
--   * a released report could be edited in place by the office, so the copy
--     a family had read could silently change;
--   * there was no way to send a report back to the teacher with a reason.
--
-- Now:
--   * submitting needs a comment and the data summary; it records who/when;
--   * releasing needs the same, and the database stamps approved_by /
--     approved_at / released_at from the signed-in head or admin;
--   * every release saves an unchangeable copy in term_report_versions, which
--     is what families read, so reopening a report for a correction never
--     changes or hides what they already have;
--   * the head can send a report back (status 'draft' + returned_reason), or
--     reopen a released one; a released report can't otherwise be edited.

alter table public.term_reports
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists returned_by uuid references public.profiles(id) on delete set null,
  add column if not exists returned_at timestamptz,
  add column if not exists returned_reason text,
  add column if not exists version integer not null default 0;

create or replace function public.term_reports_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text := case when tg_op = 'UPDATE' then old.status else null end;
begin
  -- A released report is a fixed record: the only change allowed is reopening it.
  if v_old = 'released' and new.status = 'released' then
    if new.overall_comment is distinct from old.overall_comment
       or new.narrative is distinct from old.narrative
       or new.subject_comments is distinct from old.subject_comments then
      raise exception 'This report has been issued. Reopen it to make a correction.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status in ('pending_approval', 'released') and (v_old is distinct from new.status) then
    if nullif(btrim(coalesce(new.overall_comment, '')), '') is null then
      raise exception 'Add a comment before this report is submitted or issued.' using errcode = '23514';
    end if;
    if new.narrative is null then
      raise exception 'Generate the report (attendance, homework and grades) before it is submitted or issued.' using errcode = '23514';
    end if;
  end if;

  if new.status = 'pending_approval' and v_old is distinct from 'pending_approval' then
    new.submitted_by := coalesce(v_uid, new.submitted_by);
    new.submitted_at := now();
    new.returned_reason := null;
  end if;

  if new.status = 'released' and v_old is distinct from 'released' then
    new.approved_by := coalesce(v_uid, new.approved_by);
    new.approved_at := now();
    new.released_at := now();
    new.version := coalesce(case when tg_op = 'UPDATE' then old.version end, 0) + 1;
  end if;

  -- Sent back to the teacher, or reopened after release.
  if new.status = 'draft' and v_old in ('pending_approval', 'approved', 'released')
     and public.current_has_role(array['head_teacher', 'admin']) then
    new.returned_by := v_uid;
    new.returned_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists term_reports_workflow_trg on public.term_reports;
create trigger term_reports_workflow_trg
  before insert or update on public.term_reports
  for each row execute function public.term_reports_workflow();

-- ── Published versions ──────────────────────────────────────────────────
create table if not exists public.term_report_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.term_reports(id) on delete cascade,
  version integer not null,
  child_id uuid not null references public.children(id) on delete cascade,
  term_id uuid references public.terms(id) on delete set null,
  overall_comment text,
  subject_comments jsonb not null default '{}'::jsonb,
  narrative jsonb,
  written_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  released_at timestamptz not null default now(),
  unique (report_id, version)
);

create index if not exists term_report_versions_child_idx on public.term_report_versions (child_id, released_at desc);

alter table public.term_report_versions enable row level security;

drop policy if exists "term_report_versions: head/admin read" on public.term_report_versions;
create policy "term_report_versions: head/admin read"
  on public.term_report_versions for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "term_report_versions: teacher reads taught pupils" on public.term_report_versions;
create policy "term_report_versions: teacher reads taught pupils"
  on public.term_report_versions for select to authenticated
  using (public.child_taught_by(term_report_versions.child_id, auth.uid()));

drop policy if exists "term_report_versions: parent reads own child" on public.term_report_versions;
create policy "term_report_versions: parent reads own child"
  on public.term_report_versions for select to authenticated
  using (public.child_belongs_to_parent(term_report_versions.child_id));

drop policy if exists "term_report_versions: pupil reads own" on public.term_report_versions;
create policy "term_report_versions: pupil reads own"
  on public.term_report_versions for select to authenticated
  using (public.child_belongs_to_student(term_report_versions.child_id));
-- No insert/update/delete policies: only the trigger below writes, and a
-- published copy is never changed.

create or replace function public.term_reports_save_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'released' and (tg_op = 'INSERT' or old.status is distinct from 'released') then
    insert into public.term_report_versions (report_id, version, child_id, term_id, overall_comment, subject_comments, narrative, written_by, approved_by, released_at)
    values (new.id, new.version, new.child_id, new.term_id, new.overall_comment, coalesce(new.subject_comments, '{}'::jsonb), new.narrative, new.written_by, new.approved_by, coalesce(new.released_at, now()))
    on conflict (report_id, version) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists term_reports_save_version_trg on public.term_reports;
create trigger term_reports_save_version_trg
  after insert or update on public.term_reports
  for each row execute function public.term_reports_save_version();

-- Reports already issued before this change become version 1.
update public.term_reports set version = 1 where status = 'released' and version = 0;
insert into public.term_report_versions (report_id, version, child_id, term_id, overall_comment, subject_comments, narrative, written_by, approved_by, released_at)
select r.id, 1, r.child_id, r.term_id, r.overall_comment, coalesce(r.subject_comments, '{}'::jsonb), r.narrative, r.written_by, r.approved_by, coalesce(r.released_at, r.updated_at)
from public.term_reports r
where r.status = 'released'
on conflict (report_id, version) do nothing;
