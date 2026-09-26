-- "Remember this device" for MFA (Prompt: /learn UX fixes, item 3).
--
-- The problem: Supabase Auth's session AAL resets to aal1 on every fresh
-- sign-in even for an already-enrolled user (AAL doesn't persist "trust"
-- across sign-ins by itself) — so MfaGate.tsx was demanding a full MFA
-- challenge on literally every login, for an already-MFA-enrolled admin.
-- That's excessive; the well-established fix is a signed, expiring
-- "remember this device" record checked in addition to (never instead of)
-- a live MFA enrollment.
--
-- This is a genuinely different, weaker-by-design check than the one
-- FreshMfaGate.tsx already implements for the safeguarding log
-- (current_token_fresh(15) in 0015_compliance.sql) — that one is untouched
-- by this migration and must NEVER be satisfiable by a remembered device;
-- it always demands a live re-challenge every 15 minutes, by design, given
-- what the safeguarding log holds. Trusted devices only ever affect
-- MfaGate (routine admin-area access), never FreshMfaGate.
--
-- Storage shape: only a SHA-256 hash of a client-generated random token is
-- ever stored, never the raw token — same reasoning as password hashing.
-- The raw token itself lives client-side (this is a static export with no
-- server, so there is no httpOnly-cookie option; see src/lib/learn/
-- trustedDevice.ts for where it's kept and why). Even a full read of this
-- table by anyone with database access reveals nothing usable to
-- impersonate a device — same defense-in-depth reasoning as never storing
-- plaintext passwords.
--
-- Access shape follows the same convention as 0007's user_roles/
-- role_permissions: RLS enabled, and no direct client write policies at
-- all. A signed-in user MAY read their own rows' non-sensitive columns
-- (id/label/created_at/last_used_at/expires_at) directly for the "manage
-- your trusted devices" UI, but the hash column is walled off with a
-- column-level GRANT (not just an RLS row filter) so a client library
-- calling `select *` on the table gets a permission error, never the hash
-- — and both matching a device and creating/revoking one only ever happen
-- through the SECURITY DEFINER functions below, which re-derive auth.uid()
-- server-side rather than trusting anything the client sends.

create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_token_hash text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  unique (user_id, device_token_hash)
);

create index trusted_devices_user_id_idx on public.trusted_devices (user_id);
-- Lets the nightly cleanup below find expired rows without a full scan.
create index trusted_devices_expires_at_idx on public.trusted_devices (expires_at);

alter table public.trusted_devices enable row level security;

-- Row policy: a user may only ever see their OWN device rows. Combined
-- with the column grant below (never granted on device_token_hash), this
-- is what lets the account-menu "your trusted devices" list read
-- id/label/created_at/last_used_at/expires_at directly, with no function
-- round-trip needed for something that isn't sensitive on its own.
create policy "trusted_devices: read own"
  on public.trusted_devices for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policies at all — every write goes through the
-- SECURITY DEFINER functions below, matching 0007's established
-- convention for "who can grant/revoke X" being one reviewable function
-- rather than scattered RLS write policies.

revoke all on public.trusted_devices from authenticated, anon;
grant select (id, user_id, label, created_at, last_used_at, expires_at) on public.trusted_devices to authenticated;

-- Called right after a successful MFA verify, with a fresh client-generated
-- random token (never a password, never anything else reusable). Re-derives
-- auth.uid() itself — the caller can't trust-a-device for anyone but
-- themselves no matter what's in the request.
create or replace function public.trust_this_device(p_token text, p_label text default null, p_days integer default 30)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'invalid_token';
  end if;

  insert into public.trusted_devices (user_id, device_token_hash, label, expires_at, last_used_at)
  values (auth.uid(), encode(extensions.digest(p_token, 'sha256'), 'hex'), nullif(trim(coalesce(p_label, '')), ''), now() + make_interval(days => greatest(1, least(p_days, 90))), now())
  on conflict (user_id, device_token_hash)
  do update set expires_at = excluded.expires_at, last_used_at = now(), label = coalesce(excluded.label, public.trusted_devices.label)
  returning id into row_id;

  return row_id;
end;
$$;

grant execute on function public.trust_this_device(text, text, integer) to authenticated;

-- "Forget this device" from the account menu: revoke by the RAW TOKEN
-- stored in this browser, so the UI doesn't need to already know the row's
-- id. Same ownership check as revoke_trusted_device (only ever the
-- caller's own row).
create or replace function public.revoke_device_by_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.trusted_devices
  where user_id = auth.uid()
    and device_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

grant execute on function public.revoke_device_by_token(text) to authenticated;

-- Called on sign-in with whatever token (if any) is stored client-side for
-- this browser. Returns true only for a live (unexpired), hash-matching
-- row owned by the CURRENTLY signed-in user — an expired row, a foreign
-- user's row, or a non-matching token all return false, never an error
-- that would leak which case it was. Touches last_used_at on a match, for
-- the account-menu device list.
create or replace function public.is_device_trusted(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_id uuid;
begin
  if auth.uid() is null or p_token is null or length(p_token) < 32 then
    return false;
  end if;

  update public.trusted_devices
    set last_used_at = now()
    where user_id = auth.uid()
      and device_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and expires_at > now()
    returning id into matched_id;

  return matched_id is not null;
end;
$$;

grant execute on function public.is_device_trusted(text) to authenticated;

-- "Forget this device" — revoke one, by row id, only if it's the caller's own.
create or replace function public.revoke_trusted_device(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.trusted_devices where id = p_id and user_id = auth.uid();
$$;

grant execute on function public.revoke_trusted_device(uuid) to authenticated;

-- "Sign out other devices" — revoke every trusted-device record for the
-- caller (their own current session is unaffected; this only clears the
-- MFA-skip trust, it does not sign anyone out of an active session).
create or replace function public.revoke_all_trusted_devices()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.trusted_devices where user_id = auth.uid();
$$;

grant execute on function public.revoke_all_trusted_devices() to authenticated;

-- Housekeeping: nothing reads expired rows as valid (is_device_trusted
-- already excludes them), but they'd otherwise accumulate forever.
-- scripts/compliance-retention.mjs (service-role, bypasses RLS same as its
-- other jobs) deletes rows more than a day past expires_at on its existing
-- daily schedule — no new function or workflow needed for this.

-- Registered in the central retention registry (0015_compliance.sql), same
-- as every other automatically-deleted data type — scripts/compliance-
-- retention.mjs now also purges this table on its existing daily schedule,
-- no new workflow needed.
insert into public.retention_schedule (data_type, description, retention_period, action_on_expiry, owner_job)
values ('Trusted device records', 'trusted_devices — "remember this device" MFA-skip tokens (hashed, never plaintext)', '30 days (configurable per trust_this_device call), purged 1 day after expiry', 'delete', 'scripts/compliance-retention.mjs')
on conflict (data_type) do nothing;
