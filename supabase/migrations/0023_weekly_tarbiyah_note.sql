-- The "Weekly Tarbiyah Note" — a personal weekly update on a child's
-- character/akhlaq from their form tutor, separate from academic
-- assessment (quran_progress, assessments). Marketing has promised this
-- (differentiator d6 in src/content/seed.ts, and pastoral-care's page
-- metadata) since before any table backed it — this migration is what
-- makes the claim real rather than removing it.
--
-- Deliberately NOT gated to a special "form tutor" permission the way
-- quran_progress is gated to assessment_lead: any teacher of the child's
-- class can write one, mirroring how a form tutor role isn't modelled
-- separately elsewhere in this schema yet. Uses the SAME
-- class_taught_by_current_user() helper assessments.sql's own RLS
-- already relies on (0011), so "who may write a note for this class" has
-- exactly one definition across the whole schema.
create table public.weekly_tarbiyah_notes (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  week_of date not null, -- the Monday of the week this note covers
  note text not null check (char_length(note) > 0),
  recorded_by uuid references public.profiles(id),
  recorded_at timestamptz not null default now(),
  unique (child_id, class_id, week_of) -- one note per child per class per week, not a running log of duplicates
);

alter table public.weekly_tarbiyah_notes enable row level security;

create index weekly_tarbiyah_notes_child_idx on public.weekly_tarbiyah_notes (child_id, week_of desc);

create policy "weekly_tarbiyah_notes: teacher of class manages own class's"
  on public.weekly_tarbiyah_notes for all
  using (public.class_taught_by_current_user(weekly_tarbiyah_notes.class_id))
  with check (public.class_taught_by_current_user(weekly_tarbiyah_notes.class_id));

create policy "weekly_tarbiyah_notes: staff with manage_academic manage all"
  on public.weekly_tarbiyah_notes for all
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

create policy "weekly_tarbiyah_notes: parent reads own child's"
  on public.weekly_tarbiyah_notes for select
  to authenticated
  using (public.child_belongs_to_parent(weekly_tarbiyah_notes.child_id));

create policy "weekly_tarbiyah_notes: student reads own"
  on public.weekly_tarbiyah_notes for select
  to authenticated
  using (public.child_belongs_to_student(weekly_tarbiyah_notes.child_id));

-- Same audit trigger pattern as quran_progress/assessments (0011) — every
-- write captured centrally, not something application code could skip.
create trigger audit_weekly_tarbiyah_notes
  after insert or update or delete on public.weekly_tarbiyah_notes
  for each row execute function public.audit_row_change();
