-- Run via `supabase test db`. Covers Tafweed T28 (migration 0186):
--  * the Headteacher can give a member of staff the SENCo role;
--  * a SENCo account reads and writes SEND records for every pupil, adds
--    document links and sees the change log;
--  * a pupil's teacher reads only the active plan and its targets (the
--    support notes), never documents, the register or the log, and can't edit;
--  * a teacher of another class sees nothing;
--  * a parent never sees the register, documents or the log (their own
--    child's shared plan stays readable, as before);
--  * every change is logged.
begin;
select plan(26);

insert into auth.users (id, email) values
  ('e2800000-0000-0000-0000-000000000001', 'head-t28@example.com'),
  ('e2800000-0000-0000-0000-000000000002', 'senco-t28@example.com'),
  ('e2800000-0000-0000-0000-000000000003', 'teacher-t28@example.com'),
  ('e2800000-0000-0000-0000-000000000004', 'other-teacher-t28@example.com'),
  ('e2800000-0000-0000-0000-000000000005', 'parent-t28@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e2800000-0000-0000-0000-000000000001', 'admin', 'Head T28', 'head-t28@example.com'),
  ('e2800000-0000-0000-0000-000000000002', 'teacher', 'Senco T28', 'senco-t28@example.com'),
  ('e2800000-0000-0000-0000-000000000003', 'teacher', 'Teacher T28', 'teacher-t28@example.com'),
  ('e2800000-0000-0000-0000-000000000004', 'teacher', 'Other Teacher T28', 'other-teacher-t28@example.com'),
  ('e2800000-0000-0000-0000-000000000005', 'parent', 'Parent T28', 'parent-t28@example.com');

insert into public.year_groups (id, name) values ('f2800000-0000-0000-0000-000000000001', 'TEST Year 8 t28');
insert into public.classes (id, name, year_group, year_group_id) values
  ('f2800000-0000-0000-0000-000000000002', 'TEST English t28', 'TEST Year 8 t28', 'f2800000-0000-0000-0000-000000000001'),
  ('f2800000-0000-0000-0000-000000000003', 'TEST Science t28', 'TEST Year 8 t28', 'f2800000-0000-0000-0000-000000000001');

-- The future SENCo starts as a teaching assistant, then the Headteacher
-- changes their role to SENCo.
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e2800000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e2800000-0000-0000-0000-000000000002', 'teaching_assistant_cover', 'none', null),
  ('e2800000-0000-0000-0000-000000000003', 'teacher', 'class', 'f2800000-0000-0000-0000-000000000002'),
  ('e2800000-0000-0000-0000-000000000004', 'teacher', 'class', 'f2800000-0000-0000-0000-000000000003'),
  ('e2800000-0000-0000-0000-000000000005', 'parent', 'none', null);

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f2800000-0000-0000-0000-000000000004', 'e2800000-0000-0000-0000-000000000005', 'Pupil T28', '2013-03-03', 'f2800000-0000-0000-0000-000000000001', false);
insert into public.enrolments (class_id, child_id) values
  ('f2800000-0000-0000-0000-000000000002', 'f2800000-0000-0000-0000-000000000004');

set local role authenticated;

-- ── the Headteacher names the SENCo ─────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e2800000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$select public.admin_set_staff_roles('e2800000-0000-0000-0000-000000000002', array['senco'])$$,
  'the Headteacher can give a member of staff the SENCo role'
);
select is(
  (select array_agg(role::text) from public.user_roles where user_id = 'e2800000-0000-0000-0000-000000000002'),
  array['senco'],
  'the account now holds the SENCo role'
);
select ok(public.is_staff_member('e2800000-0000-0000-0000-000000000002'), 'a SENCo counts as a member of staff');

