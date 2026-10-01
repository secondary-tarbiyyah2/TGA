-- Pupil information: the standard UK-school pupil record (home details,
-- health, emergency contacts, consents). Parents complete it per child; the
-- Headteacher/admin see everything; teachers READ the children they teach.
--
-- Conventions follow 0039/0040: RLS default deny, SECURITY DEFINER helpers
-- for membership checks, audit_row_change() on every table. NOTE: the shared
-- audit_row_change() reads NEW/OLD.id unconditionally, so pupil_details keeps
-- a surrogate `id` primary key and a UNIQUE child_id (one row per child).
--
-- Medical information is sensitive. Writes are audited by trigger; staff
-- READS are audited through public.log_pupil_detail_view() (0045).

-- ── pupil_details ───────────────────────────────────────────────────────
create table public.pupil_details (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null unique references public.children(id) on delete cascade,
  -- Basics (name and date of birth already live on public.children)
  gender text check (gender in ('male', 'female')),
  address_line1 text,
  address_line2 text,
  town text,
  postcode text,
  home_language text,
  ethnicity text,
  previous_school text,
  siblings_at_school text,
  -- Health
  gp_name text,
  gp_phone text,
  medical_conditions text,
  allergies text,
  medication text,
  dietary_needs text,
  sen_notes text,
  health_confirmed boolean not null default false, -- parent has checked the health section ("None" is a valid answer)
  -- Consents: null = not answered yet
  photo_consent boolean,
  trip_consent boolean,
  -- Completeness (maintained by the trigger below, never by clients)
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.pupil_details enable row level security;

-- ── pupil_emergency_contacts ────────────────────────────────────────────
create table public.pupil_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  name text not null,
  relationship text not null default '',
  phone text not null,
  alt_phone text,
  email text,
  is_authorised_collector boolean not null default false,
  parental_responsibility boolean not null default false,
  priority int not null default 1 check (priority > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pupil_emergency_contacts enable row level security;

create index pupil_emergency_contacts_child_idx on public.pupil_emergency_contacts (child_id, priority);

-- ── completeness ────────────────────────────────────────────────────────
-- Complete = gender, address + postcode, GP name + phone, health section
-- confirmed, both consents answered, and at least 2 emergency contacts
-- (each with a name and phone, which the columns already require).
create or replace function public.pupil_details_is_complete(d public.pupil_details)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select d.gender is not null
    and coalesce(btrim(d.address_line1), '') <> ''
    and coalesce(btrim(d.postcode), '') <> ''
    and coalesce(btrim(d.gp_name), '') <> ''
    and coalesce(btrim(d.gp_phone), '') <> ''
    and d.health_confirmed
    and d.photo_consent is not null
    and d.trip_consent is not null
    and (select count(*) from public.pupil_emergency_contacts c where c.child_id = d.child_id) >= 2;
$$;

-- Stamps updated_*, locks child_id, and owns completed_at/completed_by so a
-- client can never claim a record is complete when it is not.
create or replace function public.pupil_details_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.child_id := old.child_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();

  if public.pupil_details_is_complete(new) then
    if tg_op = 'INSERT' or old.completed_at is null then
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      new.completed_at := old.completed_at;
      new.completed_by := old.completed_by;
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

create trigger pupil_details_guard
  before insert or update on public.pupil_details
  for each row execute function public.pupil_details_guard();

-- Any change to a contact re-evaluates completeness and bumps updated_at
-- (which also marks a teacher's earlier acknowledgement as out of date).
create or replace function public.pupil_emergency_contacts_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.child_id := old.child_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger pupil_emergency_contacts_touch
  before update on public.pupil_emergency_contacts
  for each row execute function public.pupil_emergency_contacts_touch();

create or replace function public.pupil_emergency_contacts_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pupil_details set updated_at = now()
  where child_id = coalesce(new.child_id, old.child_id);
  return coalesce(new, old);
end;
$$;

create trigger pupil_emergency_contacts_refresh
  after insert or update or delete on public.pupil_emergency_contacts
  for each row execute function public.pupil_emergency_contacts_refresh();

-- ── RLS: pupil_details ──────────────────────────────────────────────────
create policy "pupil_details: head_teacher/admin all"
  on public.pupil_details for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "pupil_details: parent reads own children's"
  on public.pupil_details for select
  to authenticated
  using (public.child_belongs_to_parent(pupil_details.child_id));

create policy "pupil_details: parent inserts for own children"
  on public.pupil_details for insert
  to authenticated
  with check (public.child_belongs_to_parent(pupil_details.child_id));

create policy "pupil_details: parent updates own children's"
  on public.pupil_details for update
  to authenticated
  using (public.child_belongs_to_parent(pupil_details.child_id))
  with check (public.child_belongs_to_parent(pupil_details.child_id));

-- Teachers READ only, and only for children in a class they teach.
create policy "pupil_details: teacher reads own class's children"
  on public.pupil_details for select
  to authenticated
  using (public.child_enrolled_in_teachers_class(pupil_details.child_id));

-- ── RLS: pupil_emergency_contacts ───────────────────────────────────────
create policy "pupil_emergency_contacts: head_teacher/admin all"
  on public.pupil_emergency_contacts for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "pupil_emergency_contacts: parent manages own children's"
  on public.pupil_emergency_contacts for all
  to authenticated
  using (public.child_belongs_to_parent(pupil_emergency_contacts.child_id))
  with check (public.child_belongs_to_parent(pupil_emergency_contacts.child_id));

create policy "pupil_emergency_contacts: teacher reads own class's children"
  on public.pupil_emergency_contacts for select
  to authenticated
  using (public.child_enrolled_in_teachers_class(pupil_emergency_contacts.child_id));

-- ── audit ───────────────────────────────────────────────────────────────
create trigger audit_pupil_details
  after insert or update or delete on public.pupil_details
  for each row execute function public.audit_row_change();

create trigger audit_pupil_emergency_contacts
  after insert or update or delete on public.pupil_emergency_contacts
  for each row execute function public.audit_row_change();
