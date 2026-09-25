-- Stores responses to the public "Is TGA right for us?" family-fit quiz
-- (src/components/eligibility/EligibilityQuiz.tsx). Same trust model as the
-- rest of this schema: RLS default-deny, anon can only insert (never read
-- back what anyone else submitted), staff/admin can read and annotate.

create table public.eligibility_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_year_band text not null check (child_year_band in ('reception-y2', 'y3-6', 'y7-9', 'y10-11')),
  region text not null check (region in ('uk-europe-west-africa', 'gulf-south-asia', 'other')),
  hifz_priority text not null check (hifz_priority in ('central', 'nice-to-have', 'not-a-priority')),
  send_needs boolean not null default false,
  send_details text,
  start_readiness text not null check (start_readiness in ('jan-2027', 'exploring-later', 'not-sure')),
  recommended_action text not null check (recommended_action in ('book_call', 'apply_now')),
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  -- Staff-only, added later from the admissions team's follow-up.
  staff_notes text,
  contacted_at timestamptz
);

alter table public.eligibility_responses enable row level security;

create policy "eligibility_responses: anyone can submit"
  on public.eligibility_responses for insert
  to anon, authenticated
  with check (true);

create policy "eligibility_responses: staff/admin read all"
  on public.eligibility_responses for select
  to authenticated
  using (public.current_role_is(array['staff', 'admin']));

create policy "eligibility_responses: staff/admin update follow-up fields"
  on public.eligibility_responses for update
  to authenticated
  using (public.current_role_is(array['staff', 'admin']))
  with check (public.current_role_is(array['staff', 'admin']));

create index eligibility_responses_created_at_idx on public.eligibility_responses (created_at desc);
