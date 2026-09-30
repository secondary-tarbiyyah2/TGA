-- Phase 1 of moving marketing-site content management out of Sanity and
-- into this database, editable from /learn/admin/content (the user
-- explicitly asked for "everything managed in one place" rather than a
-- separate CMS with its own login/CORS/webhook setup).
--
-- Covers the marketing content types only (site settings, homepage/about/
-- curriculum copy, FAQs, fee bands, policies, term dates, testimonials,
-- team bios, differentiators, curriculum documents) -- NOT the LMS's own
-- `terms`/`academic_years` (still Sanity-synced via
-- scripts/sync-terms-from-sanity.mjs) or `signable_documents` (still
-- Sanity-synced via scripts/sync-signable-documents-from-sanity.mjs).
-- Those two are a separate, riskier migration (they touch timetabling and
-- e-signature respectively) and are being done as a follow-up, not bundled
-- in here.
--
-- Every table mirrors a Sanity schema type 1:1 (see src/sanity/schemaTypes/
-- and src/content/seed.ts, whose shapes this matches field-for-field) so
-- migrating src/lib/content.ts's getters is a data-source swap, not a
-- page-by-page rewrite -- every page already reads through getSiteSettings()/
-- getFeeBands()/etc., never Sanity directly.
--
-- All public read (this is public marketing content, read at build time
-- via the anon key from GitHub Actions -- the site is a static export, so
-- there is no runtime browser query to restrict), admin write (same
-- current_role_is(array['admin']) check used throughout this app, which
-- already covers head_teacher/admin/admissions via legacyProfileRole()).

-- ── site_settings: extend the existing singleton (0020_bursary_seats.sql) ──
alter table public.site_settings
  add column launch_date date,
  add column cta_primary_label text,
  add column cta_primary_href text,
  add column application_fee numeric,
  add column registration_fee numeric,
  add column sibling_discount_percent numeric,
  add column sibling_discount_note text,
  add column discounts jsonb not null default '[]'::jsonb,
  add column booking_widget_url text,
  add column open_evening_recording_url text,
  add column portal_url text,
  add column admissions_email text,
  add column contact_phone text,
  add column contact_address text,
  add column opening_hours text,
  add column safeguarding_lead_name text,
  add column safeguarding_lead_contact text,
  add column complaints_last_year int,
  add column registration_body text,
  add column registration_number text,
  add column regulatory_status_note text,
  add column headteacher_welcome_quote text,
  add column headteacher_name text;

-- The existing "site_settings: staff/admin read" policy (0020) is narrower
-- than what these new fields need (every one of them is shown on a public
-- page today via Sanity) -- add a public-read policy alongside it rather
-- than widen/replace the existing one, so bursary_seats_public's own
-- narrower contract is untouched.
create policy "site_settings: public read"
  on public.site_settings for select
  using (true);

create policy "site_settings: admin write"
  on public.site_settings for update
  using (public.current_role_is(array['admin']))
  with check (public.current_role_is(array['admin']));

-- ── homepage_content / about_content / curriculum_content (singletons) ──
create table public.homepage_content (
  id boolean primary key default true check (id),
  hero_kicker text,
  hero_heading text,
  hero_body text,
  pillars jsonb not null default '[]'::jsonb,
  how_it_works_heading text,
  how_it_works_steps jsonb not null default '[]'::jsonb,
  stages_heading text,
  stages_body text,
  fee_teaser_heading text,
  fee_teaser_body text,
  safe_heading text,
  safe_body text,
  updated_at timestamptz not null default now()
);
insert into public.homepage_content (id) values (true);
alter table public.homepage_content enable row level security;
create policy "homepage_content: public read" on public.homepage_content for select using (true);
create policy "homepage_content: admin write" on public.homepage_content for update using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));

create table public.about_content (
  id boolean primary key default true check (id),
  hero_heading text,
  hero_body text,
  mission_body text,
  safeguarding_body text,
  recipe_intro text,
  recipe_items jsonb not null default '[]'::jsonb,
  family_heading text,
  family_body text,
  updated_at timestamptz not null default now()
);
insert into public.about_content (id) values (true);
alter table public.about_content enable row level security;
create policy "about_content: public read" on public.about_content for select using (true);
create policy "about_content: admin write" on public.about_content for update using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));

