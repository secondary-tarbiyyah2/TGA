-- Run via `supabase test db`. Covers 0194: the public form can save the UK
-- council link and British citizenship answer, staff can read it back, and
-- the length limits hold.
begin;
select plan(5);

insert into auth.users (id, email) values ('e9400000-0000-0000-0000-000000000001', 'uk-link-staff@example.com');
insert into public.profiles (id, role, full_name, email) values ('e9400000-0000-0000-0000-000000000001', 'admin', 'UK Link Staff', 'uk-link-staff@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values ('e9400000-0000-0000-0000-000000000001', 'admissions', 'none', null);

set local role anon;

select lives_ok(
  $$insert into public.admissions_families (id, lead_application_id, parent_name, parent_email, parent_phone, children_count,
      address_country, lived_in_uk, last_uk_postcode, last_uk_address, last_uk_local_authority)
    values ('e9400000-0000-0000-0000-0000000000f1', 'e9400000-0000-0000-0000-0000000000a1', 'Abroad Parent', 'abroad@example.com', '0097150000000', 1,
      'United Arab Emirates', true, 'B10 0AB', '1 Example Road', 'Birmingham')$$,
  'anon can save a family abroad with its last UK address and council'
);

select lives_ok(
  $$insert into public.admissions_applications
      (id, family_id, sibling_index, parent_name, parent_email, parent_phone, child_first_name, child_last_name, child_dob, child_gender,
       year_group_applying, consent_contact, consent_data, declaration_name,
       address_line1, address_town, address_country, lived_in_uk, last_uk_postcode, last_uk_local_authority, british_national)
    values
      ('e9400000-0000-0000-0000-0000000000a1', 'e9400000-0000-0000-0000-0000000000f1', 1, 'Abroad Parent', 'abroad@example.com', '0097150000000',
       'Yusuf', 'Parent', '2016-03-04', 'Male', 'Year 3', true, true, 'Abroad Parent',
       '5 Palm Street', 'Dubai', 'United Arab Emirates', true, 'B10 0AB', 'Birmingham', true)$$,
  'anon can save the UK link and British citizenship on an application'
);

select throws_ok(
  $$insert into public.admissions_applications
      (id, parent_name, parent_email, parent_phone, child_first_name, child_last_name, child_dob, child_gender,
       year_group_applying, consent_contact, consent_data, declaration_name, last_uk_postcode)
    values
      ('e9400000-0000-0000-0000-0000000000a2', 'P', 'p@example.com', '07700900123', 'Long', 'Postcode', '2016-03-04', 'Male', 'Year 3', true, true, 'P', 'ABCDEFGHIJKLMNOP')$$,
  '23514', null, 'an over-long UK postcode is rejected'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e9400000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select last_uk_local_authority from public.admissions_applications where id = 'e9400000-0000-0000-0000-0000000000a1'),
  'Birmingham',
  'admissions staff can read the council for the last UK address'
);

select is(
  (select british_national from public.admissions_applications where id = 'e9400000-0000-0000-0000-0000000000a1'),
  true,
  'admissions staff can read the British citizenship answer'
);

select * from finish();
rollback;
