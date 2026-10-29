-- The public check at /eligibility is now called "Is it right for us?"
-- everywhere on the site (it replaces the old fit check / "Your Child's
-- Week" quiz; src/components/eligibility/FitCheck.tsx). The FAQ answer about
-- applying from outside the UK still linked to it as "Is TGA right for us?"
-- (0171); match src/content/seed.ts. Idempotent.
--
-- The quiz_* tables (0016) stay: quiz_leads still records a family's
-- consent when they ask for the summary by email (quiz-send-plan). The
-- quiz builder that edited quiz_config_versions has been removed from the
-- admin portal, and nothing reads that table any more.

update public.faq_entries
set answer = replace(answer, '[Is TGA right for us?](/eligibility)', '[Is it right for us?](/eligibility)')
where answer like '%[Is TGA right for us?](/eligibility)%';
