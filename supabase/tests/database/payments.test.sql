-- Run via `supabase test db`. Covers 0218 (online payments, T71): references
-- (family TGA-F-, pupil TGA-P-, invoice TGA-INV-), the application fee charge,
-- RLS (families see only their own account; finance tables are head teacher
-- and admin only; nobody writes payments directly), the audited manual
-- record and waiver (reason required), and status upkeep.
begin;
select plan(25);

insert into auth.users (id, email) values
  ('a2160000-0000-0000-0000-000000000001', 'pay-parent-a@example.com'),
  ('a2160000-0000-0000-0000-000000000002', 'pay-parent-b@example.com'),
  ('a2160000-0000-0000-0000-000000000003', 'pay-admin@example.com'),
  ('a2160000-0000-0000-0000-000000000004', 'pay-teacher@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a2160000-0000-0000-0000-000000000001', 'parent', 'Parent A', 'pay-parent-a@example.com'),
  ('a2160000-0000-0000-0000-000000000002', 'parent', 'Parent B', 'pay-parent-b@example.com'),
  ('a2160000-0000-0000-0000-000000000003', 'admin', 'Office Admin', 'pay-admin@example.com'),
  ('a2160000-0000-0000-0000-000000000004', 'staff', 'A Teacher', 'pay-teacher@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a2160000-0000-0000-0000-000000000001', 'parent', 'none', null),
  ('a2160000-0000-0000-0000-000000000002', 'parent', 'none', null),
  ('a2160000-0000-0000-0000-000000000003', 'admin', 'none', null),
  ('a2160000-0000-0000-0000-000000000004', 'teacher', 'none', null);

insert into public.children (id, parent_user_id, name, dob) values
  ('a2160000-0000-0000-0000-0000000000d1', 'a2160000-0000-0000-0000-000000000001', 'Pupil A', '2015-01-01');

insert into public.fee_charges (id, parent_user_id, child_id, description, amount, due_date, kind, plan, instalment_no, instalment_count) values
  ('a2160000-0000-0000-0000-0000000000c1', 'a2160000-0000-0000-0000-000000000001', 'a2160000-0000-0000-0000-0000000000d1', 'Payment 1 of 7', 399.43, '2027-01-08', 'first_payment', 'monthly', 1, 7),
  ('a2160000-0000-0000-0000-0000000000c2', 'a2160000-0000-0000-0000-000000000001', 'a2160000-0000-0000-0000-0000000000d1', 'Payment 2 of 7', 399.43, '2020-01-28', 'instalment', 'monthly', 2, 7),
  ('a2160000-0000-0000-0000-0000000000c3', 'a2160000-0000-0000-0000-000000000002', null, 'Other family', 150, '2027-01-08', 'other', null, null, null);

-- References ----------------------------------------------------------------
select matches((select invoice_number from public.fee_charges where id = 'a2160000-0000-0000-0000-0000000000c1'), '^TGA-INV-27-\d{5}$', 'a charge gets an invoice number TGA-INV-27-00001');
select matches((select a.reference from public.fee_accounts a join public.fee_charges c on c.fee_account_id = a.id where c.id = 'a2160000-0000-0000-0000-0000000000c1'), '^TGA-F-\d{4,}$', 'the family gets a payment reference TGA-F-1001');
select matches((select pupil_number from public.children where id = 'a2160000-0000-0000-0000-0000000000d1'), '^TGA-P-\d{5,}$', 'a pupil gets a pupil number TGA-P-10001');
select is((select count(distinct fee_account_id)::int from public.fee_charges where parent_user_id = 'a2160000-0000-0000-0000-000000000001'), 1, 'one account per family');
select is((select amount_pence from public.fee_charges where id = 'a2160000-0000-0000-0000-0000000000c1'), 39943, 'amounts are kept in pence too');
create temp table _inv as select invoice_number from public.fee_charges where id = 'a2160000-0000-0000-0000-0000000000c1';
update public.fee_charges set invoice_number = 'TGA-INV-27-99999' where id = 'a2160000-0000-0000-0000-0000000000c1';
select is((select invoice_number from public.fee_charges where id = 'a2160000-0000-0000-0000-0000000000c1'), (select invoice_number from _inv), 'an invoice number never changes');

