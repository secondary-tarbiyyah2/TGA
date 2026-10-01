-- Direct online applications from the public /admissions/apply form, and the
-- admin portal's Admissions pipeline that works them.
--
-- The public form inserts as anon/authenticated and CANNOT read anything
-- back (no anon select), so the client generates the row id itself and
-- inserts without .select(). The human reference (TGA-2026-0001) is assigned
-- by a before-insert trigger; staff see it in the portal.

create sequence public.admissions_reference_seq;

create table public.admissions_applications (
  id uuid primary key default gen_random_uuid(),
  reference text unique,
  status text not null default 'new'
    check (status in ('new', 'assessment', 'interview', 'offered', 'accepted', 'waitlisted', 'declined', 'withdrawn')),

  parent_name text not null check (char_length(parent_name) between 1 and 120),
  parent_email text not null check (char_length(parent_email) between 3 and 254 and position('@' in parent_email) > 1),
  parent_phone text not null check (char_length(parent_phone) between 5 and 40),
  relationship text check (char_length(relationship) <= 60),
  address text check (char_length(address) <= 500),

  child_first_name text not null check (char_length(child_first_name) between 1 and 80),
  child_last_name text not null check (char_length(child_last_name) between 1 and 80),
  child_dob date not null check (child_dob >= date '2000-01-01'),
  child_gender text check (char_length(child_gender) <= 40),

  year_group_applying text not null check (char_length(year_group_applying) between 1 and 60),
  preferred_start text check (char_length(preferred_start) <= 120),
  current_school text check (char_length(current_school) <= 200),
  current_school_year text check (char_length(current_school_year) <= 60),
  previous_islamic_education text check (char_length(previous_islamic_education) <= 1500),
  send_or_medical_notes text check (char_length(send_or_medical_notes) <= 3000),
  how_heard text check (char_length(how_heard) <= 300),
  sibling_at_tarbiyyah boolean default false,
  sibling_details text check (char_length(sibling_details) <= 500),

  consent_contact boolean not null,
  consent_data boolean not null,
  declaration_name text not null check (char_length(declaration_name) between 1 and 120),

  notes text check (char_length(notes) <= 10000), -- internal, staff only
  assigned_to uuid references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admissions_applications_status_idx on public.admissions_applications (status, created_at desc);

-- Reference + server-owned timestamps. SECURITY DEFINER so anon can advance
-- the sequence without any grant on it; the reference is always server-made.
create or replace function public.admissions_applications_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  new.updated_at := now();
  new.reference := 'TGA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.admissions_reference_seq')::text, 4, '0');
  return new;
end;
$$;

create trigger admissions_applications_set_reference
  before insert on public.admissions_applications
  for each row execute function public.admissions_applications_before_insert();

create or replace function public.admissions_applications_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger admissions_applications_touch_updated_at
  before update on public.admissions_applications
  for each row execute function public.admissions_applications_touch_updated_at();

create trigger audit_admissions_applications
  after insert or update or delete on public.admissions_applications
  for each row execute function public.audit_row_change();

alter table public.admissions_applications enable row level security;

-- Public form: insert only, and only a clean "new" row.
create policy "admissions_applications: public can apply"
  on public.admissions_applications for insert
  to anon, authenticated
  with check (
    status = 'new'
    and consent_contact is true
    and consent_data is true
    and notes is null
    and assigned_to is null
  );

create policy "admissions_applications: staff read"
  on public.admissions_applications for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

create policy "admissions_applications: staff update"
  on public.admissions_applications for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

create policy "admissions_applications: head/admin delete"
  on public.admissions_applications for delete
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- Master switch for the public form (site_settings already has a public-read
-- policy and an admin write policy).
alter table public.site_settings
  add column accepting_applications boolean not null default true;

-- NOTE: no "New application" bell-notification trigger. 0024_notifications.sql
-- creates no per-user notifications table (only notification_reads, a
-- last-read timestamp; the bell computes counts client-side from live
-- tables), so there is nothing to insert into.