create table public.curriculum_content (
  id boolean primary key default true check (id),
  hero_heading text,
  hero_body text,
  updated_at timestamptz not null default now()
);
insert into public.curriculum_content (id) values (true);
alter table public.curriculum_content enable row level security;
create policy "curriculum_content: public read" on public.curriculum_content for select using (true);
create policy "curriculum_content: admin write" on public.curriculum_content for update using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));

-- ── fee_bands ─────────────────────────────────────────────────────────────
create table public.fee_bands (
  id uuid primary key default gen_random_uuid(),
  year_group_range text not null,
  order_index int not null default 0,
  annual_fee numeric not null,
  termly_fee numeric not null,
  monthly_fee numeric not null,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.fee_bands enable row level security;
create policy "fee_bands: public read" on public.fee_bands for select using (true);
create policy "fee_bands: admin write" on public.fee_bands for all using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));

-- ── faq_entries ───────────────────────────────────────────────────────────
create table public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null check (category in ('Admissions', 'Fees', 'Curriculum', 'Technology', 'Islamic Studies', 'SEND')),
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.faq_entries enable row level security;
create policy "faq_entries: public read" on public.faq_entries for select using (true);
create policy "faq_entries: admin write" on public.faq_entries for all using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));

-- ── testimonials ──────────────────────────────────────────────────────────
create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null,
  attribution text not null,
  role text not null check (role in ('Parent', 'Student')),
  is_placeholder boolean not null default true,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.testimonials enable row level security;
create policy "testimonials: public read" on public.testimonials for select using (true);
create policy "testimonials: admin write" on public.testimonials for all using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));

-- ── team_profiles (public "Meet the Team" bios -- distinct concept from
--    staff_members, which holds admissions-call booking availability) ─────
create table public.team_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role_title text not null,
  qualifications text,
  intro_video_url text,
  is_placeholder boolean not null default true,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.team_profiles enable row level security;
create policy "team_profiles: public read" on public.team_profiles for select using (true);
create policy "team_profiles: admin write" on public.team_profiles for all using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));

-- ── differentiators ───────────────────────────────────────────────────────
create table public.differentiators (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  detail text,
  icon text,
  status text not null check (status in ('Confirmed commitment', 'Draft / concept — not yet confirmed')),
  visible boolean not null default true,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.differentiators enable row level security;
create policy "differentiators: public read" on public.differentiators for select using (true);
create policy "differentiators: admin write" on public.differentiators for all using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));

-- ── policy_links ──────────────────────────────────────────────────────────
create table public.policy_links (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  title text not null,
  category text not null check (category in ('required', 'published')),
  parent_question_category text check (parent_question_category in ('safety', 'admissions-fees', 'complaints', 'data', 'curriculum')),
  file_url text not null,
  summary text,
  last_reviewed date,
  next_review date,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.policy_links enable row level security;
create policy "policy_links: public read" on public.policy_links for select using (true);
create policy "policy_links: admin write" on public.policy_links for all using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));

-- ── curriculum_documents ──────────────────────────────────────────────────
create table public.curriculum_documents (
  id uuid primary key default gen_random_uuid(),
  key_stage text not null,
  subject text not null,
  title text not null,
  term text check (term in ('autumn', 'spring', 'summer')),
  file_url text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.curriculum_documents enable row level security;
create policy "curriculum_documents: public read" on public.curriculum_documents for select using (true);
create policy "curriculum_documents: admin write" on public.curriculum_documents for all using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));

-- ── site_term_dates (the public Term Dates page + admissions calendar +
--    .ics feed -- distinct from the LMS's own `terms`/`academic_years`,
--    which drive timetabling and stay Sanity-synced for now) ─────────────
create table public.site_term_dates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  kind text not null check (kind in ('Term date', 'Holiday', 'Admissions deadline', 'Event')),
  date date not null,
  end_date date,
  notes text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.site_term_dates enable row level security;
create policy "site_term_dates: public read" on public.site_term_dates for select using (true);
create policy "site_term_dates: admin write" on public.site_term_dates for all using (public.current_role_is(array['admin'])) with check (public.current_role_is(array['admin']));
