-- FAQ fixes (29 October 2026):
-- * The Meet the team page was removed (no public staff information), so the
--   teachers FAQ no longer links to /team.
-- * GCSE exams: UK pupils sit them at Tarbiyyah Secondary School as their exam
--   centre (Examinations policy); families abroad get help finding a centre.
update public.faq_entries
set answer = replace(answer, ' See [Meet the team](/team).', '')
where answer like '%(/team)%';

update public.faq_entries
set answer = replace(answer,
  'Pearson Edexcel International GCSEs, sat as a private candidate at an approved exam centre near you. We help you register.',
  'Pearson Edexcel International GCSEs. UK pupils sit their exams at Tarbiyyah Secondary School as their exam centre; for families outside the UK we help you find and register with an approved centre nearby.')
where answer like '%approved exam centre near you%';
