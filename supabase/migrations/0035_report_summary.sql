-- Progress Reports restructure: reports can now cover "All time" (no term).
--
-- The auto-built summary (attendance, homework, assessments, Qur'an
-- progress) is stored as a SNAPSHOT in the existing term_reports.narrative
-- jsonb column from 0012 (shape: {version, generated_at, term_label,
-- classes: {class_id: summary}}), so no new column is needed. RLS is
-- unchanged. The only schema gap: term_id was NOT NULL, so an "All time"
-- report could not be stored. Make it nullable and keep one all-time
-- report per child.
alter table public.term_reports alter column term_id drop not null;

create unique index if not exists term_reports_child_all_time_uniq
  on public.term_reports (child_id)
  where term_id is null;
