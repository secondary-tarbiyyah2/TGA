-- Run via `supabase test db`. Covers 0084: the Parent PIN is exactly 6 digits;
-- an old-format PIN is flagged for re-set after one correct entry.
begin;
select plan(9);

insert into auth.users (id, email) values ('a8400000-0000-0000-0000-000000000001', 'pin-parent@example.com');
insert into public.profiles (id, role, full_name, email) values ('a8400000-0000-0000-0000-000000000001', 'parent', 'Pin Parent', 'pin-parent@example.com');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a8400000-0000-0000-0000-000000000001"}';

select is(public.my_pin_status(), 'none', 'no PIN yet -> none (UI forces creation)');
select throws_like($$select public.set_my_pin('1234')$$, '%exactly 6 digits%', '4 digits rejected');
select throws_like($$select public.set_my_pin('12345')$$, '%exactly 6 digits%', '5 digits rejected');
select throws_like($$select public.set_my_pin('1234567')$$, '%exactly 6 digits%', '7 digits rejected');
select lives_ok($$select public.set_my_pin('123456')$$, '6 digits accepted');
select is(public.my_pin_status(), 'ok', 'status ok after a 6-digit PIN');
select is(public.verify_my_pin('123456'), true, 'correct 6-digit PIN verifies');

-- Simulate a PIN created under the old 4-6 digit rule (table has no client access, so go via the owner role).
reset role;
update public.user_pins set pin_hash = extensions.crypt('4321', extensions.gen_salt('bf')) where user_id = 'a8400000-0000-0000-0000-000000000001';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a8400000-0000-0000-0000-000000000001"}';
select is(public.verify_my_pin('4321'), true, 'old 4-digit PIN still verifies once');
select is(public.my_pin_status(), 'reset', 'old-format PIN is flagged for re-set');

select * from finish();
rollback;
