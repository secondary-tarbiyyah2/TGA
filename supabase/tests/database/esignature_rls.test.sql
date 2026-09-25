-- Run via `supabase test db`. Covers 0014_esignature.sql RLS: signing as
-- self only, version pinning (a signature for a STALE asset id is
-- rejected), no edit/retract, own-history-only reads, and
-- can_export_data/head_teacher/admin compliance-wide read.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('e4000000-0000-0000-0000-000000000001', 'ht4@example.com'),
  ('e4000000-0000-0000-0000-000000000002', 'teacher-f@example.com'),
  ('e4000000-0000-0000-0000-000000000003', 'teacher-g@example.com'),
  ('e4000000-0000-0000-0000-000000000004', 'exporter@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e4000000-0000-0000-0000-000000000001', 'admin', 'HT Four', 'ht4@example.com'),
  ('e4000000-0000-0000-0000-000000000002', 'teacher', 'Teacher F', 'teacher-f@example.com'),
  ('e4000000-0000-0000-0000-000000000003', 'teacher', 'Teacher G', 'teacher-g@example.com'),
  ('e4000000-0000-0000-0000-000000000004', 'teacher', 'Exporter', 'exporter@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e4000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e4000000-0000-0000-0000-000000000002', 'teacher', 'none', null),
  ('e4000000-0000-0000-0000-000000000003', 'teacher', 'none', null);
insert into public.user_permissions (user_id, permission) values
  ('e4000000-0000-0000-0000-000000000004', 'can_export_data');

insert into public.signable_documents (id, sanity_document_id, title, target_roles, requires_signature, current_asset_id) values
  ('f4000000-0000-0000-0000-000000000001', 'test-policy-esig-1', 'TEST Safeguarding Policy', array['teacher', 'teaching_assistant_cover']::public.learn_role[], true, 'sanity-asset-v2');

set local role authenticated;

-- ── signing ────────────────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e4000000-0000-0000-0000-000000000002"}';
insert into public.document_signatures (id, document_id, asset_id_signed, signer_id, typed_full_name, affirmed) values
  ('f4000000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-000000000001', 'sanity-asset-v2', 'e4000000-0000-0000-0000-000000000002', 'Teacher F', true);
select is((select count(*)::int from public.document_signatures where id = 'f4000000-0000-0000-0000-000000000002'), 1, 'a teacher can sign a document targeted at their role, for the CURRENT asset version');

-- Cannot sign as someone else.
select throws_ok(
  $$insert into public.document_signatures (document_id, asset_id_signed, signer_id, typed_full_name, affirmed) values ('f4000000-0000-0000-0000-000000000001', 'sanity-asset-v2', 'e4000000-0000-0000-0000-000000000003', 'Teacher G', true)$$,
  42501,
  null,
  'a user cannot insert a signature on someone else''s behalf'
);

-- Cannot sign a STALE version (asset_id_signed must match current_asset_id).
select throws_ok(
  $$insert into public.document_signatures (document_id, asset_id_signed, signer_id, typed_full_name, affirmed) values ('f4000000-0000-0000-0000-000000000001', 'sanity-asset-v1-old', 'e4000000-0000-0000-0000-000000000003', 'Teacher G', true)$$,
  42501,
  null,
  'a signature naming a stale (non-current) asset id is rejected'
);

-- The checkbox must be affirmed — a row can never be stored with
-- affirmed=false, whether the RLS WITH CHECK or the column's own CHECK
-- constraint is what catches it first (Postgres evaluates both as part of
-- the same INSERT; either is a correct rejection).
select throws_ok(
  $$insert into public.document_signatures (document_id, asset_id_signed, signer_id, typed_full_name, affirmed) values ('f4000000-0000-0000-0000-000000000001', 'sanity-asset-v2', 'e4000000-0000-0000-0000-000000000003', 'Teacher G', false)$$,
  42501,
  null,
  'affirmed=false can never be stored'
);

set local "request.jwt.claims" to '{"sub": "e4000000-0000-0000-0000-000000000003"}';
insert into public.document_signatures (id, document_id, asset_id_signed, signer_id, typed_full_name, affirmed) values
  ('f4000000-0000-0000-0000-000000000003', 'f4000000-0000-0000-0000-000000000001', 'sanity-asset-v2', 'e4000000-0000-0000-0000-000000000003', 'Teacher G', true);

-- ── no edit, no retract ────────────────────────────────────────────────
-- No UPDATE/DELETE policy exists at all for document_signatures, so
-- (matching the documented behaviour elsewhere in this schema — see
-- lms_rls.test.sql's comment on lesson_instances) these silently affect
-- zero rows rather than raising.
update public.document_signatures set typed_full_name = 'Someone Else' where id = 'f4000000-0000-0000-0000-000000000003';
select is((select typed_full_name from public.document_signatures where id = 'f4000000-0000-0000-0000-000000000003'), 'Teacher G', 'a signature can never be edited after the fact (update silently affects 0 rows)');

delete from public.document_signatures where id = 'f4000000-0000-0000-0000-000000000003';
select is((select count(*)::int from public.document_signatures where id = 'f4000000-0000-0000-0000-000000000003'), 1, 'a signature can never be retracted/deleted by its own signer (delete silently affects 0 rows)');

-- ── read scope: own history only, unless can_export_data/head_teacher/admin ──
select is((select count(*)::int from public.document_signatures), 1, 'Teacher G sees only their own signature history');

set local "request.jwt.claims" to '{"sub": "e4000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.document_signatures), 1, 'Teacher F likewise sees only their own signature history');

set local "request.jwt.claims" to '{"sub": "e4000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.document_signatures), 2, 'the can_export_data holder sees everyone''s signature history');

set local "request.jwt.claims" to '{"sub": "e4000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.document_signatures), 2, 'head_teacher sees everyone''s signature history too');

-- ── outstanding_signatures / my_outstanding_signatures views ─────────────
reset role;
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e4000000-0000-0000-0000-000000000004', 'teacher', 'none', null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e4000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.my_outstanding_signatures), 1, 'the exporter (a teacher who has not signed) sees the document in their own outstanding list');

select * from finish();
rollback;
