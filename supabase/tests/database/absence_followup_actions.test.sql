-- Run via `supabase test db`. Covers 0209: the head teacher records a decision and a portal message on an
-- absence follow-up (stamped with who decided); a teacher still cannot change a follow-up.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('a2070000-0000-0000-0000-000000000001', 'af-head@example.com'),
  ('a2070000-0000-0000-0000-000000000002', 'af-teacher@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a2070000-0000-0000-0000-000000000001', 'admin', 'AF Head', 'af-head@example.com'),
  ('a2070000-0000-0000-0000-000000000002', 'teacher', 'AF Teacher', 'af-teacher@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a2070000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a2070000-0000-0000-0000-000000000002', 'teacher', 'none', null);
insert into public.children (id, name, dob, is_test) values ('a2070000-0000-0000-0000-0000000000d1', 'AF Pupil', '2015-01-01', true);
insert into public.absence_followups (id, child_id, absence_date) values ('a2070000-0000-0000-0000-0000000000f1', 'a2070000-0000-0000-0000-0000000000d1', '2026-11-10');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2070000-0000-0000-0000-000000000001"}';
select lives_ok($$update public.absence_followups set authorised = true where id = 'a2070000-0000-0000-0000-0000000000f1'$$, 'the head teacher marks an absence authorised');
select is((select decided_by from public.absence_followups where id = 'a2070000-0000-0000-0000-0000000000f1'), 'a2070000-0000-0000-0000-000000000001'::uuid, 'who decided is stamped');
select lives_ok($$insert into public.absence_followup_events (followup_id, kind, method, outcome, note) values ('a2070000-0000-0000-0000-0000000000f1', 'contact', 'message', 'other', 'Sent a portal message')$$, 'a portal message is a way of contacting the family');

set local "request.jwt.claims" to '{"sub": "a2070000-0000-0000-0000-000000000002"}';
update public.absence_followups set authorised = false where id = 'a2070000-0000-0000-0000-0000000000f1';
reset role;
select is((select authorised from public.absence_followups where id = 'a2070000-0000-0000-0000-0000000000f1'), true, 'a teacher cannot change the decision');
select throws_ok($$insert into public.absence_followup_events (followup_id, kind, method) values ('a2070000-0000-0000-0000-0000000000f1', 'contact', 'pigeon')$$, '23514', null, 'unknown contact methods are refused');

select * from finish();
rollback;
