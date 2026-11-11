-- Run via `supabase test db`. Covers Tafweed T52 (migration 0218):
--  * the Headteacher can give a member of staff the Digital Lead role, and take it away;
--  * a Digital Lead reads the audit log through the masked viewer, its
--    filters, the accounts and sign-in review, and the record of reviews;
--  * a Digital Lead cannot write to the audit log, has no direct read of it,
--    cannot change roles, cannot edit or delete a review, and cannot reach
--    safeguarding records or money;
--  * an ordinary teacher still cannot read any of it;
--  * recording a review is itself in the audit log.
begin;
select plan(38);

insert into auth.users (id, email) values
  ('d5200000-0000-0000-0000-000000000001', 'head-t52@example.com'),
  ('d5200000-0000-0000-0000-000000000002', 'digital-t52@example.com'),
  ('d5200000-0000-0000-0000-000000000003', 'teacher-t52@example.com'),
  ('d5200000-0000-0000-0000-000000000004', 'parent-t52@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('d5200000-0000-0000-0000-000000000001', 'admin', 'Head T52', 'head-t52@example.com'),
  ('d5200000-0000-0000-0000-000000000002', 'teacher', 'Digital Lead T52', 'digital-t52@example.com'),
  ('d5200000-0000-0000-0000-000000000003', 'teacher', 'Teacher T52', 'teacher-t52@example.com'),
  ('d5200000-0000-0000-0000-000000000004', 'parent', 'Parent T52', 'parent-t52@example.com');

-- The future Digital Lead starts as a teaching assistant.
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('d5200000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('d5200000-0000-0000-0000-000000000002', 'teaching_assistant_cover', 'none', null),
  ('d5200000-0000-0000-0000-000000000003', 'teacher', 'none', null),
  ('d5200000-0000-0000-0000-000000000004', 'parent', 'none', null);

-- Something to find in the log: an ordinary change and a restricted one.
insert into public.audit_log (actor_email, action, target_table, target_id, changes) values
  ('head-t52@example.com', 'UPDATE', 'site_settings', 't52-1', '{"old": {"status": "a"}, "new": {"status": "b"}}'),
  ('head-t52@example.com', 'UPDATE', 'safeguarding_concerns', 't52-2', '{"old": {"summary": "T52 secret words"}, "new": {"summary": "T52 secret words, later"}}');

-- Sign-in attempts: three failures and one success for the teacher.
insert into public.login_attempts (email, ip_hash, success) values
  ('teacher-t52@example.com', 'net-a', false),
  ('teacher-t52@example.com', 'net-a', false),
  ('teacher-t52@example.com', 'net-b', false),
  ('teacher-t52@example.com', 'net-a', true);

-- Records the Digital Lead must not reach.
insert into public.fee_charges (id, parent_user_id, description, amount, due_date)
values ('d5200000-0000-0000-0000-0000000000c1', 'd5200000-0000-0000-0000-000000000004', 'TEST T52 charge', 100, '2027-01-08');
insert into public.safeguarding_concerns (id, reported_by, reported_by_role, subject_description, summary)
values ('d5200000-0000-0000-0000-0000000000a1', 'd5200000-0000-0000-0000-000000000003', 'teacher', 'TEST T52 subject', 'TEST T52 concern');

set local role authenticated;

-- ── the Headteacher names the Digital Lead ──────────────────────────────
set local "request.jwt.claims" to '{"sub": "d5200000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$select public.admin_set_staff_roles('d5200000-0000-0000-0000-000000000002', array['digital_lead'])$$,
  'the Headteacher can give a member of staff the Digital Lead role'
);
select is(
  (select array_agg(role::text) from public.user_roles where user_id = 'd5200000-0000-0000-0000-000000000002'),
  array['digital_lead'],
  'the account now holds only the Digital Lead role'
);
select ok(public.is_staff_member('d5200000-0000-0000-0000-000000000002'), 'a Digital Lead counts as a member of staff');
select ok(
  exists (select 1 from public.admin_staff_directory() d where d.user_id = 'd5200000-0000-0000-0000-000000000002' and 'digital_lead' = any(d.roles)),
  'the staff list shows the Digital Lead'
);

-- ── the Digital Lead reads the log ──────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "d5200000-0000-0000-0000-000000000002"}';
select ok(public.can_review_audit_log(), 'the Digital Lead may review the audit log');
select ok((select count(*) from public.audit_log_search()) >= 2, 'the Digital Lead reads the audit log through the viewer');
select ok(
  exists (select 1 from public.audit_log_search(p_table => 'site_settings') s where s.target_id = 't52-1' and not s.masked),
  'an ordinary change is shown'
);
select ok(
  (select bool_and(s.masked and s.summary not like '%secret%') from public.audit_log_search(p_table => 'safeguarding_concerns') s),
  'restricted records stay masked for the Digital Lead'
);
select lives_ok($$select * from public.audit_log_facets()$$, 'the Digital Lead gets the filter lists');
select lives_ok($$select public.audit_log_record_export(2, '{}'::jsonb)$$, 'the Digital Lead can export, and the export is logged');
select is((select count(*)::int from public.audit_log), 0, 'the Digital Lead has no direct read of the audit log table');
select throws_ok(
  $$insert into public.audit_log (action, target_table) values ('FAKE', 'site_settings')$$,
  '42501', null, 'the Digital Lead cannot write to the audit log'
);
do $$ begin
  begin delete from public.audit_log; exception when insufficient_privilege then null; end;
  begin update public.audit_log set action = 'CHANGED'; exception when insufficient_privilege then null; end;
