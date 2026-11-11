-- Run via `supabase test db`. Covers 0214: the online payment page address
-- (https only, empty by default) and the 'online' payment method, with the
-- older methods still valid so recorded payments keep working.
begin;
select plan(7);

select has_column('public', 'site_settings', 'online_payment_url', 'site_settings has online_payment_url');

insert into auth.users (id, email) values ('a2140000-0000-0000-0000-000000000001', 'fees-parent@example.com');
insert into public.profiles (id, role, full_name, email) values ('a2140000-0000-0000-0000-000000000001', 'parent', 'Fees Parent', 'fees-parent@example.com');
insert into public.fee_charges (id, parent_user_id, description, amount, due_date)
values ('a2140000-0000-0000-0000-0000000000c1', 'a2140000-0000-0000-0000-000000000001', 'First payment', 228, '2027-01-08');

select lives_ok(
  $$insert into public.fee_payments (charge_id, amount, method) values ('a2140000-0000-0000-0000-0000000000c1', 100, 'online')$$,
  'a payment can be recorded as online'
);
select lives_ok(
  $$insert into public.fee_payments (charge_id, amount, method) values ('a2140000-0000-0000-0000-0000000000c1', 50, 'bank_transfer')$$,
  'older bank transfer records stay valid'
);
select throws_ok(
  $$insert into public.fee_payments (charge_id, amount, method) values ('a2140000-0000-0000-0000-0000000000c1', 10, 'standing_order')$$,
  '23514', null, 'unknown methods are refused'
);

select throws_ok(
  $$update public.site_settings set online_payment_url = 'http://pay.example.com/x'$$,
  '23514', null, 'the payment page must be https'
);
select throws_ok(
  $$update public.site_settings set online_payment_url = 'javascript:alert(1)'$$,
  '23514', null, 'a script address is refused'
);
select lives_ok(
  $$update public.site_settings set online_payment_url = 'https://buy.stripe.com/test_abc123'$$,
  'an https payment link can be saved'
);

select * from finish();
rollback;
