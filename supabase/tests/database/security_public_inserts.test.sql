-- Run via `supabase test db`. Covers 0198: anonymous writes to the unused
-- quiz tables are gone, the public forms' inserts are rate limited per
-- network, and the messaging helpers are no longer callable by anon.
begin;
select plan(7);

-- Unused tables: no anonymous writes.
set local role anon;
select throws_ok(
  $$ insert into public.eligibility_responses (child_year_band, region, hifz_priority, start_readiness, recommended_action, contact_name, contact_email)
     values ('y3-6', 'other', 'central', 'jan-2027', 'book_call', 'Test', 't@example.com') $$,
  '42501', null, 'anon can no longer insert eligibility_responses'
);
reset role;

-- Rate limit: pretend to be the API, with a network address.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.headers" to '{"cf-connecting-ip": "203.0.113.7"}';

select lives_ok(
  $$insert into public.quiz_leads (lead_ref, email, consent_given_at, consent_text) values ('rl1', 'rl1@example.com', now(), 'I agree')$$,
  'a first lead from a network is accepted'
);
select lives_ok(
  $$insert into public.quiz_leads (lead_ref, email, consent_given_at, consent_text)
    select 'rl' || g, 'rl' || g || '@example.com', now(), 'I agree' from generate_series(2, 9) g$$,
  'several rows in one request count once'
);
-- Requests 3 to 10 are accepted; the 11th in the hour is refused.
do $$ begin for i in 3..10 loop
  insert into public.quiz_leads (lead_ref, email, consent_given_at, consent_text) values ('x' || i, 'x' || i || '@example.com', now(), 'I agree');
end loop; end $$;
select throws_ok(
  $$insert into public.quiz_leads (lead_ref, email, consent_given_at, consent_text) values ('rl11', 'rl11@example.com', now(), 'I agree')$$,
  '53400', null, 'the 11th request from one network in an hour is refused'
);

-- Another network is not affected.
set local "request.headers" to '{"cf-connecting-ip": "198.51.100.9"}';
select lives_ok(
  $$insert into public.quiz_leads (lead_ref, email, consent_given_at, consent_text) values ('other', 'other@example.com', now(), 'I agree')$$,
  'a different network can still submit'
);
reset role;

-- Helpers: anon cannot call them; signed-in users can.
select ok(not has_function_privilege('anon', 'public.is_staff_member(uuid)', 'execute'), 'anon cannot call is_staff_member');
select ok(has_function_privilege('authenticated', 'public.thread_participant(uuid, uuid)', 'execute'), 'signed-in users can still call thread_participant');

select * from finish();
rollback;