end $$;
select ok(
  exists (select 1 from public.audit_log_search(p_table => 'site_settings') s where s.target_id = 't52-1' and s.action = 'UPDATE'),
  'the Digital Lead cannot delete or change audit entries'
);

-- ── accounts and sign-ins ───────────────────────────────────────────────
select ok(
  exists (select 1 from public.access_review_accounts() a where a.user_id = 'd5200000-0000-0000-0000-000000000003' and a.roles = array['teacher']),
  'the Digital Lead sees staff accounts with their roles'
);
select ok(
  not exists (select 1 from public.access_review_accounts() a where a.user_id = 'd5200000-0000-0000-0000-000000000004'),
  'family accounts are not listed by name'
);
select ok(
  (select accounts from public.access_review_counts() where kind = 'parent') >= 1,
  'family accounts are counted'
);
select is(
  (select failed from public.access_review_sign_ins(30) where email = 'teacher-t52@example.com'),
  3,
  'failed sign-ins are counted per email'
);
select is(
  (select networks from public.access_review_sign_ins(30) where email = 'teacher-t52@example.com'),
  2,
  'networks are counted, never shown'
);

-- ── the record of reviews ───────────────────────────────────────────────
select lives_ok(
  $$insert into public.digital_reviews (id, review_date, kind, checked, findings, actions)
    values ('d5200000-0000-0000-0000-0000000000b1', current_date, 'monthly', 'Audit log for October; staff accounts', 'Nothing unusual', 'None')$$,
  'the Digital Lead can record a review'
);
select is(
  (select reviewer_name from public.digital_review_list() where id = 'd5200000-0000-0000-0000-0000000000b1'),
  'Digital Lead T52',
  'the review lists who did it'
);
select throws_ok(
  $$insert into public.digital_reviews (review_date, checked, findings, reviewed_by)
    values (current_date, 'x', 'y', 'd5200000-0000-0000-0000-000000000001')$$,
  '42501', null, 'a review cannot be recorded in someone else''s name'
);
select throws_ok(
  $$insert into public.digital_reviews (review_date, checked, findings) values (current_date + 30, 'x', 'y')$$,
  '23514', null, 'a review cannot be dated in the future'
);
do $$ begin
  begin update public.digital_reviews set findings = 'Changed later' where id = 'd5200000-0000-0000-0000-0000000000b1'; exception when insufficient_privilege then null; end;
  begin delete from public.digital_reviews where id = 'd5200000-0000-0000-0000-0000000000b1'; exception when insufficient_privilege then null; end;
end $$;
select is(
  (select findings from public.digital_reviews where id = 'd5200000-0000-0000-0000-0000000000b1'),
  'Nothing unusual',
  'a review cannot be edited or deleted'
);
select ok(
  exists (select 1 from public.audit_log_search(p_table => 'digital_reviews') s where s.target_id = 'd5200000-0000-0000-0000-0000000000b1' and s.action = 'INSERT' and s.masked),
  'recording a review is in the audit log, with its content restricted'
);

-- ── and nothing else ────────────────────────────────────────────────────
select throws_ok(
  $$select public.admin_set_staff_roles('d5200000-0000-0000-0000-000000000003', array['admin'])$$,
  '42501', null, 'the Digital Lead cannot change anyone''s roles'
);
select is((select count(*)::int from public.safeguarding_concerns), 0, 'the Digital Lead cannot read safeguarding concerns');
select is((select count(*)::int from public.fee_charges), 0, 'the Digital Lead cannot read fees');
select throws_ok(
  $$insert into public.fee_payments (charge_id, amount, method) values ('d5200000-0000-0000-0000-0000000000c1', 10, 'cash')$$,
  '42501', null, 'the Digital Lead cannot record a payment'
);

-- ── an ordinary teacher ─────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "d5200000-0000-0000-0000-000000000003"}';
select ok(not public.can_review_audit_log(), 'a teacher may not review the audit log');
select throws_ok($$select * from public.audit_log_search()$$, '42501', null, 'a teacher still cannot read the audit log');
select throws_ok($$select * from public.access_review_accounts()$$, '42501', null, 'a teacher cannot review accounts');
select throws_ok($$select * from public.access_review_sign_ins(30)$$, '42501', null, 'a teacher cannot review sign-ins');
select throws_ok($$select * from public.digital_review_list()$$, '42501', null, 'a teacher cannot read the record of reviews');
select is((select count(*)::int from public.digital_reviews), 0, 'a teacher sees no reviews in the table');
select throws_ok(
  $$insert into public.digital_reviews (review_date, checked, findings) values (current_date, 'x', 'y')$$,
  '42501', null, 'a teacher cannot record a review'
);

-- ── the Headteacher reads the record, then takes the role away ──────────
set local "request.jwt.claims" to '{"sub": "d5200000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.digital_review_list() where id = 'd5200000-0000-0000-0000-0000000000b1'), 1, 'the Headteacher reads the record of reviews');
select lives_ok(
  $$select public.admin_set_staff_roles('d5200000-0000-0000-0000-000000000002', array['teaching_assistant_cover'])$$,
  'the Headteacher can remove the Digital Lead role'
);
set local "request.jwt.claims" to '{"sub": "d5200000-0000-0000-0000-000000000002"}';
select throws_ok($$select * from public.audit_log_search()$$, '42501', null, 'without the role the audit log is closed again');

select * from finish();
rollback;
