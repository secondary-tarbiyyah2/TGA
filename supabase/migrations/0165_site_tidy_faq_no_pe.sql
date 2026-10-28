-- Public site tidy-up (October 2026). PE is not offered (see 0156), but the
-- "What does my child study?" FAQ still listed it among national curriculum
-- subjects. Matches src/content/seed.ts. Only rows still holding the old
-- wording are changed, so this is safe to run more than once.
update public.faq_entries
set answer = replace(answer, 'computing, art, PSHE and PE)', 'computing, art and PSHE)')
where answer like '%computing, art, PSHE and PE)%';
