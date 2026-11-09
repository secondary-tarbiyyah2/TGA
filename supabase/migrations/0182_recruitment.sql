-- 0182: recruitment (careers page, job applications, staff review).
--
-- The school advertises teaching and support roles on the public Careers
-- page and candidates apply online with a full, safer-recruitment-style
-- application (personal details, qualifications, full employment history,
-- two referees, statement, CV upload, declarations). Staff review every
-- application in the portal (/admin/recruitment) and the recruitment inbox
-- gets a structured email for each one.
--
--   job_vacancies          Roles. Created and edited by Headteacher/Admin in
--                          the portal. Anyone (anon) may read OPEN roles whose
--                          closing date has not passed, so the static site's
--                          Careers page lists them live with no rebuild.
--   job_applications       One row per application. NO client insert policy:
--                          the only way in is the careers-apply Edge Function
--                          (service role), which adds the honeypot, minimum
--                          fill-in time, rate limit, file checks and emails.
--                          Readable and editable by Headteacher/Admin only.
--   job_application_events The review timeline: staff notes, plus a row for
--                          every status change (written by a trigger, so it
--                          can't be skipped).
--   recruitment_settings   Singleton: which inbox gets the new-application
--                          emails, and whether candidates get an automatic
--                          acknowledgement.
--   bucket recruitment-documents  Private. CVs and supporting documents,
--                          written by the Edge Function, read by staff via
--                          signed URLs.
--
-- Safeguarding / data protection (flag for human review before go-live):
--   * Applications hold candidates' personal data, so they are NOT copied
--     into the audit log (audit_row_change copies whole rows). Status changes
--     and notes are kept in job_application_events instead. Vacancies are
--     audited.
--   * No criminal-record question is asked on the public form: under KCSIE
--     self-disclosure belongs at shortlisting. The form asks only about the
--     DBS check the candidate holds or will apply for.
--   * Unsuccessful and withdrawn applications are deleted, with their files,
--     6 months after the decision (scripts/compliance-retention.mjs).
--
-- Idempotent: safe to re-run.

-- ── vacancies ───────────────────────────────────────────────────────────
create table if not exists public.job_vacancies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 2 and 120),
  department text not null default 'Teaching' check (department in ('Teaching', 'Qur''an and Islamic Studies', 'Pastoral and SEND', 'Leadership', 'Support staff')),
  summary text not null default '' check (char_length(summary) <= 400),
  description text not null default '' check (char_length(description) <= 8000),
  responsibilities text not null default '' check (char_length(responsibilities) <= 6000),
  requirements text not null default '' check (char_length(requirements) <= 6000),
  desirable text not null default '' check (char_length(desirable) <= 4000),
  contract_type text not null default 'part_time' check (contract_type in ('full_time', 'part_time', 'sessional', 'flexible')),
  hours_text text check (hours_text is null or char_length(hours_text) <= 200),
  salary_text text check (salary_text is null or char_length(salary_text) <= 200),
  location_text text not null default 'Remote: live online lessons' check (char_length(location_text) <= 200),
  start_text text check (start_text is null or char_length(start_text) <= 200),
  closing_date date,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  sort_order int not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_vacancies_status_idx on public.job_vacancies (status, sort_order);

alter table public.job_vacancies enable row level security;

drop policy if exists "job_vacancies: public read open" on public.job_vacancies;
create policy "job_vacancies: public read open"
  on public.job_vacancies for select
  to anon, authenticated
  using (status = 'open' and (closing_date is null or closing_date >= (now() at time zone 'Europe/London')::date));

drop policy if exists "job_vacancies: staff read" on public.job_vacancies;
create policy "job_vacancies: staff read"
  on public.job_vacancies for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "job_vacancies: staff insert" on public.job_vacancies;
create policy "job_vacancies: staff insert"
  on public.job_vacancies for insert
  to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "job_vacancies: staff update" on public.job_vacancies;
create policy "job_vacancies: staff update"
  on public.job_vacancies for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- No delete policy: a role with applications is closed, not removed.

