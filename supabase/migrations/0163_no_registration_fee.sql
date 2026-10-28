-- 0163: no registration fee (owner decision, 28 October 2026).
--   "No need for registration fee, just application fee."
--   * The application fee was £50 per child here; it became £150 in 0170 and is the only admissions fee.
--   * Accepting an offer now means: reply within five working days and pay the
--     first fee payment (no later than Friday 8 January 2027).
--   * site_settings.registration_fee is cleared (null, no default). The column is
--     kept so older code and history keep working; the site and portal no longer
--     read it. admissions_applications.admin_fee_* columns are kept as history
--     and are no longer a condition of acceptance.
--   * Stored copy that mentions a registration fee (FAQ answers, payment schedule
--     text, sibling discount note, key dates, the offer email template) is
--     rewritten. Each change only touches text that still holds the old wording,
--     so other admin edits are left alone. Idempotent: safe to re-run.

-- ── Settings ────────────────────────────────────────────────────────────
alter table public.site_settings alter column registration_fee drop default;
update public.site_settings set registration_fee = null where registration_fee is not null;
comment on column public.site_settings.registration_fee is
  'Unused since 0163: there is no registration fee (application fee only). Kept for history.';

alter table public.site_settings alter column payment_schedule_text set default
  'The two payments are due on Friday 8 January 2027 and Sunday 28 March 2027. The first monthly payment is due on 8 January 2027, then payments are taken on the 28th of each month from 28 January to 28 June 2027. The first payment is due on acceptance and no later than 8 January 2027.';
update public.site_settings
set payment_schedule_text = regexp_replace(payment_schedule_text, 'The registration fee is due on acceptance[^.]*\.', 'The first payment is due on acceptance and no later than 8 January 2027.', 'g')
where payment_schedule_text ~ 'The registration fee is due on acceptance';

-- Sibling discount note: drop the clause about the sibling registration fee.
update public.site_settings
set sibling_discount_note = regexp_replace(
      regexp_replace(sibling_discount_note, ';\s*the registration fee is £125 for each additional sibling', '', 'gi'),
      '\s*The registration fee for each additional sibling is (also )?halved\.', '', 'gi')
where sibling_discount_note ~* 'registration fee';

-- ── FAQ answers ─────────────────────────────────────────────────────────
update public.faq_entries
set question = 'What is the application fee, and is there a registration fee?',
    answer = 'The application fee is {{applicationFee}} per child, is not refundable, and pays for the entry assessment and the time we spend with each family. There is no registration fee: to accept a place, you reply within five working days and pay your first fee payment.'
where question = 'What are the application and registration fees, and why?'
  and answer ~* 'registration';

update public.faq_entries
set answer = replace(answer, 'You accept by paying the {{registrationFee}} registration fee and the first fee payment (by Friday 8 January 2027)',
                             'You accept within five working days by paying your first fee payment (no later than Friday 8 January 2027)')
where answer like '%You accept by paying the {{registrationFee}} registration fee and the first fee payment (by Friday 8 January 2027)%';

update public.faq_entries
set answer = replace(answer, 'You accept by paying the {{registrationFee}} registration fee and',
                             'You accept within five working days by paying your first fee payment and')
where answer like '%You accept by paying the {{registrationFee}} registration fee and%';

update public.faq_entries
set answer = replace(answer, ' The registration fee for each additional sibling is also halved.', '')
where answer like '% The registration fee for each additional sibling is also halved.%';

update public.faq_entries
set answer = regexp_replace(answer, ' It is separate from the one-time \{\{registrationFee\}\} registration fee, which is payable on acceptance of a place[^.]*\.', ' There is no registration fee.')
where answer like '%It is separate from the one-time {{registrationFee}} registration fee%';

update public.faq_entries
set answer = replace(answer, 'the application fee (if unpaid), the {{registrationFee}} registration fee and your first payment',
                             'the application fee (if unpaid) and your first payment')
where answer like '%the application fee (if unpaid), the {{registrationFee}} registration fee and your first payment%';

-- ── Key dates ───────────────────────────────────────────────────────────
update public.site_term_dates set label = 'First fee payment due'
where label in ('Registration fee and first fee payment due', 'Registration and payment due', 'Registration fee and first payment due');

-- ── Offer email template ────────────────────────────────────────────────
update public.admissions_email_templates
set body = replace(body, E'\n- Registration fee: {{registration_fee}}', '')
where body like E'%\n- Registration fee: {{registration_fee}}%';

update public.admissions_email_templates
set body = replace(body, 'AMOUNT DUE NOW (application fee if not yet received + registration fee + first payment), by plan:',
                         'AMOUNT DUE NOW (application fee if not yet received + first payment), by plan:')
where body like '%application fee if not yet received + registration fee + first payment%';

update public.admissions_email_templates
set body = replace(body, 'TO ACCEPT THE PLACE, PLEASE PAY BY {{deadline}}',
                         'TO ACCEPT THE PLACE, PLEASE REPLY AND PAY YOUR FIRST FEE PAYMENT BY {{deadline}}')
where body like '%TO ACCEPT THE PLACE, PLEASE PAY BY {{deadline}}%';

-- ── Anything left over (custom admin wording) is listed for a manual check ──
do $$
declare r record;
begin
  for r in select 'faq_entries' as t, id::text as id, question as what from public.faq_entries where answer ~* 'registration ?fee|\{\{registrationFee\}\}'
           union all select 'admissions_email_templates', key, subject from public.admissions_email_templates where body ~* 'registration ?fee' or subject ~* 'registration ?fee'
           union all select 'site_term_dates', id::text, label from public.site_term_dates where label ~* 'registration' or coalesce(notes, '') ~* 'registration ?fee'
  loop
    raise notice '0163: % % still mentions a registration fee: %', r.t, r.id, r.what;
  end loop;
end $$;
