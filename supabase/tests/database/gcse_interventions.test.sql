-- Run via `supabase test db`. Covers 0090: GCSE intervention flags (staff-only
-- working notes: who can raise, see and update them; parents never see them).
begin;
select plan(9);

insert into auth.users (id, email) values
  ('eb000000-0000-0000-0000-000000000001', 'ht-gi@example.com'),
  ('eb000000-0000-0000-0000-000000000002', 'teacher-gi1@example.com'),
  ('eb000000-0000-0000-0000-000000000003', 'teacher-gi2@example.com'),
  ('eb000000-0000-0000-0000-000000000004', 'parent-gi1@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('eb000000-0000-0000-0000-000000000001', 'admin', 'HT GI', 'ht-gi@example.com'),
  ('eb000000-0000-0000-0000-000000000002', 'teacher', 'Teacher GI1', 'teacher-gi1@example.com'),
  ('eb000000-0000-0000-0000-000000000003', 'teacher', 'Teacher GI2', 'teacher-gi2@example.com'),
  ('eb000000-0000-0000-0000-000000000004', 'parent', 'Parent GI1', 'parent-gi1@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('eb000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);

insert into public.year_groups (id, name) values ('fb000000-0000-0000-0000-000000000001', 'TEST Year 11 gi');
insert into public.subjects (id, name) values ('fb000000-0000-0000-0000-000000000002', 'TEST Maths gi');
insert into public.classes (id, name, year_group, year_group_id, subject_id) values
  ('fb000000-0000-0000-0000-000000000003', 'TEST Class A gi', 'TEST Year 11 gi', 'fb000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000002'),
  ('fb000000-0000-0000-0000-000000000004', 'TEST Class B gi', 'TEST Year 11 gi', 'fb000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000002');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('eb000000-0000-0000-0000-000000000002', 'teacher', 'class', 'fb000000-0000-0000-0000-000000000003'),
  ('eb000000-0000-0000-0000-000000000003', 'teacher', 'class', 'fb000000-0000-0000-0000-000000000004');
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('fb000000-0000-0000-0000-000000000005', 'eb000000-0000-0000-0000-000000000004', 'TEST Child GI1', '2010-01-01', 'fb000000-0000-0000-0000-000000000001', true);
insert into public.enrolments (class_id, child_id) values
  ('fb000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000005');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "eb000000-0000-0000-0000-000000000002"}';

select lives_ok(
  $$insert into public.gcse_interventions (child_id, subject_id, class_id, reason, owner_id, next_step) values ('fb000000-0000-0000-0000-000000000005', 'fb000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000003', 'Two grades below prediction', 'eb000000-0000-0000-0000-000000000002', 'Weekly past-paper practice')$$,
  'the class teacher can raise an intervention'
);
select is((select count(*)::int from public.gcse_interventions), 1, 'the class teacher sees it');

update public.gcse_interventions set status = 'resolved' where child_id = 'fb000000-0000-0000-0000-000000000005';
select is((select status from public.gcse_interventions limit 1), 'resolved', 'the class teacher can update the status');
select isnt((select resolved_at from public.gcse_interventions limit 1), null, 'resolving stamps resolved_at');

set local "request.jwt.claims" to '{"sub": "eb000000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$insert into public.gcse_interventions (child_id, subject_id, class_id, reason) values ('fb000000-0000-0000-0000-000000000005', 'fb000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000003', 'Not my class')$$,
  '42501',
  null,
  'a teacher of another class cannot raise one'
);
select is((select count(*)::int from public.gcse_interventions), 0, 'a teacher of another class sees none');

set local "request.jwt.claims" to '{"sub": "eb000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.gcse_interventions), 0, 'the parent never sees internal flags');

set local "request.jwt.claims" to '{"sub": "eb000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.gcse_interventions), 1, 'the head sees every intervention');
select throws_ok(
  $$insert into public.gcse_interventions (child_id, subject_id, class_id, reason) values ('fb000000-0000-0000-0000-000000000005', 'fb000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000003', '   ')$$,
  '23514',
  null,
  'a blank reason is refused'
);

select * from finish();
rollback;