drop trigger if exists audit_job_vacancies on public.job_vacancies;
create trigger audit_job_vacancies
  after insert or update or delete on public.job_vacancies
  for each row execute function public.audit_row_change();

create or replace function public.recruitment_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists job_vacancies_touch_trg on public.job_vacancies;
create trigger job_vacancies_touch_trg
  before update on public.job_vacancies
  for each row execute function public.recruitment_touch();

-- ── applications ────────────────────────────────────────────────────────
create sequence if not exists public.job_application_ref_seq start 1001;

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('TGA-J-' || nextval('public.job_application_ref_seq')::text),
  vacancy_id uuid references public.job_vacancies(id) on delete set null,
  vacancy_title text not null check (char_length(vacancy_title) between 1 and 160),
  status text not null default 'new' check (status in ('new', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'unsuccessful', 'withdrawn')),
  status_changed_at timestamptz not null default now(),

  -- 1. About you
  title text check (title is null or char_length(title) <= 20),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  preferred_name text check (preferred_name is null or char_length(preferred_name) <= 80),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null check (char_length(phone) between 5 and 40),
  country text not null check (char_length(country) between 2 and 80),
  town text check (town is null or char_length(town) <= 120),
  right_to_work text not null check (right_to_work in ('uk_yes', 'uk_sponsorship', 'outside_uk')),

  -- 2. Qualifications
  teacher_status text not null check (teacher_status in ('qts', 'qtls', 'overseas', 'training', 'none')),
  highest_qualification text not null check (char_length(highest_qualification) between 2 and 300),
  qualifications text check (qualifications is null or char_length(qualifications) <= 3000),
  islamic_qualifications text check (islamic_qualifications is null or char_length(islamic_qualifications) <= 3000),
  subjects text[] not null default '{}',
  year_groups text[] not null default '{}',
  languages text check (languages is null or char_length(languages) <= 300),

  -- 3. Experience
  years_experience text not null check (years_experience in ('none', 'under_2', '2_5', '5_10', 'over_10')),
  online_experience text not null check (online_experience in ('regular', 'some', 'none')),
  employment jsonb not null default '[]'::jsonb check (jsonb_typeof(employment) = 'array' and jsonb_array_length(employment) <= 12),
  employment_gaps text check (employment_gaps is null or char_length(employment_gaps) <= 2000),

  -- 4. Availability
  hours_preference text not null check (hours_preference in ('full_time', 'part_time', 'either')),
  available_days text[] not null default '{}',
  earliest_start text check (earliest_start is null or char_length(earliest_start) <= 120),
  notice_period text check (notice_period is null or char_length(notice_period) <= 120),
  has_equipment boolean not null default false,

  -- 5. Supporting statement
  statement text not null check (char_length(statement) between 100 and 8000),
  why_tga text check (why_tga is null or char_length(why_tga) <= 3000),

  -- 6. References
  referees jsonb not null check (jsonb_typeof(referees) = 'array' and jsonb_array_length(referees) between 2 and 3),

  -- 7. Declarations
  -- We recruit internationally: many candidates have no DBS, and some live
  -- where no police certificate exists. 'not_available' is a valid answer;
  -- the school then agrees alternative checks at shortlisting.
  dbs_status text not null check (dbs_status in ('enhanced_update_service', 'enhanced', 'willing', 'overseas_check', 'overseas_willing', 'not_available')),
  how_heard text check (how_heard is null or char_length(how_heard) <= 200),
  declaration_name text not null check (char_length(declaration_name) between 2 and 160),
  declaration_true boolean not null check (declaration_true),
  consent_data boolean not null check (consent_data),

  -- Files (paths in the recruitment-documents bucket)
  cv_path text,
  cv_filename text,
  documents jsonb not null default '[]'::jsonb check (jsonb_typeof(documents) = 'array'),

  -- AI screening (advisory only; written by the service role, never by staff)
  ai_score smallint check (ai_score is null or ai_score between 0 and 100),
  ai_recommendation text check (ai_recommendation is null or ai_recommendation in ('strong', 'possible', 'unlikely')),
  ai_screening jsonb,
  ai_screened_at timestamptz,

  -- Review
  rating smallint check (rating is null or rating between 1 and 5),
  interview_at timestamptz,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_applications_status_idx on public.job_applications (status, created_at desc);
