-- Baseline / standardised assessment results on the pupil record.
--
-- The Academy uses GL Assessment (CAT4, and GL's reading and maths tests)
-- through the account shared with Tarbiyyah Secondary; GL's own norms are
-- what make a score meaningful, so results are RECORDED here, not generated.
-- One row per pupil per test sitting. Scores are standardised (SAS, mean
-- 100), stored as entered from GL's report or CSV export; the admin import
-- page maps GL's columns. Readable by Headteacher/Admin/Admissions and by the
-- pupil's own teachers (need-to-know); parents do not see raw scores here.
-- Idempotent.

create table if not exists public.baseline_assessments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  provider text not null default 'GL Assessment' check (char_length(provider) between 1 and 60),
  test text not null check (test in ('CAT4', 'NGRT', 'PTE', 'PTM', 'Baseline interview', 'Other')),
  level text check (level is null or char_length(level) <= 20),
  taken_on date not null,
  -- CAT4 batteries (SAS, 59-141). Null where the test has no such battery.
  verbal_sas int check (verbal_sas is null or verbal_sas between 59 and 141),
  quantitative_sas int check (quantitative_sas is null or quantitative_sas between 59 and 141),
  nonverbal_sas int check (nonverbal_sas is null or nonverbal_sas between 59 and 141),
  spatial_sas int check (spatial_sas is null or spatial_sas between 59 and 141),
  mean_sas int check (mean_sas is null or mean_sas between 59 and 141),
  -- Single-score tests (NGRT reading, PTE English, PTM maths): SAS and optional reading/age.
  score_sas int check (score_sas is null or score_sas between 59 and 141),
  stanine int check (stanine is null or stanine between 1 and 9),
  percentile int check (percentile is null or percentile between 1 and 99),
  age_equivalent text check (age_equivalent is null or char_length(age_equivalent) <= 20),
  notes text check (notes is null or char_length(notes) <= 2000),
  source text not null default 'manual' check (source in ('manual', 'csv_import')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists baseline_assessments_child_idx on public.baseline_assessments (child_id, taken_on desc);

alter table public.baseline_assessments enable row level security;

drop policy if exists "baseline_assessments: leadership and admissions read" on public.baseline_assessments;
create policy "baseline_assessments: leadership and admissions read" on public.baseline_assessments
  for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']) or public.current_role_is(array['admin']));

-- A teacher sees the results of pupils in the classes they teach.
drop policy if exists "baseline_assessments: own pupils read" on public.baseline_assessments;
create policy "baseline_assessments: own pupils read" on public.baseline_assessments
  for select to authenticated
  using (
    public.current_has_role(array['teacher', 'teaching_assistant_cover'])
    and exists (
      select 1 from public.enrolments e
      join public.classes cl on cl.id = e.class_id
      where e.child_id = baseline_assessments.child_id and public.class_taught_by_current_user(cl.id)
    )
  );

drop policy if exists "baseline_assessments: leadership write" on public.baseline_assessments;
create policy "baseline_assessments: leadership write" on public.baseline_assessments
  for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']) or public.current_role_is(array['admin']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']) or public.current_role_is(array['admin']));

drop trigger if exists baseline_assessments_audit on public.baseline_assessments;
create trigger baseline_assessments_audit
  after insert or update or delete on public.baseline_assessments
  for each row execute function public.audit_row_change();
