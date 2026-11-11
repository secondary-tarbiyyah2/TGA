-- 0215: Tarbiyyah Secondary School is not an exam centre (owner, 11 November 2026).
-- Families register their child as a private candidate at an approved Pearson Edexcel
-- centre near them (UK or abroad) and pay that centre's entry fees directly; exam fees
-- are not in tuition. The Academy helps for free (list of centres that accept private
-- candidates, deadlines and timetable, entry codes, what to ask a centre, evidence for
-- access arrangements; the exams lead answers questions) but does not book or pay for
-- entries.
-- Brings the live text into line with content/policies/19 and 25 and src/content/seed.ts
-- (FAQ f23) with exact-match replacements, so any portal edits elsewhere in the text are
-- kept. The body-changed trigger is off, so nobody is asked to re-sign for a wording
-- change; body_updated_at is set so the PDFs rebuild on the next deploy. Idempotent.
-- A notice is raised for any row that still says Tarbiyyah Secondary is the exam centre.

alter table public.policy_links disable trigger policy_links_body_changed;

-- 19-examinations-and-private-candidates
update public.policy_links
set body_md = replace(replace(replace(replace(replace(replace(replace(replace(body_md,
  $q$Pupils are entered for their examinations through Tarbiyyah Secondary School, which acts as the examination centre; for pupils outside the United Kingdom the Academy helps the family arrange entry at a suitable approved centre near them. This policy explains how the Academy prepares pupils, supports families to secure entries, and manages access arrangements.$q$,
  $q$The Academy is not an examination centre. Pupils sit their International GCSE examinations as private candidates. Each family registers their child as a private candidate at an approved Pearson Edexcel centre near them, in the UK or abroad, and pays that centre's entry fees directly. Examination fees are not included in tuition.

The Academy helps families with this free of charge. It gives them:

- a list of centres that accept private candidates;
- the entry deadlines and the examination timetable;
- the entry code for each subject;
- what to ask a centre before registering;
- the evidence a centre needs for access arrangements.

The Examinations Officer answers families' questions about entries. The Academy does not book or pay for entries.

This policy explains how the Academy prepares pupils, helps families to secure entries, and supports access arrangements.$q$),
  $q$| Academy | Teaches the specification; advises on subject and tier choices; provides predicted grades and mock examinations; gives parents a list of suitable centres; supports applications for access arrangements; confirms candidate details to centres on request |$q$,
  $q$| Academy | Teaches the specification; advises on subject and tier choices; provides predicted grades and mock examinations; gives parents, free of charge, a list of centres that accept private candidates, the entry deadlines and timetable, the entry code for each subject, what to ask a centre, and the evidence a centre needs for access arrangements; the Examinations Officer answers parents' questions; confirms candidate details to centres on request. The Academy does not book or pay for entries |$q$),
  $q$| Parents | Register and pay the examination centre by its deadlines; ensure the pupil attends with identification; keep the Academy informed of entries and timetables |$q$,
  $q$| Parents | Choose an approved Pearson Edexcel centre near them that accepts private candidates; register the pupil there as a private candidate and pay the centre's entry fees directly, by its deadlines; ensure the pupil attends with identification; keep the Academy informed of entries and timetables |$q$),
  $q$| Examination centre | Accepts the entry, conducts the examination under JCQ regulations, and issues results and certificates |$q$,
  $q$| Examination centre | Accepts the private candidate entry, conducts the examination under JCQ regulations, and issues results and certificates |$q$),
  $q$| Autumn of Year 10 | Academy shares subject, tier and board information and a list of centres |$q$,
  $q$| Autumn of Year 10 | Academy shares subject, tier and board information, the entry code for each subject and a list of centres that accept private candidates |$q$),
  $q$| By the centre's deadline (often autumn–January) | Parents secure entries for the summer series |$q$,
  $q$| By the centre's deadline (often autumn–January) | Parents register their child as a private candidate and pay the centre for the summer series |$q$),
  $q$Examination and centre fees are not included in Academy tuition fees and are paid by families directly to the centre, as set out in the Fees Policy. Centre charges vary and are set by the centre.$q$,
  $q$Examination and centre fees are not included in Academy tuition fees and are paid by families directly to the centre, as set out in the Fees Policy. Centre charges vary and are set by the centre. The Academy's help with finding a centre and preparing an entry is free.$q$),
  $q$Families living outside the UK can usually sit International GCSEs at British Council or other approved international centres, which is one reason the Academy enters pupils for International GCSEs. The Academy will advise on centres when subjects are chosen.$q$,
  $q$Families living outside the UK can usually sit International GCSEs at British Council or other approved international centres, which is one reason the Academy teaches International GCSE courses. Families in the UK and abroad get the same help to find a centre, and the Academy will advise on centres when subjects are chosen.$q$),
    meta = coalesce(meta, '{}'::jsonb) || $m${"dateOfIssue": "1 September 2026 (version 1.3)"}$m$::jsonb,
    body_updated_at = now()
where slug = '19-examinations-and-private-candidates'
  and (position($q$Pupils are entered for their examinations through Tarbiyyah Secondary School, which acts as the examination centre; for pupils outside the United Kingdom the Academy helps the family arrange entry at a suitable approved centre near them. This policy explains how the Academy prepares pupils, supports families to secure entries, and manages access arrangements.$q$ in body_md) > 0 or position($q$| Academy | Teaches the specification; advises on subject and tier choices; provides predicted grades and mock examinations; gives parents a list of suitable centres; supports applications for access arrangements; confirms candidate details to centres on request |$q$ in body_md) > 0 or position($q$| Parents | Register and pay the examination centre by its deadlines; ensure the pupil attends with identification; keep the Academy informed of entries and timetables |$q$ in body_md) > 0 or position($q$| Examination centre | Accepts the entry, conducts the examination under JCQ regulations, and issues results and certificates |$q$ in body_md) > 0 or position($q$| Autumn of Year 10 | Academy shares subject, tier and board information and a list of centres |$q$ in body_md) > 0 or position($q$| By the centre's deadline (often autumn–January) | Parents secure entries for the summer series |$q$ in body_md) > 0 or position($q$Examination and centre fees are not included in Academy tuition fees and are paid by families directly to the centre, as set out in the Fees Policy. Centre charges vary and are set by the centre.$q$ in body_md) > 0 or position($q$Families living outside the UK can usually sit International GCSEs at British Council or other approved international centres, which is one reason the Academy enters pupils for International GCSEs. The Academy will advise on centres when subjects are chosen.$q$ in body_md) > 0);

-- 25-fees
update public.policy_links
set body_md = replace(replace(body_md,
  $q$| Examination fees | Not included. International GCSE entry fees are billed separately by the examination centre (see the Examinations and Private Candidates Policy) |$q$,
  $q$| Examination fees | Not included. International GCSE entry fees are paid by families directly to the examination centre they register with (see the Examinations and Private Candidates Policy) |$q$),
  $q$3. Examination costs are not included. Pupils are entered for International GCSE examinations through Tarbiyyah Secondary School as the examination centre, or through another centre arranged for pupils outside the UK, and the centre's entry fees are billed separately.$q$,
  $q$3. Examination costs are not included. Families register their child as a private candidate at an approved Pearson Edexcel centre near them, in the UK or abroad, and pay that centre's entry fees directly. The Academy helps families find a centre free of charge but does not book or pay for entries (see the Examinations and Private Candidates Policy).$q$),
    meta = coalesce(meta, '{}'::jsonb) || $m${"dateOfIssue": "1 September 2026 (version 1.5)"}$m$::jsonb,
    body_updated_at = now()
where slug = '25-fees'
  and (position($q$| Examination fees | Not included. International GCSE entry fees are billed separately by the examination centre (see the Examinations and Private Candidates Policy) |$q$ in body_md) > 0 or position($q$3. Examination costs are not included. Pupils are entered for International GCSE examinations through Tarbiyyah Secondary School as the examination centre, or through another centre arranged for pupils outside the UK, and the centre's entry fees are billed separately.$q$ in body_md) > 0);

alter table public.policy_links enable trigger policy_links_body_changed;

-- FAQ f23 (src/content/seed.ts), live text as set by 0176.
update public.faq_entries
set answer = replace(answer,
  $q$Pearson Edexcel International GCSEs. UK pupils sit their exams at Tarbiyyah Secondary School as their exam centre; for families outside the UK we help you find and register with an approved centre nearby.$q$,
  $q$Pearson Edexcel International GCSEs. Pupils sit them as private candidates: you register your child at an approved Pearson Edexcel centre near you, in the UK or abroad, and pay the centre's entry fees directly. We help for free with a list of centres that accept private candidates, the entry deadlines and timetable, and the entry code for each subject.$q$)
where answer like '%UK pupils sit their exams at Tarbiyyah Secondary School as their exam centre%';

-- Anything left that still names Tarbiyyah Secondary as the exam centre needs a hand edit.
do $$
declare r record;
begin
  for r in
    select 'policy_links' as tbl, slug as id from public.policy_links
    where body_md ~* 'Tarbiyyah Secondary[^.]*(exam|examination) centre'
       or body_md ~* '(exam|examination) centre[^.]*Tarbiyyah Secondary'
       or body_md ~* '(sit|entered)[^.]*(exams|examinations)[^.]*(at|through) Tarbiyyah Secondary'
    union all
    select 'faq_entries', id::text from public.faq_entries
    where answer ~* 'Tarbiyyah Secondary[^.]*(exam|examination) centre'
       or answer ~* '(exam|examination) centre[^.]*Tarbiyyah Secondary'
       or answer ~* '(sit|entered)[^.]*(exams|examinations)[^.]*(at|through) Tarbiyyah Secondary'
  loop
    raise notice 'Still says Tarbiyyah Secondary is the exam centre: %.%', r.tbl, r.id;
  end loop;
end
$$;
