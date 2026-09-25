-- Admin account requirements (role-based permissions, audit trail) that
-- weren't covered by 0001: lets an admin manage other staff accounts and
-- role changes, and logs every such change.

-- ── security fix: self-update was not restricting which columns change ────
-- 0001's "profiles: update own row" policy (id = auth.uid(), no column
-- restriction) means ANY signed-in user can currently set their OWN role to
-- 'admin' via a direct client call — found while testing this migration's
-- new admin-update policy below, not something 0001 was meant to allow.
-- RLS WITH CHECK can't cleanly compare against the pre-update value (no
-- reliable OLD reference), so this is enforced with a BEFORE trigger
-- instead: silently reverts the role column unless the caller is already
-- admin. This closes the hole immediately for the live table, no application
-- code changes required.
create or replace function public.protect_profiles_role_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.current_role_is(array['admin']) then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profiles_role_column();

-- ── staff_members: deactivation instead of deletion ────────────────────────
alter table public.staff_members add column active boolean not null default true;

-- Same self-escalation risk as above: the existing "self update own
-- availability fields" policy (0001) has no column restriction, so without
-- this trigger a deactivated staff member could simply reactivate themself.
create or replace function public.protect_staff_members_active_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active is distinct from old.active and not public.current_role_is(array['admin']) then
    new.active := old.active;
  end if;
  return new;
end;
$$;

create trigger staff_members_protect_active
  before update on public.staff_members
  for each row execute function public.protect_staff_members_active_column();

-- ── admin can manage roles and staff rows ──────────────────────────────────
-- 0001 only let a user update their own profile/staff row. An admin now
-- needs to change another user's role (e.g. promoting staff to admin) and
-- deactivate a staff account — both go through these, not raw inserts
-- (new accounts are still only created via the invite Edge Function, which
-- uses the service-role key to create the underlying auth.users row first;
-- a client can never do that directly, so no admin INSERT policy is needed
-- here).
create policy "profiles: admin update any row"
  on public.profiles for update
  to authenticated
  using (public.current_role_is(array['admin']))
  with check (public.current_role_is(array['admin']));

create policy "staff_members: admin update any row"
  on public.staff_members for update
  to authenticated
  using (public.current_role_is(array['admin']))
  with check (public.current_role_is(array['admin']));

-- ── audit_log ────────────────────────────────────────────────────────────
-- Every insert/update/delete on the tables an admin can act on, captured by
-- trigger (not application code) so it can't be silently skipped by a bug
-- or by using the client library directly. Only admins can ever read it;
-- nothing else has any policy at all, matching this schema's default-deny
-- convention, so even the audit log itself can't be tampered with by non-
-- admins. The trigger function is SECURITY DEFINER and owned by the
-- migration role, which owns this table and therefore bypasses its RLS —
-- the same escape hatch current_role_is() uses in 0001.
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  target_table text not null,
  target_id text,
  changes jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "audit_log: admin read"
  on public.audit_log for select
  to authenticated
  using (public.current_role_is(array['admin']));

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_target_idx on public.audit_log (target_table, target_id);

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
  v_target_id text;
begin
  select email into v_actor_email from public.profiles where id = v_actor;
  v_target_id := coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, null);

  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, changes)
  values (
    v_actor,
    v_actor_email,
    tg_op,
    tg_table_name,
    v_target_id,
    case
      when tg_op = 'DELETE' then jsonb_build_object('old', to_jsonb(old))
      when tg_op = 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

create trigger audit_staff_members
  after insert or update or delete on public.staff_members
  for each row execute function public.audit_row_change();

create trigger audit_bookings
  after update on public.bookings
  for each row execute function public.audit_row_change();

create trigger audit_eligibility_responses
  after update on public.eligibility_responses
  for each row execute function public.audit_row_change();
