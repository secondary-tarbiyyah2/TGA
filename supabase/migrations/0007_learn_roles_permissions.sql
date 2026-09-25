-- Foundation schema for the /learn authenticated area (Phase 1).
--
-- Deliberately a separate authorization layer from `profiles.role` (used by
-- the existing booking/staff-dashboard system, untouched here): a person can
-- hold several /learn roles at once (e.g. teacher AND parent), which a
-- single `profiles.role` column can't express. `user_roles` is the
-- authoritative source for everything under /learn; `profiles.role` keeps
-- meaning what it always has for the pre-existing booking admin panel.
--
-- Every new table here follows this schema's established default-deny
-- pattern: RLS enabled, only narrow read policies granted to
-- authenticated/anon, and NO client write policies at all — every write
-- (role grants, permission grants, recruitment checks) goes through an Edge
-- Function using the service-role key, which re-verifies the caller's own
-- permission server-side before writing. This is deliberate, not an
-- oversight: it keeps "who can grant Head Teacher" etc. as a single
-- reviewable code path instead of a sprawl of RLS write policies, matching
-- the ground rule that authorization is enforced server-side, never only by
-- hiding UI.

-- ── role vocabulary ─────────────────────────────────────────────────────
-- Canonical role identifiers used everywhere under /learn. Kept as a Postgres
-- domain (not a table-scoped check) so every table below references the same
-- fixed vocabulary and a typo fails loudly at migration time, not silently
-- at read time.
create domain public.learn_role as text
  check (value in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'parent', 'student'));

-- Add-on permission identifiers (stack on top of any primary role).
create domain public.learn_permission as text
  check (value in (
    'manage_admissions', 'manage_people_accounts', 'grant_sensitive_roles',
    'manage_academic', 'manage_website_content', 'view_compliance', 'manage_permissions_matrix',
    'view_own_classes', 'manage_own_classes',
    'view_own_children', 'view_own_records',
    'timetabler', 'safeguarding_lead', 'can_export_data', 'assessment_lead'
  ));

-- ── user_roles ───────────────────────────────────────────────────────────
-- scope_type/scope_id let a role be narrowed to a specific class or family
-- (e.g. teacher scoped to one class) rather than granting it school-wide.
-- 'none' scope means the role applies without narrowing (e.g. head_teacher).
create table public.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.learn_role not null,
  scope_type text not null default 'none' check (scope_type in ('none', 'class', 'family')),
  scope_id uuid,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  constraint user_roles_scope_shape check (
    (scope_type = 'none' and scope_id is null) or
    (scope_type <> 'none' and scope_id is not null)
  ),
  unique (user_id, role, scope_type, scope_id)
);

alter table public.user_roles enable row level security;

create policy "user_roles: read own"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

-- ── helper functions ──────────────────────────────────────────────────────
-- Defined here, immediately after user_roles, and BEFORE any other policy
-- references them: same SECURITY DEFINER recursion-avoidance reasoning as
-- current_role_is() in 0001. A plain `exists(select ... from user_roles
-- where ...)` inside a policy ON user_roles itself recurses into user_roles'
-- own policy evaluation — verified empirically against a real Postgres
-- instance (an earlier, inline-subquery version of the "staff read all"
-- policy below raised "infinite recursion detected in policy for relation
-- user_roles") before being rewritten to go through this function instead.
create or replace function public.current_has_role(roles public.learn_role[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = any(roles)
  );
$$;

grant execute on function public.current_has_role(public.learn_role[]) to anon, authenticated;

-- "Read all your own school's role assignments" isn't sensitive on its own
-- (no personal data, just role/scope pairs) and several shell pages need it
-- (e.g. showing a class's assigned teacher).
create policy "user_roles: staff read all"
  on public.user_roles for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

-- ── role_permissions (the editable matrix) ──────────────────────────────
create table public.role_permissions (
  role public.learn_role not null,
  permission public.learn_permission not null,
  primary key (role, permission)
);

alter table public.role_permissions enable row level security;

-- Not sensitive on its own (just "which capability names exist per role",
-- no personal data) — readable by any signed-in /learn user so the client
-- can render an accurate capability preview without needing a round trip
-- through an Edge Function for every keystroke of the staff-creation form.
create policy "role_permissions: authenticated read"
  on public.role_permissions for select
  to authenticated
  using (true);

insert into public.role_permissions (role, permission) values
  ('head_teacher', 'manage_admissions'),
  ('head_teacher', 'manage_people_accounts'),
  ('head_teacher', 'grant_sensitive_roles'),
  ('head_teacher', 'manage_academic'),
  ('head_teacher', 'manage_website_content'),
  ('head_teacher', 'view_compliance'),
  ('head_teacher', 'manage_permissions_matrix'),
  ('admin', 'manage_admissions'),
  ('admin', 'manage_people_accounts'),
  ('admin', 'manage_academic'),
  ('admin', 'manage_website_content'),
  ('admin', 'view_compliance'),
  ('admissions', 'manage_admissions'),
  ('teacher', 'view_own_classes'),
  ('teacher', 'manage_own_classes'),
  ('teaching_assistant_cover', 'view_own_classes'),
  ('parent', 'view_own_children'),
  ('student', 'view_own_records');

-- ── user_permissions (per-user add-on grants) ───────────────────────────
-- Surrogate `id` (rather than a (user_id, permission) primary key) because
-- the shared audit_row_change() trigger function (0003) reads NEW/OLD.id
-- unconditionally — confirmed by testing that a composite-PK table breaks
-- it ("record has no field id") rather than assumed.
create table public.user_permissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission public.learn_permission not null check (
    permission in ('timetabler', 'safeguarding_lead', 'can_export_data', 'assessment_lead')
  ),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  unique (user_id, permission)
);

alter table public.user_permissions enable row level security;

create policy "user_permissions: read own"
  on public.user_permissions for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_permissions: staff read all"
  on public.user_permissions for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

create or replace function public.current_has_permission(perm public.learn_permission)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role = ur.role
      where ur.user_id = auth.uid() and rp.permission = perm
    )
    or exists (
      select 1 from public.user_permissions up
      where up.user_id = auth.uid() and up.permission = perm
    );
$$;

grant execute on function public.current_has_permission(public.learn_permission) to anon, authenticated;

-- Reads the MFA assurance level Supabase Auth puts in the JWT — same GUC
-- mechanism 0004 uses for the service-role check, since this also needs to
-- survive being called from inside a SECURITY DEFINER function.
create or replace function public.current_is_aal2()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::json->>'aal', '') = 'aal2';
$$;