create index if not exists job_applications_vacancy_idx on public.job_applications (vacancy_id, created_at desc);
create index if not exists job_applications_ai_idx on public.job_applications (ai_score desc nulls last);
create index if not exists job_applications_email_idx on public.job_applications (lower(email));

alter table public.job_applications enable row level security;

drop policy if exists "job_applications: staff read" on public.job_applications;
create policy "job_applications: staff read"
  on public.job_applications for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "job_applications: staff update" on public.job_applications;
create policy "job_applications: staff update"
  on public.job_applications for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "job_applications: staff delete" on public.job_applications;
create policy "job_applications: staff delete"
  on public.job_applications for delete
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- No insert policy: applications come in only through careers-apply.

drop trigger if exists job_applications_touch_trg on public.job_applications;
create trigger job_applications_touch_trg
  before update on public.job_applications
  for each row execute function public.recruitment_touch();

-- Staff may change the review fields only; what the candidate wrote is fixed.
create or replace function public.job_applications_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (to_jsonb(new) - array['status', 'status_changed_at', 'rating', 'interview_at', 'updated_at'])
       is distinct from (to_jsonb(old) - array['status', 'status_changed_at', 'rating', 'interview_at', 'updated_at']) then
      raise exception 'Only the status, rating and interview time of an application can be changed'
        using errcode = '42501';
    end if;
  end if;
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists job_applications_guard_trg on public.job_applications;
create trigger job_applications_guard_trg
  before update on public.job_applications
  for each row execute function public.job_applications_guard();

-- ── review timeline ─────────────────────────────────────────────────────
create table if not exists public.job_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  kind text not null check (kind in ('note', 'status', 'email', 'ai')),
  body text check (body is null or char_length(body) <= 4000),
  from_status text,
  to_status text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists job_application_events_app_idx on public.job_application_events (application_id, created_at);

alter table public.job_application_events enable row level security;

drop policy if exists "job_application_events: staff read" on public.job_application_events;
create policy "job_application_events: staff read"
  on public.job_application_events for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "job_application_events: staff add notes" on public.job_application_events;
create policy "job_application_events: staff add notes"
  on public.job_application_events for insert
  to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin']) and kind = 'note' and created_by = auth.uid());

-- No update or delete policy: the timeline is a record.