-- ── the SENCo keeps the register ────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e2800000-0000-0000-0000-000000000002"}';
select ok(public.send_can_manage(), 'the SENCo role may manage SEND records');
select lives_ok(
  $$insert into public.send_support_plans (id, child_id, status, needs_summary)
    values ('f2800000-0000-0000-0000-000000000010', 'f2800000-0000-0000-0000-000000000004', 'draft', 'Needs time to process instructions')$$,
  'the SENCo can start a plan for any pupil'
);
select lives_ok(
  $$update public.send_support_plans set status = 'active', primary_need = 'cognition_learning', next_review_due = current_date + 30
    where id = 'f2800000-0000-0000-0000-000000000010'$$,
  'the SENCo can edit the plan'
);
select is((select status from public.send_support_plans where id = 'f2800000-0000-0000-0000-000000000010'), 'active', 'the edit is saved');
select lives_ok(
  $$insert into public.send_plan_targets (plan_id, target) values ('f2800000-0000-0000-0000-000000000010', 'Starts tasks within two minutes')$$,
  'the SENCo can add a target'
);
select lives_ok(
  $$insert into public.send_plan_documents (id, plan_id, title, kind, url)
    values ('f2800000-0000-0000-0000-000000000011', 'f2800000-0000-0000-0000-000000000010', 'Speech and language report', 'professional_report', 'https://example.sharepoint.com/sites/send/report.pdf')$$,
  'the SENCo can add a document link'
);
select is((select count(*)::int from public.send_register() where child_id = 'f2800000-0000-0000-0000-000000000004'), 1, 'the pupil is on the SENCo''s register');
select is((select count(*)::int from public.send_pupil_options() where child_id = 'f2800000-0000-0000-0000-000000000004'), 1, 'the SENCo can pick any pupil to add');
select ok(
  (select count(*)::int from public.send_change_log('f2800000-0000-0000-0000-000000000004')) >= 4,
  'every change (plan added, plan edited, target, document) is in the change log'
);
select ok(
  exists (select 1 from public.send_change_log('f2800000-0000-0000-0000-000000000004') l where l.action = 'update' and 'status' = any(l.fields) and l.actor_name = 'Senco T28'),
  'the log names who changed which field'
);
select throws_ok(
  $$select public.admin_set_staff_roles('e2800000-0000-0000-0000-000000000003', array['senco'])$$,
  '42501', null, 'a SENCo cannot change staff roles'
);

-- ── the pupil's teacher: support notes only ─────────────────────────────
set local "request.jwt.claims" to '{"sub": "e2800000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.send_support_plans where child_id = 'f2800000-0000-0000-0000-000000000004'), 1, 'the pupil''s teacher reads the active plan');
select is((select count(*)::int from public.send_plan_targets where plan_id = 'f2800000-0000-0000-0000-000000000010'), 1, 'the pupil''s teacher reads its targets');
select is((select count(*)::int from public.send_plan_documents), 0, 'a teacher cannot see SEND documents');
select is((select count(*)::int from public.send_register()), 0, 'a teacher does not get the register');
update public.send_support_plans set needs_summary = 'Changed by a teacher' where id = 'f2800000-0000-0000-0000-000000000010';
select is((select count(*)::int from public.send_support_plans where needs_summary = 'Changed by a teacher'), 0, 'a teacher cannot edit a plan');
select throws_ok($$select * from public.send_change_log()$$, '42501', null, 'a teacher cannot read the change log');

-- ── a teacher of another class ──────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e2800000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.send_support_plans), 0, 'a teacher who doesn''t teach the pupil sees no plan');

-- ── the parent ──────────────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e2800000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.send_register()), 0, 'a parent never gets the register');
select is((select count(*)::int from public.send_pupil_options()), 0, 'a parent gets no pupil list');
select is((select count(*)::int from public.send_plan_documents), 0, 'a parent cannot see SEND documents');
select throws_ok($$select * from public.send_change_log()$$, '42501', null, 'a parent cannot read the change log');
select throws_ok(
  $$insert into public.send_plan_documents (plan_id, title, url) values ('f2800000-0000-0000-0000-000000000010', 'Mine', 'https://example.com/x')$$,
  '42501', null, 'a parent cannot add a document'
);

select * from finish();
rollback;
