-- Run via `supabase test db`. Covers 0182_recruitment.sql: the public sees
-- only open roles, nobody can insert an application from the browser, only
-- Headteacher/Admin can read applications, staff can change the review
-- fields but not what the candidate wrote, and every status change is logged.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('e1820000-0000-0000-0000-000000000001', 'ht-recruit@example.com'),
  ('e1820000-0000-0000-0000-000000000002', 'teacher-recruit@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('e1820000-0000-0000-0000-000000000001', 'admin', 'HT Recruit', 'ht-recruit@example.com'),
  ('e1820000-0000-0000-0000-000000000002', 'teacher', 'Teacher Recruit', 'teacher-recruit@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e1820000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e1820000-0000-0000-0000-000000000002', 'teacher', 'none', null);

insert into public.job_vacancies (id, slug, title, status, closing_date) values
  ('e1820000-0000-0000-0000-0000000000a1', 'test-open-role', 'TEST Open role', 'open', null),
  ('e1820000-0000-0000-0000-0000000000a2', 'test-draft-role', 'TEST Draft role', 'draft', null),
  ('e1820000-0000-0000-0000-0000000000a3', 'test-expired-role', 'TEST Expired role', 'open', '2020-01-01');

-- As the service role (what careers-apply uses).
insert into public.job_applications (
  id, vacancy_id, vacancy_title, first_name, last_name, email, phone, country, right_to_work,
  teacher_status, highest_qualification, years_experience, online_experience, hours_preference,
  statement, referees, dbs_status, declaration_name, declaration_true, consent_data
) values (
  'e1820000-0000-0000-0000-0000000000b1', 'e1820000-0000-0000-0000-0000000000a1', 'TEST Open role',
  'Test', 'Candidate', 'candidate@example.com', '+44 7700 900000', 'United Kingdom', 'uk_yes',
  'qts', 'PGCE', '2_5', 'some', 'part_time',
  repeat('I would love to teach. ', 10),
  '[{"name":"Ref One","email":"one@example.com"},{"name":"Ref Two","email":"two@example.com"}]'::jsonb,
  'willing', 'Test Candidate', true, true
);

select matches((select reference from public.job_applications where id = 'e1820000-0000-0000-0000-0000000000b1'), '^TGA-J-\d+$', 'applications get a TGA-J reference');

-- Anonymous visitor.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.job_vacancies where slug like 'test-%'), 1, 'the public sees only the open, unexpired role');
select is((select count(*)::int from public.job_applications), 0, 'the public cannot read applications');
select throws_ok(
  $$insert into public.job_applications (vacancy_title, first_name, last_name, email, phone, country, right_to_work, teacher_status, highest_qualification, years_experience, online_experience, hours_preference, statement, referees, dbs_status, declaration_name, declaration_true, consent_data)
    values ('x','a','b','c@d.ef','0123456','UK','uk_yes','qts','x','none','none','either', repeat('x', 120), '[{},{}]'::jsonb, 'willing','a b', true, true)$$,
  '42501', null, 'the public cannot insert an application directly'
);

-- A teacher.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1820000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.job_applications), 0, 'a teacher cannot read applications');
select is((select count(*)::int from public.job_vacancies where slug = 'test-draft-role'), 0, 'a teacher cannot see draft roles');

-- The headteacher.
select set_config('request.jwt.claims', '{"sub":"e1820000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.job_applications where id = 'e1820000-0000-0000-0000-0000000000b1'), 1, 'the headteacher can read applications');
select lives_ok(
  $$update public.job_applications set status = 'shortlisted', rating = 4 where id = 'e1820000-0000-0000-0000-0000000000b1'$$,
  'the headteacher can shortlist and rate'
);
select is(
  (select count(*)::int from public.job_application_events where application_id = 'e1820000-0000-0000-0000-0000000000b1' and kind = 'status' and to_status = 'shortlisted'),
  1, 'the status change is logged on the timeline'
);
select throws_ok(
  $$update public.job_applications set statement = 'changed' where id = 'e1820000-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'staff cannot change what the candidate wrote'
);
select throws_ok(
  $$insert into public.job_application_events (application_id, kind, to_status, created_by) values ('e1820000-0000-0000-0000-0000000000b1', 'status', 'hired', 'e1820000-0000-0000-0000-000000000001')$$,
  '42501', null, 'staff cannot forge a status entry on the timeline'
);

select * from finish();
rollback;
