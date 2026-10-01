-- Run via `supabase test db`. Covers 0075 (safeguarding auto-review, masked
-- audit-log viewer) and 0076 (retention rules dry-run/run, data export log):
-- reviews open exactly once per trigger and only the Safeguarding Lead /
-- Headteacher can ever see or work them (Admin, teachers, reporters cannot);
-- the audit viewer never shows content and sensitive audit rows are not
-- directly readable; retention only acts on a reviewed list and redacts audit.
begin;
select plan(44);

insert into auth.users (id, email) values
  ('a7000000-0000-0000-0000-000000000001', 'ht7@example.com'),
  ('a7000000-0000-0000-0000-000000000002', 'admin7@example.com'),
  ('a7000000-0000-0000-0000-000000000003', 'teacher7@example.com'),
  ('a7000000-0000-0000-0000-000000000004', 'sglead7@example.com'),
  ('a7000000-0000-0000-0000-000000000005', 'parent7@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('a7000000-0000-0000-0000-000000000001', 'admin', 'HT Seven', 'ht7@example.com'),
  ('a7000000-0000-0000-0000-000000000002', 'admin', 'Admin Seven', 'admin7@example.com'),
  ('a7000000-0000-0000-0000-000000000003', 'teacher', 'Teacher Seven', 'teacher7@example.com'),
  ('a7000000-0000-0000-0000-000000000004', 'teacher', 'Lead Seven', 'sglead7@example.com'),
  ('a7000000-0000-0000-0000-000000000005', 'parent', 'Parent Seven', 'parent7@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a7000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a7000000-0000-0000-0000-000000000002', 'admin', 'none', null),
  ('a7000000-0000-0000-0000-000000000003', 'teacher', 'none', null),
  ('a7000000-0000-0000-0000-000000000004', 'teacher', 'none', null),
  ('a7000000-0000-0000-0000-000000000005', 'parent', 'none', null);

insert into public.user_permissions (user_id, permission) values
  ('a7000000-0000-0000-0000-000000000004', 'safeguarding_lead');

insert into public.children (id, parent_user_id, name, dob, is_test) values
  ('b7000000-0000-0000-0000-00000000000a', 'a7000000-0000-0000-0000-000000000005', 'TEST Child A', '2015-01-01', true),
  ('b7000000-0000-0000-0000-00000000000b', 'a7000000-0000-0000-0000-000000000005', 'TEST Child B', '2016-01-01', true),
  ('b7000000-0000-0000-0000-00000000000c', 'a7000000-0000-0000-0000-000000000005', 'TEST Child C', '2017-01-01', true);

set local role authenticated;

-- ── repeat rule: the second concern about one child opens ONE review ──────
set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000005", "iat": 999999999}';
select lives_ok(
  $$insert into public.safeguarding_concerns (id, child_id, reported_by, reported_by_role, summary) values ('c7000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-00000000000a', 'a7000000-0000-0000-0000-000000000005', 'parent', 'TEST - first concern text')$$,
  'a parent can still report a concern (the review trigger runs as owner)'
);
select lives_ok(
  $$insert into public.safeguarding_concerns (id, child_id, reported_by, reported_by_role, summary) values ('c7000000-0000-0000-0000-000000000002', 'b7000000-0000-0000-0000-00000000000a', 'a7000000-0000-0000-0000-000000000005', 'parent', 'TEST - second concern text')$$,
  'a second concern about the same child is accepted'
);
select is_empty(
  $$select 1 from public.safeguarding_reviews$$,
  'the reporting parent cannot see review items'
);

set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000004", "iat": 999999999}';
select is((select count(*)::int from public.safeguarding_reviews), 1, 'two concerns in 30 days open exactly one review for the safeguarding lead');
select is((select rule from public.safeguarding_reviews limit 1), 'repeat_30d', 'the review records the 30-day repeat rule');
select is((select count(*)::int from public.safeguarding_review_queue()), 1, 'the queue RPC lists it for the safeguarding lead');

set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000002", "iat": 999999999}';
select is_empty($$select 1 from public.safeguarding_reviews$$, 'Admin cannot see review items');
select is((select count(*)::int from public.safeguarding_review_queue()), 0, 'the queue RPC is empty for Admin');

set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000003", "iat": 999999999}';
select is_empty($$select 1 from public.safeguarding_reviews$$, 'a plain teacher cannot see review items');
select lives_ok($$update public.safeguarding_reviews set notes = 'tampered'$$, 'a plain teacher update is a silent no-op under RLS');

set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000001", "iat": 999999999}';
select is((select count(*)::int from public.safeguarding_reviews), 1, 'the Headteacher sees the review item');
select is((select count(*)::int from public.safeguarding_reviews where notes = 'tampered'), 0, 'the teacher update changed nothing');

-- ── idempotency ───────────────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000005", "iat": 999999999}';
select lives_ok(
  $$insert into public.safeguarding_concerns (id, child_id, reported_by, reported_by_role, summary) values ('c7000000-0000-0000-0000-000000000003', 'b7000000-0000-0000-0000-00000000000a', 'a7000000-0000-0000-0000-000000000005', 'parent', 'TEST - third concern text')$$,
  'a third concern is accepted'
);
select lives_ok(
  $$insert into public.safeguarding_concerns (id, child_id, reported_by, reported_by_role, summary) values ('c7000000-0000-0000-0000-000000000004', 'b7000000-0000-0000-0000-00000000000b', 'a7000000-0000-0000-0000-000000000005', 'parent', 'TEST - only concern for child B')$$,
  'a single concern for another child is accepted'
);
set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000001", "iat": 999999999}';
select is((select count(*)::int from public.safeguarding_reviews where child_id = 'b7000000-0000-0000-0000-00000000000a'), 1, 'a further concern while a review is open does not duplicate it');
select is((select count(*)::int from public.safeguarding_reviews where child_id = 'b7000000-0000-0000-0000-00000000000b'), 0, 'one concern alone never opens a review');

-- ── time-based rule, run by the scheduled job (service role / owner) ──────
reset role;
insert into public.safeguarding_concerns (id, child_id, subject_description, severity, status, summary, created_at)
values ('c7000000-0000-0000-0000-000000000005', 'b7000000-0000-0000-0000-00000000000c', 'TEST - serious subject', 'urgent', 'open', 'TEST - serious concern text', now() - interval '2 days');
select is(public.safeguarding_run_review_check(), 1, 'the sweep opens a review for a serious concern open over 24 hours');
select is(public.safeguarding_run_review_check(), 0, 'running the sweep again opens nothing (idempotent)');
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000005", "iat": 999999999}';
select throws_ok($$select public.safeguarding_run_review_check()$$, '42501', null, 'no signed-in user can run the sweep');
set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000001", "iat": 999999999}';
select is((select count(*)::int from public.safeguarding_reviews where rule = 'serious_open_24h'), 1, 'the serious-concern review is visible to the Headteacher');

-- ── completing a review ───────────────────────────────────────────────────
select throws_ok(
  $$update public.safeguarding_reviews set status = 'completed' where child_id = 'b7000000-0000-0000-0000-00000000000a'$$,
  '23514', null, 'a review cannot be completed without a decision'
);
select throws_ok(
  $$update public.safeguarding_reviews set status = 'completed', decision = 'monitor' where child_id = 'b7000000-0000-0000-0000-00000000000a'$$,
  '23514', null, 'a review cannot be completed with an unticked checklist'
);
select lives_ok(
  $$update public.safeguarding_reviews
      set status = 'completed', decision = 'monitor', outcome = 'TEST outcome', notes = 'TEST notes',
          checklist = (select jsonb_agg(jsonb_set(e, '{done}', 'true'::jsonb)) from jsonb_array_elements(checklist) e)
    where child_id = 'b7000000-0000-0000-0000-00000000000a'$$,
  'the Headteacher can complete a fully ticked review with a decision'
);
select is(
  (select reviewed_by from public.safeguarding_reviews where child_id = 'b7000000-0000-0000-0000-00000000000a'),
  'a7000000-0000-0000-0000-000000000001'::uuid,
  'the reviewer is stamped from the signed-in user'
);
select throws_ok(
  $$update public.safeguarding_reviews set notes = 'edited later' where child_id = 'b7000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'a completed review is frozen'
);

-- ── audit viewer: masked ──────────────────────────────────────────────────
select isnt_empty(
  $$select 1 from public.audit_log_search(null, 'safeguarding_concerns', null, null, null, 25, 0) where masked$$,
  'safeguarding audit rows appear in the viewer, flagged as masked'
);
select is(
  (select count(*)::int from public.audit_log_search(null, 'safeguarding_concerns', null, null, null, 500, 0) where not masked or cardinality(changed_fields) > 0),
  0, 'masked rows expose no field names'
);
select is(
  (select count(*)::int from public.audit_log_search(null, null, null, null, null, 500, 0) where summary ilike '%TEST - %' or summary ilike '%TEST notes%'),
  0, 'no audit summary ever contains concern or review text'
);
select is_empty(
  $$select 1 from public.audit_log where target_table in ('safeguarding_concerns', 'safeguarding_reviews')$$,
  'even the Headteacher cannot read sensitive audit rows with a plain select'
);
set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000002", "iat": 999999999}';
select is_empty(
  $$select 1 from public.audit_log where target_table = 'safeguarding_concerns'$$,
  'Admin cannot read safeguarding audit rows with a plain select'
);
select lives_ok($$select * from public.audit_log_search(null, null, null, null, null, 25, 0)$$, 'Admin can use the audit viewer');
set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000003", "iat": 999999999}';
select throws_ok($$select * from public.audit_log_search()$$, '42501', null, 'a teacher cannot use the audit viewer');

-- ── retention: dry run, confirmed run, audit redaction ────────────────────
reset role;
insert into public.quiz_leads (id, lead_ref, email, consent_given_at, consent_text, created_at)
values ('d7000000-0000-0000-0000-000000000001', 'TEST-LEAD-1', 'old-lead@example.com', now() - interval '2 years', 'TEST consent', now() - interval '2 years');
set local role authenticated;

set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000003", "iat": 999999999}';
select throws_ok($$select * from public.retention_preview()$$, '42501', null, 'a teacher cannot see the retention dry run');
select is_empty($$select 1 from public.retention_rules$$, 'a teacher cannot read retention rules');

set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000002", "iat": 999999999}';
select is((select count(*)::int from public.retention_preview() where category = 'quiz_leads'), 1, 'the dry run lists the expired quiz lead');
select throws_ok($$select public.retention_run('quiz_leads', 5)$$, 'P0001', null, 'a run is refused when the reviewed count no longer matches');
select is(public.retention_run('quiz_leads', 1), 1, 'a run with the reviewed count removes exactly that record');
select is((select count(*)::int from public.retention_preview() where category = 'quiz_leads'), 0, 'nothing is left due afterwards');

reset role;
select is((select count(*)::int from public.retention_job_runs where notes like 'Manual run by%'), 1, 'the run is logged in retention_job_runs');
select is((select count(*)::int from public.audit_log where action = 'RETENTION_RUN'), 1, 'the run is logged in the audit trail');
select is(
  (select count(*)::int from public.audit_log where target_table = 'quiz_leads' and changes ? 'new'),
  0, 'audit history of the removed record no longer holds its personal data'
);

-- ── exports: log is Headteacher/Admin only, bucket is private ─────────────
insert into public.data_export_log (subject_type, subject_label, storage_prefix, expires_at)
values ('pupil', 'TEST Child A', 'test-prefix', now() + interval '1 day');
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000001", "iat": 999999999}';
select is((select count(*)::int from public.data_export_log), 1, 'the Headteacher can read the export log');
set local "request.jwt.claims" to '{"sub": "a7000000-0000-0000-0000-000000000003", "iat": 999999999}';
select is_empty($$select 1 from public.data_export_log$$, 'a teacher cannot read the export log');
reset role;
select is((select public from storage.buckets where id = 'data-exports'), false, 'the data-exports bucket is private');

select * from finish();
rollback;
