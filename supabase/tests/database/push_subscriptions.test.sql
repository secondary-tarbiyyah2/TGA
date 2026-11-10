-- Run via `supabase test db`. Covers 0199: a user can store and see only
-- their own devices' push subscriptions; anon can do nothing.
begin;
select plan(4);

insert into auth.users (id, email) values
  ('e9900000-0000-0000-0000-000000000001', 'push-a@example.com'),
  ('e9900000-0000-0000-0000-000000000002', 'push-b@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('e9900000-0000-0000-0000-000000000001', 'parent', 'Push A', 'push-a@example.com'),
  ('e9900000-0000-0000-0000-000000000002', 'parent', 'Push B', 'push-b@example.com');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e9900000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example.com/a1', 'key', 'secret')$$,
  'a user can store a subscription for their own device'
);
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('e9900000-0000-0000-0000-000000000002', 'https://push.example.com/b1', 'key', 'secret')$$,
  '42501', null, 'a user cannot store a subscription for someone else'
);

set local "request.jwt.claims" to '{"sub": "e9900000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.push_subscriptions), 0, 'another user cannot see it');
reset role;

set local role anon;
select throws_ok(
  $$select count(*) from public.push_subscriptions$$,
  '42501', null, 'anon cannot read subscriptions'
);

select * from finish();
rollback;
