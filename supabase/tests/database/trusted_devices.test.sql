-- Run via `supabase test db` (needs Docker — see SETUP.md). Covers
-- 0017_trusted_devices.sql ("remember this device" MFA-skip): a user can
-- only read/revoke their OWN trusted-device rows, an expired or
-- non-matching token is never accepted as valid, one user's token/id never
-- validates or revokes another user's row, and the raw hash column is
-- never selectable by a client even for the owner's own row.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-000000000001', 'alice@example.com'),
  ('e0000000-0000-0000-0000-000000000002', 'bob@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e0000000-0000-0000-0000-000000000001', 'parent', 'Alice', 'alice@example.com'),
  ('e0000000-0000-0000-0000-000000000002', 'parent', 'Bob', 'bob@example.com');

set local role authenticated;

-- Alice trusts a device with a real, long-enough random-looking token.
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$ select public.trust_this_device('alice-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Alice''s laptop', 30) $$,
  'alice can trust a device for herself'
);

select is(
  (select count(*)::int from public.trusted_devices),
  1,
  'alice sees exactly one trusted device row (her own)'
);

select is(
  (select label from public.trusted_devices limit 1),
  'Alice''s laptop',
  'alice can read her own device''s non-hash columns'
);

select throws_ok(
  $$ select device_token_hash from public.trusted_devices limit 1 $$,
  '42501',
  null,
  'a client can never select the device_token_hash column directly (column-level grant denies it), even for her own row'
);

select is(
  (select public.is_device_trusted('alice-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
  true,
  'the correct token for alice''s own device is accepted as trusted'
);

select is(
  (select public.is_device_trusted('wrong-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')),
  false,
  'a non-matching token is never accepted as trusted'
);

-- Captured while still impersonating alice (RLS's "read own" policy means
-- capturing this after switching to bob's claims would silently return
-- zero rows, not an error — the subquery below would just pass NULL to
-- revoke_trusted_device, and every assertion using it would pass
-- vacuously without actually testing anything).
create temporary table _test_alice_device as
  select id from public.trusted_devices where user_id = 'e0000000-0000-0000-0000-000000000001' limit 1;

-- Bob: cannot see Alice's row, and Alice's token never validates for Bob's
-- session even though it's a live, correctly-hashed row (just owned by
-- someone else).
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.trusted_devices),
  0,
  'bob sees no trusted device rows (alice''s is not his)'
);
select is(
  (select public.is_device_trusted('alice-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
  false,
  'alice''s valid device token is never accepted as trusted when the caller is bob'
);

-- Bob cannot revoke Alice's device by guessing/knowing its id.
select lives_ok(
  $$ select public.revoke_trusted_device((select id from _test_alice_device)) $$,
  'revoke_trusted_device does not error even for a foreign id (it silently no-ops)'
);
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.trusted_devices),
  1,
  'bob''s attempted revoke of alice''s device id had no effect — alice''s row is still there'
);

-- Alice revokes her own device — it's actually gone.
select public.revoke_trusted_device((select id from _test_alice_device));
select is(
  (select count(*)::int from public.trusted_devices),
  0,
  'alice can revoke her own device, and it is actually removed'
);

-- An expired row (simulated directly, bypassing the 30-day default) is
-- never accepted as valid even though the token/hash still matches. This
-- row is seeded as the table owner (RLS has no INSERT policy at all for
-- `authenticated` — every real write goes through trust_this_device), then
-- checked back as alice.
reset role;
insert into public.trusted_devices (user_id, device_token_hash, expires_at)
values ('e0000000-0000-0000-0000-000000000001', encode(digest('expired-token-cccccccccccccccccccccccccccccc', 'sha256'), 'hex'), now() - interval '1 hour');
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000001"}';
select is(
  (select public.is_device_trusted('expired-token-cccccccccccccccccccccccccccccc')),
  false,
  'an expired trusted-device row is never accepted as valid'
);

select finish();
rollback;
