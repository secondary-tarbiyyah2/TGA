-- Run via `supabase test db`. Covers 0015_compliance.sql RLS — the most
-- safeguarding-sensitive migration in the app, so the safeguarding-log
-- restriction gets the same rigor Phase C's messaging_rls.test.sql gave
-- the no-teacher-student-messaging constraint: every role that must be
-- blocked is explicitly proven blocked, not just assumed from reading the
-- policy.
begin;
select plan(26);

insert into auth.users (id, email) values
  ('a5000000-0000-0000-0000-000000000001', 'ht5@example.com'),
  ('a5000000-0000-0000-0000-000000000002', 'admin5@example.com'),
  ('a5000000-0000-0000-0000-000000000003', 'teacher5@example.com'),
  ('a5000000-0000-0000-0000-000000000004', 'sglead5@example.com'),
  ('a5000000-0000-0000-0000-000000000005', 'parent5@example.com'),
  ('a5000000-0000-0000-0000-000000000006', 'student5@example.com'),
  ('a5000000-0000-0000-0000-000000000007', 'exporter5@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('a5000000-0000-0000-0000-000000000001', 'admin', 'HT Five', 'ht5@example.com'),
  ('a5000000-0000-0000-0000-000000000002', 'admin', 'Admin Five', 'admin5@example.com'),
  ('a5000000-0000-0000-0000-000000000003', 'teacher', 'Teacher Five', 'teacher5@example.com'),
  ('a5000000-0000-0000-0000-000000000004', 'teacher', 'Safeguarding Lead Five', 'sglead5@example.com'),
  ('a5000000-0000-0000-0000-000000000005', 'parent', 'Parent Five', 'parent5@example.com'),
  ('a5000000-0000-0000-0000-000000000006', 'student', 'Student Five', 'student5@example.com'),
  ('a5000000-0000-0000-0000-000000000007', 'teacher', 'Exporter Five', 'exporter5@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a5000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a5000000-0000-0000-0000-000000000002', 'admin', 'none', null),
  ('a5000000-0000-0000-0000-000000000003', 'teacher', 'none', null),
  ('a5000000-0000-0000-0000-000000000004', 'teacher', 'none', null),
  ('a5000000-0000-0000-0000-000000000005', 'parent', 'none', null),
  ('a5000000-0000-0000-0000-000000000006', 'student', 'none', null),
  ('a5000000-0000-0000-0000-000000000007', 'teacher', 'none', null);

insert into public.user_permissions (user_id, permission) values
  ('a5000000-0000-0000-0000-000000000004', 'safeguarding_lead'),
  ('a5000000-0000-0000-0000-000000000007', 'can_export_data');

set local role authenticated;

-- ── reporting: every role can raise a concern ─────────────────────────────
set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000005", "iat": 999999999}';
select lives_ok(
  $$insert into public.safeguarding_concerns (id, reported_by, reported_by_role, subject_description, summary) values ('b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000005', 'parent', 'TEST - subject of concern', 'TEST - parent-reported concern')$$,
  'a parent can raise a safeguarding concern'
);

set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000006", "iat": 999999999}';
select lives_ok(
  $$insert into public.safeguarding_concerns (id, reported_by, reported_by_role, subject_description, summary) values ('b5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000006', 'student', 'TEST - subject of concern', 'TEST - student-reported concern')$$,
  'a student can raise a safeguarding concern'
);

set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000003", "iat": 999999999}';
select lives_ok(
  $$insert into public.safeguarding_concerns (id, reported_by, reported_by_role, subject_description, summary) values ('b5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000003', 'teacher', 'TEST - subject of concern', 'TEST - teacher-reported concern')$$,
  'a teacher can raise a safeguarding concern'
);

select throws_ok(
  $$insert into public.safeguarding_concerns (id, reported_by, reported_by_role, subject_description, summary) values ('b5000000-0000-0000-0000-000000000009', 'a5000000-0000-0000-0000-000000000005', 'teacher', 'TEST - subject of concern', 'TEST - spoofed reporter')$$,
  42501,
  null,
  'a caller cannot report a concern with someone else''s reported_by id'
);

-- ── the headline restriction: visible ONLY to safeguarding_lead +
-- head_teacher, and ONLY with a freshly-minted (MFA-re-checked) token ────

-- The reporter (a parent) cannot read back the concern they just filed —
-- deliberate per the brief: reporting does not grant ongoing visibility.
select is_empty(
  $$select 1 from public.safeguarding_concerns where id = 'b5000000-0000-0000-0000-000000000001'$$,
  'the reporting parent cannot read their own submitted concern back'
);

-- A plain teacher (not Safeguarding Lead) is blocked outright.
set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000003", "iat": 999999999}';
select is_empty(
  $$select 1 from public.safeguarding_concerns$$,
  'a plain teacher cannot read the safeguarding log at all'
);

-- Admin — NOT head_teacher — is blocked, per the brief's explicit carve-out
-- ("visible only to the Safeguarding Lead add-on and the Head Teacher",
-- unlike every other compliance table which is Admin-visible too).
set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000002", "iat": 999999999}';
select is_empty(
  $$select 1 from public.safeguarding_concerns$$,
  'plain Admin (not head_teacher, not safeguarding_lead) cannot read the safeguarding log'
);

-- can_export_data alone (not safeguarding_lead/head_teacher) is blocked —
-- the export permission does not imply safeguarding-log access.
set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000007", "iat": 999999999}';
select is_empty(
  $$select 1 from public.safeguarding_concerns$$,
  'can_export_data alone does not grant safeguarding-log access'
);

-- MFA (and with it the safeguarding log's extra "freshly re-checked token"
-- requirement) was removed app-wide at the user's explicit request —
-- current_token_fresh() now always returns true (0021_remove_mfa.sql), so a
-- Safeguarding Lead reads the log on role/permission alone, same as every
-- other compliance table. These two cases (stale iat, no iat at all) used
-- to prove the freshness gate was real at the RLS level; now they prove it
-- no longer blocks anything, which is the same fact from the other side.
set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000004", "iat": 1}';
select results_eq(
  $$select count(*)::int from public.safeguarding_concerns$$,
  $$values (3)$$,
  'Safeguarding Lead with a stale token can still read the safeguarding log (MFA removed)'
);

set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000004"}';
select results_eq(
  $$select count(*)::int from public.safeguarding_concerns$$,
  $$values (3)$$,
  'Safeguarding Lead with no iat claim at all can still read the safeguarding log (MFA removed)'
);

-- The Safeguarding Lead WITH a fresh token can read every concern,
-- regardless of who reported it or which child it's about. `set local`
-- only accepts a literal, so a computed (just-minted) "iat" is set via
-- set_config() instead — same effect, `is_local := true`.
select set_config('request.jwt.claims', json_build_object('sub', 'a5000000-0000-0000-0000-000000000004', 'iat', extract(epoch from now())::bigint)::text, true);
select results_eq(
  $$select count(*)::int from public.safeguarding_concerns$$,
  $$values (3)$$,
  'Safeguarding Lead with a FRESH token reads every safeguarding concern'
);

-- Head Teacher with a fresh token can also read every concern.
select set_config('request.jwt.claims', json_build_object('sub', 'a5000000-0000-0000-0000-000000000001', 'iat', extract(epoch from now())::bigint)::text, true);
select results_eq(
  $$select count(*)::int from public.safeguarding_concerns$$,
  $$values (3)$$,
  'Head Teacher with a fresh token reads every safeguarding concern'
);

-- Head Teacher (fresh token) can update a concern (classify/close it).
select lives_ok(
  $$update public.safeguarding_concerns set status = 'in_progress' where id = 'b5000000-0000-0000-0000-000000000001'$$,
  'Head Teacher with a fresh token can update a safeguarding concern'
);

-- ── chronology: append-only ────────────────────────────────────────────
select lives_ok(
  $$insert into public.safeguarding_chronology (concern_id, entry, entered_by) values ('b5000000-0000-0000-0000-000000000001', 'TEST - spoke to child, seemed fine', 'a5000000-0000-0000-0000-000000000001')$$,
  'Head Teacher with a fresh token can append a chronology entry'
);

-- Zero UPDATE/DELETE policy exists on safeguarding_chronology at all. With
-- RLS enabled and no policy for a command, Postgres doesn't raise an error
-- on UPDATE/DELETE — it silently matches zero rows (verified empirically
-- against this same Postgres instance, same as the header note in 0007 was
-- verified) — so the real proof is RETURNING nothing, not an exception.
select is_empty(
  $$update public.safeguarding_chronology set entry = 'TEST - edited after the fact' where concern_id = 'b5000000-0000-0000-0000-000000000001' returning 1$$,
  'a chronology entry cannot be edited after the fact — no UPDATE policy exists (0 rows match)'
);
select is_empty(
  $$delete from public.safeguarding_chronology where concern_id = 'b5000000-0000-0000-0000-000000000001' returning 1$$,
  'a chronology entry cannot be deleted — no DELETE policy exists (0 rows match)'
);
-- And the entry genuinely still reads back unchanged.
select results_eq(
  $$select entry from public.safeguarding_chronology where concern_id = 'b5000000-0000-0000-0000-000000000001'$$,
  $$values ('TEST - spoke to child, seemed fine'::text)$$,
  'the chronology entry is unchanged after the blocked update attempt'
);

-- A stale-token Safeguarding Lead can still read the chronology — MFA
-- freshness removed app-wide (0021_remove_mfa.sql), same as above.
set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000004", "iat": 1}';
select isnt_empty(
  $$select 1 from public.safeguarding_chronology$$,
  'stale-token Safeguarding Lead can still read the chronology (MFA removed)'
);

-- ── staff_vetting_records (Single Central Record): head_teacher/admin
-- only, not broadly staff-visible ─────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000001", "iat": 999999999}';
select lives_ok(
  $$insert into public.staff_vetting_records (user_id, dbs_check_date, dbs_certificate_reference, dbs_renewal_due, right_to_work_verified, right_to_work_document_type) values ('a5000000-0000-0000-0000-000000000003', '2024-01-01', 'TEST-001122334455', '2027-01-01', true, 'UK passport')$$,
  'Head Teacher can write an SCR entry for a teacher'
);

set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000003", "iat": 999999999}';
select is_empty(
  $$select 1 from public.staff_vetting_records$$,
  'a teacher cannot read the Single Central Record, including their own row'
);

set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000002", "iat": 999999999}';
select results_eq(
  $$select count(*)::int from public.staff_vetting_records$$,
  $$values (1)$$,
  'Admin can read the Single Central Record'
);

-- ── data_rights_requests ──────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000001", "iat": 999999999}';
select lives_ok(
  $$insert into public.data_rights_requests (id, request_type, requester_name, requester_email, subject_description) values ('c5000000-0000-0000-0000-000000000001', 'subject_access', 'TEST Requester', 'test-requester@example.com', 'TEST - former pupil')$$,
  'Head Teacher can log a data rights request'
);

set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000007", "iat": 999999999}';
select results_eq(
  $$select count(*)::int from public.data_rights_requests$$,
  $$values (1)$$,
  'can_export_data holder can read the data rights request queue'
);
select is_empty(
  $$update public.data_rights_requests set status = 'in_progress' where id = 'c5000000-0000-0000-0000-000000000001' returning 1$$,
  'can_export_data alone cannot action/update a data rights request (0 rows match)'
);

set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000003", "iat": 999999999}';
select is_empty(
  $$select 1 from public.data_rights_requests$$,
  'a plain teacher cannot see the data rights request queue at all'
);

-- ── audit_log: /learn head_teacher/admin can now read it too ─────────────
set local "request.jwt.claims" to '{"sub": "a5000000-0000-0000-0000-000000000001", "iat": 999999999}';
select isnt_empty(
  $$select 1 from public.audit_log limit 1$$,
  'a /learn Head Teacher can read audit_log via the new learn-role policy'
);

select * from finish();
rollback;
