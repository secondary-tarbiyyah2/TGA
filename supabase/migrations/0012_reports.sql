-- Phase C: term progress reports for /learn. Same conventions as 0010/0011.
--
-- A report pulls together attendance (0009's attendance_records),
-- homework completion (0010's homework_status) and grades (0011's
-- assessments) at READ time, not by duplicating them into this table —
-- data minimization: `term_reports` stores only the report-specific
-- content (comments, approval state) that has no other home, plus a
-- `narrative` jsonb SNAPSHOT of the computed summary taken at release time
-- only (see note on that column) so a released report reads identically
-- to how it looked when a parent first saw it, even if attendance/grades
-- are corrected afterwards — everything else is joined live.

-- ── comment_bank (reusable snippets, per-subject or general) ────────────
create table public.comment_bank (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete cascade, -- null = general/cross-subject
  text text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.comment_bank enable row level security;

create policy "comment_bank: authenticated staff read"
  on public.comment_bank for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));

create policy "comment_bank: teacher/admin/head_teacher write own or all"
  on public.comment_bank for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));

-- ── term_reports ──────────────────────────────────────────────────────────
create table public.term_reports (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'released')),
  overall_comment text,
  subject_comments jsonb not null default '{}'::jsonb, -- {subject_id: comment}, teacher-authored, may start from comment_bank text
  -- Snapshot of attendance %/homework completion/grade summary, computed
  -- and written ONCE at approval (see term-report-approve Edge Function),
  -- purely so a released report is a stable historical document rather
  -- than a live query that could change under the parent after release.
  -- Never hand-edited; always re-derivable from the source tables above.
  narrative jsonb,
  written_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id, term_id)
);

alter table public.term_reports enable row level security;

create index term_reports_child_idx on public.term_reports (child_id);

-- Teachers may draft/edit a report for a child in one of their own classes,
-- but only while it's still draft/pending_approval — once approved/released
-- it's a fixed record (edits after that go through a fresh draft cycle, not
-- silently mutating a released document).
create policy "term_reports: teacher of a child's class drafts"
  on public.term_reports for all
  to authenticated
  using (
    public.child_enrolled_in_teachers_class(term_reports.child_id)
    and term_reports.status in ('draft', 'pending_approval')
  )
  with check (
    public.child_enrolled_in_teachers_class(term_reports.child_id)
    and term_reports.status in ('draft', 'pending_approval')
  );

-- Approval itself (draft/pending_approval -> approved, and approved ->
-- released) is restricted to Head Teacher/Admin at the RLS level too (not
-- only via UI), by only allowing them to write when status is/was one of
-- the approval-gated values. This still leaves the actual "who approved,
-- when" write to be whatever admin/head_teacher client makes the call;
-- the audit_log trigger below is what gives the durable "who, when" trail
-- the ground rules ask for.
create policy "term_reports: head_teacher/admin manage all"
  on public.term_reports for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "term_reports: parent reads own child's released"
  on public.term_reports for select
  to authenticated
  using (term_reports.status = 'released' and public.child_belongs_to_parent(term_reports.child_id));

create policy "term_reports: student reads own released"
  on public.term_reports for select
  to authenticated
  using (term_reports.status = 'released' and public.child_belongs_to_student(term_reports.child_id));

create trigger audit_term_reports
  after insert or update or delete on public.term_reports
  for each row execute function public.audit_row_change();
