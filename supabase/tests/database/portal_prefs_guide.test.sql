-- Run via `supabase test db`. Covers 0203: Portal guide progress is stored on
-- each person's own portal_prefs row, nobody else can read or set it, and it
-- stays a small object.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('a2030000-0000-0000-0000-000000000001', 'guide-head@example.com'),
  ('a2030000-0000-0000-0000-000000000002', 'guide-parent@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a2030000-0000-0000-0000-000000000001', 'staff', 'Guide Head', 'guide-head@example.com'),
  ('a2030000-0000-0000-0000-000000000002', 'parent', 'Guide Parent', 'guide-parent@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a2030000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a2030000-0000-0000-0000-000000000002', 'parent', 'none', null);

select has_column('public', 'portal_prefs', 'guide_progress', 'portal_prefs has guide_progress');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2030000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.portal_prefs (user_id, guide_progress) values ('a2030000-0000-0000-0000-000000000002', '{"learned": ["/family/dashboard"], "shown": [], "last": "/family/dashboard", "journeys": {"parent-week": 2}}')$$,
  'a parent saves their own guide progress'
);
select throws_ok(
  $$insert into public.portal_prefs (user_id, guide_progress) values ('a2030000-0000-0000-0000-000000000001', '{"learned": ["/admin/dashboard"]}')$$,
  '42501', null, 'nobody saves guide progress for someone else'
);
select throws_ok(
  $$update public.portal_prefs set guide_progress = '["not", "an", "object"]' where user_id = 'a2030000-0000-0000-0000-000000000002'$$,
  '23514', null, 'guide progress must be an object'
);

set local "request.jwt.claims" to '{"sub": "a2030000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.portal_prefs where user_id = 'a2030000-0000-0000-0000-000000000002'), 0, 'the Headteacher cannot read a parent''s guide progress');
select lives_ok(
  $$insert into public.portal_prefs (user_id, guide_progress) values ('a2030000-0000-0000-0000-000000000001', '{"learned": ["/admin/dashboard", "/admin/actions"], "journeys": {"head-morning": -1}}')$$,
  'staff save their own guide progress'
);

select * from finish();
rollback;
