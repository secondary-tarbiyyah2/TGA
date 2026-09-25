-- 0003's two protective triggers check current_role_is(), which relies on
-- auth.uid() — that's null for a service-role connection (no JWT context),
-- so as written those triggers would also revert legitimate changes made by
-- an Edge Function using the service-role key (e.g. an admin action). The
-- service-role connection is a distinct, fully-trusted Postgres role that
-- already bypasses RLS entirely; these triggers should let it through too.
--
-- current_user/session_user cannot be used to detect this from inside a
-- SECURITY DEFINER function: both report the function's OWNER for the
-- entire call, not the caller's role (verified empirically — a debug
-- function returned 'postgres' for both, called from a session that had
-- run `set role service_role`). The GUC 'request.jwt.claims' is what
-- auth.uid() itself already reads to get the caller's identity (see 0001),
-- and — also verified empirically — survives SECURITY DEFINER correctly,
-- since it's a session-level setting rather than a Postgres role. This
-- reads the same GUC's 'role' claim instead.

create or replace function public.protect_profiles_role_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := current_setting('request.jwt.claims', true)::json->>'role';
begin
  if new.role is distinct from old.role
     and coalesce(v_jwt_role, '') <> 'service_role'
     and not public.current_role_is(array['admin']) then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create or replace function public.protect_staff_members_active_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := current_setting('request.jwt.claims', true)::json->>'role';
begin
  if new.active is distinct from old.active
     and coalesce(v_jwt_role, '') <> 'service_role'
     and not public.current_role_is(array['admin']) then
    new.active := old.active;
  end if;
  return new;
end;
$$;