create or replace function public.job_applications_log_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.job_application_events (application_id, kind, from_status, to_status, created_by)
    values (new.id, 'status', old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists job_applications_log_status_trg on public.job_applications;
create trigger job_applications_log_status_trg
  after update on public.job_applications
  for each row execute function public.job_applications_log_status();

-- ── settings (singleton) ────────────────────────────────────────────────
create table if not exists public.recruitment_settings (
  id boolean primary key default true check (id),
  notify_email text not null default 'globalacademy@tarbiyyah.co.uk' check (notify_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  attach_cv boolean not null default true,
  auto_acknowledge boolean not null default true,
  -- AI screening: run automatically on every new application (when an
  -- ANTHROPIC_API_KEY is set), and the school's own guidance for it.
  auto_screen boolean not null default true,
  screening_criteria text not null default
    'We recruit internationally for live online lessons taught in UK school hours (UK time).' || chr(10) ||
    'Do not mark anyone down for living outside the UK, for not having a UK DBS, or for having no UK teaching qualification (QTS): we agree suitable checks with shortlisted candidates.' || chr(10) ||
    'For Qur''an teaching, an ijazah is a bonus, not a requirement: strong recitation, tajweed and experience teaching children matter most.' || chr(10) ||
    'Value clear evidence of teaching children well, subject knowledge, online teaching experience and a thoughtful statement.' || chr(10) ||
    'Flag unexplained gaps in employment, missing or weak referees, and availability that does not fit UK school hours.'
    check (char_length(screening_criteria) <= 4000),
  updated_at timestamptz not null default now()
);

insert into public.recruitment_settings (id) values (true) on conflict (id) do nothing;

alter table public.recruitment_settings enable row level security;

drop policy if exists "recruitment_settings: staff read" on public.recruitment_settings;
create policy "recruitment_settings: staff read"
  on public.recruitment_settings for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "recruitment_settings: staff update" on public.recruitment_settings;
create policy "recruitment_settings: staff update"
  on public.recruitment_settings for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop trigger if exists recruitment_settings_touch_trg on public.recruitment_settings;
create trigger recruitment_settings_touch_trg
  before update on public.recruitment_settings
  for each row execute function public.recruitment_touch();

-- ── files ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recruitment-documents', 'recruitment-documents', false, 10485760,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'image/jpeg', 'image/png'];

drop policy if exists "recruitment-documents: staff read" on storage.objects;
create policy "recruitment-documents: staff read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'recruitment-documents' and public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "recruitment-documents: staff delete" on storage.objects;
create policy "recruitment-documents: staff delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'recruitment-documents' and public.current_has_role(array['head_teacher', 'admin']));

-- ── retention registry ──────────────────────────────────────────────────
insert into public.retention_schedule (data_type, description, retention_period, action_on_expiry, owner_job)
values (
  'Unsuccessful job applications',
  'job_applications marked Unsuccessful or Withdrawn, their review timeline and their files in recruitment-documents',
  '6 months after the decision. Hired candidates'' applications move to their staff file and are kept with it.',
  'delete',
  'scripts/compliance-retention.mjs'
)
on conflict (data_type) do nothing;

-- ── AI usage: allow the recruitment task (cap shared with ai-assist) ─────
alter table public.ai_usage drop constraint if exists ai_usage_task_check;
alter table public.ai_usage add constraint ai_usage_task_check
  check (task in ('report_comment', 'tarbiyah_note', 'message_triage', 'recruitment_screen'));

-- ── the starter role (a draft: not on the website until staff open it) ──
-- One role covering every subject: candidates choose their subjects on the
-- form, and the portal filters applications by subject.
insert into public.job_vacancies (slug, title, department, summary, description, responsibilities, requirements, desirable, contract_type, hours_text, location_text, start_text, status, sort_order) values
  ('teacher', 'Teacher (all subjects, Year 1 to Year 11)', 'Teaching',
   'Teach your subject live online to small classes of no more than 15 pupils, from anywhere in the world.',
   'We are building the founding teaching team for a live online Islamic school, opening in January 2027. We are recruiting across every subject: primary class teaching, Qur''an and tajweed, Arabic, Islamic Studies, English, Maths, Science and other secondary subjects up to International GCSE. Tell us which subjects and year groups you teach when you apply. We welcome applications from teachers in any country, as long as you can teach in UK school hours.',
   'Plan and teach engaging live lessons on Microsoft Teams.' || chr(10) || 'Set and mark classwork and homework, and track each pupil''s progress.' || chr(10) || 'Nurture good character and love of the deen alongside learning.' || chr(10) || 'Work with parents and colleagues to support every pupil.',
   'Experience of teaching children, in a school, madrasah or online.' || chr(10) || 'Strong knowledge of the subjects you teach.' || chr(10) || 'Able to teach live in UK school hours (UK time).' || chr(10) || 'A computer with a camera and microphone, and reliable internet.' || chr(10) || 'Commitment to Islamic values and to keeping children safe.',
   'A teaching qualification (QTS or one from your own country).' || chr(10) || 'An ijazah, for Qur''an teachers.' || chr(10) || 'Experience of teaching online.' || chr(10) || 'Experience of the UK national curriculum or International GCSE.',
   'flexible', null, 'Remote: live online, from any country', 'January 2027', 'draft', 10)
on conflict (slug) do nothing;
