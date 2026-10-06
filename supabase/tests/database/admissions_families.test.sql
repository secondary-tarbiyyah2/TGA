-- Run via `supabase test db`. Covers 0081 (admissions families): the public
-- form can create a family and several linked applications but read nothing
-- back, new applications default to the Admissions Team assignee, nobody can
-- assign someone else at submission, a different legal guardian must be
-- complete, the upload gate knows the guardian ID kind, and staff can read
-- the linked applications of a family.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('e8100000-0000-0000-0000-000000000001', 'team-fam@example.com'),
  ('e8100000-0000-0000-0000-000000000002', 'admissions-fam@example.com'),
  ('e8100000-0000-0000-0000-000000000003', 'other-fam@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e8100000-0000-0000-0000-000000000001', 'admin', 'Admissions Team', 'team-fam@example.com'),
  ('e8100000-0000-0000-0000-000000000002', 'admin', 'Admissions Officer', 'admissions-fam@example.com'),
  ('e8100000-0000-0000-0000-000000000003', 'parent', 'Some Parent', 'other-fam@example.com');

insert into public.staff_members (profile_id, display_name, role_title) values
  ('e8100000-0000-0000-0000-000000000001', 'Admissions Team', 'Admissions');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e8100000-0000-0000-0000-000000000002', 'admissions', 'none', null);

-- Public visitor ------------------------------------------------------------
set local role anon;

select lives_ok(
  $$insert into public.admissions_families (id, lead_application_id, parent_name, parent_email, parent_phone, children_count)
    values ('e8100000-0000-0000-0000-0000000000f1', 'e8100000-0000-0000-0000-0000000000a1', 'Test Parent', 'tp-fam@example.com', '07700900123', 2)$$,
  'anon can create a family'
);

select lives_ok(
  $$insert into public.admissions_applications
      (id, family_id, sibling_index, parent_name, parent_email, parent_phone, child_first_name, child_last_name, child_dob, child_gender,
       year_group_applying, consent_contact, consent_data, declaration_name)
    values
      ('e8100000-0000-0000-0000-0000000000a1', 'e8100000-0000-0000-0000-0000000000f1', 1, 'Test Parent', 'tp-fam@example.com', '07700900123', 'Aisha', 'Parent', '2016-03-04', 'Female', 'Year 3', true, true, 'Test Parent'),
      ('e8100000-0000-0000-0000-0000000000a2', 'e8100000-0000-0000-0000-0000000000f1', 2, 'Test Parent', 'tp-fam@example.com', '07700900123', 'Omar', 'Parent', '2018-05-06', 'Male', 'Year 1', true, true, 'Test Parent')$$,
  'anon can submit two linked applications for one family'
);

select throws_ok(
  $$insert into public.admissions_applications
      (id, parent_name, parent_email, parent_phone, child_first_name, child_last_name, child_dob, child_gender,
       year_group_applying, consent_contact, consent_data, declaration_name, assigned_to)
    values
      ('e8100000-0000-0000-0000-0000000000a3', 'Test Parent', 'tp-fam@example.com', '07700900123', 'Sneaky', 'Parent', '2016-03-04', 'Male', 'Year 3', true, true, 'Test Parent', 'e8100000-0000-0000-0000-000000000003')$$,
  '42501', null, 'anon cannot assign an application to someone else'
);

select throws_ok(
  $$insert into public.admissions_applications
      (id, parent_name, parent_email, parent_phone, child_first_name, child_last_name, child_dob, child_gender,
       year_group_applying, consent_contact, consent_data, declaration_name, guardian_is_other)
    values
      ('e8100000-0000-0000-0000-0000000000a4', 'Test Parent', 'tp-fam@example.com', '07700900123', 'Layla', 'Parent', '2016-03-04', 'Female', 'Year 3', true, true, 'Test Parent', true)$$,
  '23514', null, 'a different legal guardian needs a name, email and phone'
);

select is((select count(*)::int from public.admissions_families), 0, 'anon cannot read families back');
select is((select count(*)::int from public.admissions_applications), 0, 'anon cannot read applications back');

select is(public.admissions_upload_allowed('e8100000-0000-0000-0000-0000000000a1/guardian_id-e8100000-0000-0000-0000-0000000000b1.pdf'), true, 'upload gate accepts a guardian ID for a fresh application');
select is(public.admissions_upload_allowed('e8100000-0000-0000-0000-0000000000a1/passport-e8100000-0000-0000-0000-0000000000b1.pdf'), false, 'upload gate refuses an unknown document kind');

-- Staff -------------------------------------------------------------------
reset role;
select is(
  (select assigned_to from public.admissions_applications where id = 'e8100000-0000-0000-0000-0000000000a1'),
  'e8100000-0000-0000-0000-000000000001'::uuid,
  'a new application defaults to the Admissions Team assignee'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e8100000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.admissions_applications where family_id = 'e8100000-0000-0000-0000-0000000000f1'), 2, 'admissions staff can read both linked applications');

-- A parent account is not staff
set local "request.jwt.claims" to '{"sub": "e8100000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.admissions_families), 0, 'a parent account cannot read families');

select * from finish();
rollback;