-- Status upkeep ---------------------------------------------------------------
select is(public.fee_charge_refresh('a2160000-0000-0000-0000-0000000000c2'), 'overdue', 'a charge past its due date is overdue');

-- The application fee is charged when an application arrives ---------------
set local role anon;
insert into public.admissions_applications
  (id, parent_name, parent_email, parent_phone, child_first_name, child_last_name, child_dob, child_gender,
   year_group_applying, consent_contact, consent_data, declaration_name, address_line1, address_town, address_postcode, address_country)
values ('a2160000-0000-0000-0000-0000000000a1', 'New Parent', 'pay-new@example.com', '07700900123', 'Yusuf', 'New', '2016-03-04', 'Male',
        'Year 3', true, true, 'New Parent', '1 High Street', 'London', 'N1 1AA', 'United Kingdom');
reset role;
select is((select count(*)::int from public.fee_charges where application_id = 'a2160000-0000-0000-0000-0000000000a1' and kind = 'application_fee'), 1, 'an application gets its application fee charge');
select isnt((select fee_account_id from public.fee_charges where application_id = 'a2160000-0000-0000-0000-0000000000a1'), null, 'the applying family gets an account');

-- Parent A ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2160000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.fee_charges), 2, 'a parent sees their own charges only');
select is((select count(*)::int from public.fee_accounts), 1, 'a parent sees their own account only');
select throws_ok(
  $$insert into public.fee_payments (charge_id, amount, method) values ('a2160000-0000-0000-0000-0000000000c1', 399.43, 'online')$$,
  '42501', null, 'a parent cannot record a payment'
);
select throws_ok(
  $$select public.fee_record_manual_payment('a2160000-0000-0000-0000-0000000000c1', 39943, 'pi_123', 'trying it on', null)$$,
  '42501', null, 'a parent cannot use the manual record'
);
select throws_ok(
  $$select public.fee_charge_waive('a2160000-0000-0000-0000-0000000000c1', 'please')$$,
  '42501', null, 'a parent cannot waive a charge'
);
select is((select count(*)::int from public.payment_alerts), 0, 'a parent cannot read payment alerts');

-- Parent B ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "a2160000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.fee_charges where parent_user_id = 'a2160000-0000-0000-0000-000000000001'), 0, 'another family cannot see them');

-- A teacher --------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "a2160000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.fee_accounts), 0, 'a teacher cannot read fee accounts');
select is((select count(*)::int from public.stripe_events), 0, 'a teacher cannot read Stripe events');

-- Admin (finance) ------------------------------------------------------------
reset role;
insert into public.payment_alerts (kind, title) values ('unmatched', 'Test alert');
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2160000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.payment_alerts), 1, 'finance staff read payment alerts');
select throws_ok(
  $$select public.fee_record_manual_payment('a2160000-0000-0000-0000-0000000000c1', 39943, 'pi_123', '', null)$$,
  '23514', null, 'a manual record needs a reason'
);
select throws_ok(
  $$select public.fee_record_manual_payment('a2160000-0000-0000-0000-0000000000c1', 39943, 'bank transfer', 'paid at the office', null)$$,
  '23514', null, 'a manual record needs a Stripe reference (no other way to pay)'
);
select lives_ok(
  $$select public.fee_record_manual_payment('a2160000-0000-0000-0000-0000000000c1', 39943, 'pi_3Abc', 'Paid with the old payment link; not matched', null)$$,
  'finance staff can record an unmatched Stripe payment with a reason'
);
reset role;
select is((select status from public.fee_charges where id = 'a2160000-0000-0000-0000-0000000000c1'), 'paid', 'the charge is then paid');
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2160000-0000-0000-0000-000000000003"}';
select lives_ok(
  $$select public.fee_charge_waive('a2160000-0000-0000-0000-0000000000c2', 'Bursary agreed by the head teacher')$$,
  'finance staff can waive a charge with a reason'
);
reset role;
select is((select status || ':' || (waived_by is not null)::text from public.fee_charges where id = 'a2160000-0000-0000-0000-0000000000c2'), 'waived:true', 'a waived charge records who waived it');

select * from finish();
rollback;
