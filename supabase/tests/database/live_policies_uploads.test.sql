-- Run via `supabase test db`. Covers 0086_live_policies_signable_uploads.sql:
-- stable policy slugs (and that soft-deleted policies stay hidden from the
-- public), the version id of an uploaded document to sign, and who may read an
-- uploaded file.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('e8600000-0000-0000-0000-000000000001', 'ht-lp@example.com'),
  ('e8600000-0000-0000-0000-000000000003', 'parent-lp@example.com'),
  ('e8600000-0000-0000-0000-000000000004', 'student-lp@example.com'),
  ('e8600000-0000-0000-0000-000000000005', 'outsider-lp@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e8600000-0000-0000-0000-000000000001', 'admin', 'Hana Headteacher', 'ht-lp@example.com'),
  ('e8600000-0000-0000-0000-000000000003', 'parent', 'Pat Parent', 'parent-lp@example.com'),
  ('e8600000-0000-0000-0000-000000000004', 'student', 'Sam Student', 'student-lp@example.com'),
  ('e8600000-0000-0000-0000-000000000005', 'staff', 'Olly Outsider', 'outsider-lp@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e8600000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e8600000-0000-0000-0000-000000000003', 'parent', 'none', null),
  ('e8600000-0000-0000-0000-000000000004', 'student', 'none', null);

-- Slugs: derived from number + title, unique, soft-deleted rows stay private.
insert into public.policy_links (id, number, title, category, file_url) values
  ('f8600000-0000-0000-0000-000000000001', '99', 'Test Policy', 'published', '/policies/x.pdf');
insert into public.policy_links (id, number, title, category, file_url, deleted_at) values
  ('f8600000-0000-0000-0000-000000000002', '99', 'Test Policy', 'published', '/policies/x.pdf', now());
select is((select slug from public.policy_links where id = 'f8600000-0000-0000-0000-000000000001'), '99-test-policy', 'a new policy gets a slug from its number and title');
select is((select slug from public.policy_links where id = 'f8600000-0000-0000-0000-000000000002'), '99-test-policy-2', 'a clashing slug gets a numeric suffix');

-- An uploaded document to sign is versioned by its storage path.
insert into public.signable_documents (id, sanity_document_id, source, title, file_path, target_roles, requires_signature) values
  ('f8600000-0000-0000-0000-000000000011', 'portal:lp-test', 'portal', 'TEST uploaded agreement', 'lp/test.pdf', array['parent']::public.learn_role[], true);
select is((select current_asset_id from public.signable_documents where id = 'f8600000-0000-0000-0000-000000000011'), 'file:lp/test.pdf', 'an uploaded PDF is versioned by its storage path');

-- A website policy's signature record follows the policy, and replacing the
-- file (a new file_updated_at at the same address) is a new version.
-- Since 0108 the signature record is created automatically when the policy
-- is added (with its automatic audience); the test gives it a fixed id.
update public.signable_documents
  set id = 'f8600000-0000-0000-0000-000000000012', title = 'old title', requires_signature = true
  where sanity_document_id = 'policy:f8600000-0000-0000-0000-000000000001';
update public.policy_links set file_updated_at = '2026-01-01T00:00:00Z', title = 'Renamed Policy' where id = 'f8600000-0000-0000-0000-000000000001';
select is((select current_asset_id from public.signable_documents where id = 'f8600000-0000-0000-0000-000000000012'), '/policies/x.pdf?v=1767225600000', 'replacing a policy file makes a new version of its signature record');
select is((select title from public.signable_documents where id = 'f8600000-0000-0000-0000-000000000012'), '99. Renamed Policy', 'the signature record follows the policy title');

set local role anon;
set local "request.jwt.claims" to '{}';
select is((select count(*)::int from public.policy_links where number = '99'), 1, 'the public sees the live policy but not the removed one');

reset role;
set local role authenticated;

set local "request.jwt.claims" to '{"sub": "e8600000-0000-0000-0000-000000000003"}';
select ok(public.signable_file_readable('lp/test.pdf'), 'a parent can read a file they must sign');

set local "request.jwt.claims" to '{"sub": "e8600000-0000-0000-0000-000000000004"}';
select ok(not public.signable_file_readable('lp/test.pdf'), 'a student cannot read a parent-only document');

set local "request.jwt.claims" to '{"sub": "e8600000-0000-0000-0000-000000000005"}';
select ok(not public.signable_file_readable('lp/test.pdf'), 'someone with no role cannot read it');

set local "request.jwt.claims" to '{"sub": "e8600000-0000-0000-0000-000000000001"}';
select ok(public.signable_file_readable('lp/test.pdf'), 'the Headteacher can read every uploaded document');

reset role;
update public.signable_documents set requires_signature = false where id = 'f8600000-0000-0000-0000-000000000011';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e8600000-0000-0000-0000-000000000003"}';
select ok(not public.signable_file_readable('lp/test.pdf'), 'a parent loses access once the document no longer needs a signature');

select * from finish();
rollback;