grant execute on function public.current_is_aal2() to anon, authenticated;

-- "Re-authentication for sensitive actions": rather than a bespoke
-- session-freshness table, this checks how recently the CURRENT access
-- token was minted (its `iat` claim). A fresh MFA challenge
-- (auth.mfa.challengeAndVerify) mints a brand-new token, so requiring a
-- small max age here is equivalent to requiring "confirm with your
-- authenticator code just now" — enforced on the token itself, not a
-- client-supplied flag that could be forged.
create or replace function public.current_token_fresh(max_age_minutes int)
returns boolean
language sql
stable
as $$
  select coalesce(
    to_timestamp((current_setting('request.jwt.claims', true)::json->>'iat')::bigint)
      > now() - (max_age_minutes || ' minutes')::interval,
    false
  );
$$;

grant execute on function public.current_token_fresh(int) to anon, authenticated;

-- ── login_attempts (lockout tracking) ───────────────────────────────────
-- Same shape/reasoning as 0001's booking_attempts: zero RLS policies means
-- zero access for anon/authenticated — only the service-role Edge Function
-- (learn-login) ever reads or writes this. NOTE (documented honestly, not
-- hidden): this table gives account-level lockout and visibility, but a
-- client that skips calling the Edge Function's "record" step entirely
-- bypasses it — the backstop that can't be skipped is Supabase Auth's own
-- built-in server-side rate limiting on sign-in attempts, which this layer
-- supplements rather than replaces.
create table public.login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  ip_hash text,
  success boolean not null,
  attempted_at timestamptz not null default now()
);

alter table public.login_attempts enable row level security;

create index login_attempts_email_idx on public.login_attempts (email, attempted_at desc);

-- ── classes (minimal — foundation for teacher scoping; full academic
-- management UI is a later phase, this just gives scope_id somewhere valid
-- to point at) ────────────────────────────────────────────────────────────
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year_group text not null,
  subject text,
  created_at timestamptz not null default now()
);

alter table public.classes enable row level security;

create policy "classes: assigned teacher/TA reads own"
  on public.classes for select
  to authenticated
  using (exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('teacher', 'teaching_assistant_cover')
      and ur.scope_type = 'class'
      and ur.scope_id = classes.id
  ));

create policy "classes: staff with manage_academic read all"
  on public.classes for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

-- ── students: add an optional login identity ────────────────────────────
-- Existing `students` rows (0001) have no linked auth.users account since
-- the booking system never needed students to sign in. /learn/student does,
-- so this adds an optional (nullable — most students still won't have
-- their own login) link, set by an Edge Function when a student account is
-- created, never by direct client write.
alter table public.students add column profile_id uuid unique references public.profiles(id) on delete set null;

create policy "students: self read own row"
  on public.students for select
  to authenticated
  using (profile_id = auth.uid());

-- ── audit triggers ───────────────────────────────────────────────────────
-- Reuses 0003's generic audit_row_change() trigger function.
create trigger audit_user_roles
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();

create trigger audit_user_permissions
  after insert or update or delete on public.user_permissions
  for each row execute function public.audit_row_change();
