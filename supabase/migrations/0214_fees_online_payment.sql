-- 0214 (owner, 11 November 2026, "Tafweed 3": fees, payments and contacts).
--
--  1. site_settings.online_payment_url: the public address of the school's
--     hosted online payment page (for example a Stripe Payment Link). Empty
--     until the owner sets it in the portal (Admissions settings); the website,
--     the family Fees page and the offer email show "Pay online" only once it
--     is set. No payment keys are stored anywhere in the database or the repo.
--  2. fee_payments.method gains 'online' (a payment made on that page). The
--     old values ('bank_transfer', 'cash', 'card') stay valid so every payment
--     already recorded keeps working.
--  3. The first payment under every plan is due on admission, when the place
--     is accepted; the remaining payments follow on the published dates
--     (amounts and dates unchanged). Brought into line with src/lib/fees.ts,
--     src/content/seed.ts and content/policies/24 and 25: the payment dates
--     text on the Fees page, three FAQ answers and the Admissions and Fees
--     policies (standing order and bank transfer removed as ways to pay,
--     including the Fees Policy's standing order form; policy 24's "How to
--     apply" now matches the website's six steps).
--
-- Each text update matches the exact wording it replaces, so text edited in
-- the portal since is left alone and running this again changes nothing. The
-- policy body-changed trigger stays on, so the PDFs rebuild on the next deploy.

-- ── 1. online payment page ─────────────────────────────────────────────
alter table public.site_settings
  add column if not exists online_payment_url text;

alter table public.site_settings drop constraint if exists site_settings_online_payment_url_check;
alter table public.site_settings
  add constraint site_settings_online_payment_url_check
  check (online_payment_url is null or (online_payment_url ~ '^https://[^[:space:]]+$' and char_length(online_payment_url) <= 500));

comment on column public.site_settings.online_payment_url is
  'Public https address of the hosted online payment page (Stripe Payment Link or similar). NULL = no Pay online button anywhere. site_settings is publicly readable: never put a key or secret here.';

-- ── 2. payment method 'online' ─────────────────────────────────────────
alter table public.fee_payments drop constraint if exists fee_payments_method_check;
alter table public.fee_payments
  add constraint fee_payments_method_check
  check (method in ('online', 'card', 'cash', 'bank_transfer'));

-- ── 3. first payment on acceptance ─────────────────────────────────────
alter table public.site_settings alter column payment_schedule_text set default
  $t$The first payment is due when you accept your place, within five working days of your offer and no later than Friday 8 January 2027. It secures your child's place. Paying in full: one payment, on acceptance. Two payments: the first on acceptance and the second on Sunday 28 March 2027. Monthly: seven payments, the first on acceptance, then on the 28th of each month from 28 January to 28 June 2027.$t$;

update public.site_settings
set payment_schedule_text = $t$The first payment is due when you accept your place, within five working days of your offer and no later than Friday 8 January 2027. It secures your child's place. Paying in full: one payment, on acceptance. Two payments: the first on acceptance and the second on Sunday 28 March 2027. Monthly: seven payments, the first on acceptance, then on the 28th of each month from 28 January to 28 June 2027.$t$
where payment_schedule_text like 'The two payments are due on Friday 8 January 2027 and Sunday 28 March 2027.%'
  and payment_schedule_text like '%The first monthly payment is due on 8 January 2027%';

-- FAQs
update public.faq_entries set answer = $t$Choose one of three plans when you accept a place. Under every plan the first payment is due when you accept (by 8 January 2027 at the latest):

- In full on acceptance, with a {{annualDiscount}} discount
- Two payments: on acceptance, then 28 March 2027
- Seven monthly payments: on acceptance, then the 28th of each month from January to June

Pay online, by card or from your bank app, using the secure link we send with your offer. See [Fees](/fees).$t$
where question in ('How can we pay?', 'How do I actually pay fees?')
  and (answer ilike '%standing order%' or answer ilike '%bank transfer%');

update public.faq_entries set answer = replace(answer, $t$pay your first fee payment by **Friday 8 January 2027** and sign the parent agreement on the portal.$t$, $t$pay your first fee payment when you accept (by **Friday 8 January 2027** at the latest), then sign the parent agreement on the portal.$t$)
where question = $t$How do I apply, step by step?$t$ and position($t$pay your first fee payment by **Friday 8 January 2027** and sign the parent agreement on the portal.$t$ in answer) > 0;

update public.faq_entries set answer = replace(answer, $t$reply within five working days and pay your first fee payment by Friday 8 January 2027.$t$, $t$reply within five working days and pay your first fee payment at the same time (by Friday 8 January 2027 at the latest).$t$)
where question = $t$What is the application fee, and is there a registration fee?$t$ and position($t$reply within five working days and pay your first fee payment by Friday 8 January 2027.$t$ in answer) > 0;

-- Policies (body text)
-- 24-admissions.md
update public.policy_links set body_md = replace(body_md, $t$## 5. How to Apply

| Step | What happens |$t$, $t$## 5. How to Apply

Before applying, families are welcome to come to an online open evening, book an admissions call or use "Is it right for us?" on the Academy website to see the likely year group, live day, timetable and fees. The application itself follows the six steps shown on the website's Admissions page:

| Step | What happens |$t$)
where position($t$## 5. How to Apply

| Step | What happens |$t$ in body_md) > 0;
update public.policy_links set body_md = replace(body_md, $t$| 1. Enquiry | Families may book an admissions call through the website and use the fit check on the Academy website to see the likely year group, timetable and fees |
| 2. Application | Complete the online application form and pay the application fee of £150 per child, which is non-refundable (see the Fees Policy) |
| 3. Documents | Upload the documents listed in Appendix A; the Academy requests a confidential report from the current school |
| 4. Assessment | The pupil completes the online entry assessment under supervised, camera-on conditions |
| 5. Family video call | A conversation with a member of the leadership team about learning goals, values and support needs |
| 6. Decision | Normally within three working days of the family meeting |
| 7. Offer | A conditional offer is issued with the terms and conditions and Fees Policy |$t$, $t$| 1. Apply | Complete the online application form (several children can be added to the same form) and upload the documents listed in Appendix A, including photo ID for a parent or guardian, each child's passport or birth certificate, proof of the child's home address and, if available, a recent school report or homeschool record. No payment is taken on the form |
| 2. We review your application | The admissions team checks the application and documents, requests a confidential report from the current school and tells the family if anything else is needed. The Academy emails the details for paying the application fee of £150 per child, which is non-refundable (see the Fees Policy) and must be paid before a place is confirmed |
| 3. Remote assessment | The pupil completes an age-appropriate online entry assessment under supervised, camera-on conditions; the date, time and what to prepare are emailed |
| 4. Family video call | A video call with the Headteacher or a member of the leadership team, the parent or guardian and the child, about learning goals, values and support needs. Offers are made in writing, normally within three working days of the call (and within ten working days of a complete application) |
| 5. Offer and securing your place | A conditional offer is emailed with the terms and conditions and the Fees Policy. To accept, the family replies within five working days and pays the first fee payment on acceptance, plus the application fee if not already paid |
| 6. Welcome | The Academy creates the parent and pupil accounts, emails the sign-in details and welcomes the pupil to induction week (4 to 8 January 2027), ahead of the first live lessons on Monday 11 January 2027 |$t$)
where position($t$| 1. Enquiry | Families may book an admissions call through the website and use the fit check on the Academy website to see the likely year group, timetable and fees |
| 2. Application | Complete the online application form and pay the application fee of £150 per child, which is non-refundable (see the Fees Policy) |
| 3. Documents | Upload the documents listed in Appendix A; the Academy requests a confidential report from the current school |
| 4. Assessment | The pupil completes the online entry assessment under supervised, camera-on conditions |
| 5. Family video call | A conversation with a member of the leadership team about learning goals, values and support needs |
| 6. Decision | Normally within three working days of the family meeting |
| 7. Offer | A conditional offer is issued with the terms and conditions and Fees Policy |$t$ in body_md) > 0;

update public.policy_links set body_md = replace(body_md, $t$| Acceptance | Families accept within five working days and pay the first fee payment, due no later than Friday 8 January 2027 |$t$, $t$| Acceptance | Families accept within five working days and pay the first fee payment on acceptance (on admission), and no later than Friday 8 January 2027. The place is held only once this payment has been made; the remaining payments follow the dates in the Fees Policy |$t$)
where position($t$| Acceptance | Families accept within five working days and pay the first fee payment, due no later than Friday 8 January 2027 |$t$ in body_md) > 0;

-- 25-fees.md
update public.policy_links set body_md = replace(body_md, $t$The two payments are due on Friday 8 January 2027 and Sunday 28 March 2027. Monthly instalments are spread across seven payments: the first on Friday 8 January 2027, then the 28th of each month from 28 January to 28 June 2027. Instalments always add up exactly to the annual fee; where rounding makes them uneven, the final instalment absorbs the difference.$t$, $t$Under every plan, the first payment is due on admission, when the place is accepted (within five working days of the offer, and no later than Friday 8 January 2027). A place is held only once this first payment has been made. The remaining payments then follow: with two payments, the second is due on Sunday 28 March 2027; with monthly instalments, the first of the seven payments is made on acceptance and the remaining six on the 28th of each month from 28 January to 28 June 2027. Instalments always add up exactly to the annual fee; where rounding makes them uneven, the final instalment absorbs the difference.$t$)
where position($t$The two payments are due on Friday 8 January 2027 and Sunday 28 March 2027. Monthly instalments are spread across seven payments: the first on Friday 8 January 2027, then the 28th of each month from 28 January to 28 June 2027. Instalments always add up exactly to the annual fee; where rounding makes them uneven, the final instalment absorbs the difference.$t$ in body_md) > 0;

update public.policy_links set body_md = replace(body_md, $t$| Application fee | £150 per child, non-refundable, payable when applying. It covers the entry assessment and the time spent with each family. There is no registration fee. |
| Annual payment discount | 2% discount where the annual option is chosen and paid in full by Friday 8 January 2027 |$t$, $t$| Application fee | £150 per child, non-refundable. The payment details are emailed after the application is made, and the fee must be paid before a place is confirmed. It covers the entry assessment and the time spent with each family. There is no registration fee. |
| Annual payment discount | 2% discount where the annual option is chosen and paid in full on acceptance of the place (no later than Friday 8 January 2027) |$t$)
where position($t$| Application fee | £150 per child, non-refundable, payable when applying. It covers the entry assessment and the time spent with each family. There is no registration fee. |
| Annual payment discount | 2% discount where the annual option is chosen and paid in full by Friday 8 January 2027 |$t$ in body_md) > 0;

update public.policy_links set body_md = replace(body_md, $t$| First payment (to secure a place for January 2027) | On acceptance of the place, and no later than Friday 8 January 2027 |
| Annual payment | Friday 8 January 2027 |
| Two payments | Friday 8 January 2027 and Sunday 28 March 2027 |
| Monthly payments | Friday 8 January 2027, then the 28th of each month from 28 January to 28 June 2027 (seven payments) |$t$, $t$| First payment, under every plan (secures the place) | On admission: when the place is accepted, within five working days of the offer and no later than Friday 8 January 2027 |
| Annual payment | One payment, made on acceptance |
| Two payments | The first on acceptance; the second on Sunday 28 March 2027 |
| Monthly payments | The first on acceptance; then the 28th of each month from 28 January to 28 June 2027 (seven payments in all) |$t$)
where position($t$| First payment (to secure a place for January 2027) | On acceptance of the place, and no later than Friday 8 January 2027 |
| Annual payment | Friday 8 January 2027 |
| Two payments | Friday 8 January 2027 and Sunday 28 March 2027 |
| Monthly payments | Friday 8 January 2027, then the 28th of each month from 28 January to 28 June 2027 (seven payments) |$t$ in body_md) > 0;

update public.policy_links set body_md = replace(body_md, $t$- **Standing order**, preferred for monthly plans (form in Appendix A).
- **Card payment**, through the Academy finance team or the Parent Portal.
- **Bank transfer**, to the Academy's account in the name of An Noor Islamic School. The account details are sent with your offer letter. Please use your child's full name as the payment reference.$t$, $t$Fees are paid online, on the Academy's secure payment page, by debit or credit card or directly from a bank app. The link is sent with your offer and is on the Fees page of the Parent Portal. Please give your child's full name as the payment reference.$t$)
where position($t$- **Standing order**, preferred for monthly plans (form in Appendix A).
- **Card payment**, through the Academy finance team or the Parent Portal.
- **Bank transfer**, to the Academy's account in the name of An Noor Islamic School. The account details are sent with your offer letter. Please use your child's full name as the payment reference.$t$ in body_md) > 0;

update public.policy_links set body_md = replace(body_md, $t$6. Fees fall due on the dates above and are paid in full by standing order, card or bank transfer.$t$, $t$6. Fees fall due on the dates above and are paid in full online, by card or from a bank app, on the Academy's secure payment page.$t$)
where position($t$6. Fees fall due on the dates above and are paid in full by standing order, card or bank transfer.$t$ in body_md) > 0;

-- Appendix A (the standing order form) is removed from the Fees Policy.
update public.policy_links
set body_md = regexp_replace(body_md, '\s*## Appendix A [^\n]*Standing Order Form.*$', E'\n')
where body_md ~ '## Appendix A [^\n]*Standing Order Form';

-- Policy 24 section 5 as migration 0212 left it (Tafweed 3 policies, merged first) -> the
-- website's steps after this change (no payment on the form; first fee payment on acceptance).
update public.policy_links set body_md = replace(body_md, $t$## 5. How to Apply

Before applying, families are welcome to book an admissions call, join an online open evening or the taster morning, and use "Is it right for us?" on the Academy website to see the likely year group, the live day in their time zone, what they need at home and the fees. The application itself follows the same six steps as the "How to apply" page of the website:

| Step | What happens |
| --- | --- |
| 1. Apply | Complete the online application form (one form for all the children in a family), including each child's home address, and upload the documents listed in Appendix A. Pay the application fee of £150 per child, which is non-refundable (see the Fees Policy) |
| 2. We review the application | The admissions team checks the application and documents, asks the child's current school for a confidential report, and tells the family if anything else is needed |
| 3. Remote assessment | The pupil sits an age-appropriate online entry assessment, supervised with the camera on. The Academy emails the date, time and what to prepare |
| 4. Family video call | A video call with the Headteacher or a member of the leadership team, the parent or guardian and the pupil, about learning goals, values and any support needs |
| 5. Offer and securing the place | The decision is sent in writing, normally within three working days of the family video call (and within ten working days of a complete application). A successful applicant receives a conditional offer with the terms and conditions and the Fees Policy, and the family secures the place as set out in section 7 |
| 6. Welcome | The Academy creates the parent and pupil accounts, emails the sign-in details, and welcomes the pupil to induction week before the first live lessons |$t$, $t$## 5. How to Apply

Before applying, families are welcome to come to an online open evening, book an admissions call or use "Is it right for us?" on the Academy website to see the likely year group, live day, timetable and fees. The application itself follows the six steps shown on the website's Admissions page:

| Step | What happens |
| --- | --- |
| 1. Apply | Complete the online application form (several children can be added to the same form) and upload the documents listed in Appendix A, including photo ID for a parent or guardian, each child's passport or birth certificate, proof of the child's home address and, if available, a recent school report or homeschool record. No payment is taken on the form |
| 2. We review your application | The admissions team checks the application and documents, requests a confidential report from the current school and tells the family if anything else is needed. The Academy emails the details for paying the application fee of £150 per child, which is non-refundable (see the Fees Policy) and must be paid before a place is confirmed |
| 3. Remote assessment | The pupil completes an age-appropriate online entry assessment under supervised, camera-on conditions; the date, time and what to prepare are emailed |
| 4. Family video call | A video call with the Headteacher or a member of the leadership team, the parent or guardian and the child, about learning goals, values and support needs. Offers are made in writing, normally within three working days of the call (and within ten working days of a complete application) |
| 5. Offer and securing your place | A conditional offer is emailed with the terms and conditions and the Fees Policy. To accept, the family replies within five working days and pays the first fee payment on acceptance, plus the application fee if not already paid |
| 6. Welcome | The Academy creates the parent and pupil accounts, emails the sign-in details and welcomes the pupil to induction week (4 to 8 January 2027), ahead of the first live lessons on Monday 11 January 2027 |$t$)
where position($t$## 5. How to Apply

Before applying, families are welcome to book an admissions call, join an online open evening or the taster morning, and use "Is it right for us?" on the Academy website to see the likely year group, the live day in their time zone, what they need at home and the fees. The application itself follows the same six steps as the "How to apply" page of the website:

| Step | What happens |
| --- | --- |
| 1. Apply | Complete the online application form (one form for all the children in a family), including each child's home address, and upload the documents listed in Appendix A. Pay the application fee of £150 per child, which is non-refundable (see the Fees Policy) |
| 2. We review the application | The admissions team checks the application and documents, asks the child's current school for a confidential report, and tells the family if anything else is needed |
| 3. Remote assessment | The pupil sits an age-appropriate online entry assessment, supervised with the camera on. The Academy emails the date, time and what to prepare |
| 4. Family video call | A video call with the Headteacher or a member of the leadership team, the parent or guardian and the pupil, about learning goals, values and any support needs |
| 5. Offer and securing the place | The decision is sent in writing, normally within three working days of the family video call (and within ten working days of a complete application). A successful applicant receives a conditional offer with the terms and conditions and the Fees Policy, and the family secures the place as set out in section 7 |
| 6. Welcome | The Academy creates the parent and pupil accounts, emails the sign-in details, and welcomes the pupil to induction week before the first live lessons |$t$ in body_md) > 0;

-- Policies (version line)
update public.policy_links
set meta = jsonb_set(meta, '{dateOfIssue}', to_jsonb($t$1 September 2026 (version 1.4, updated 11 November 2026: the first payment is due on acceptance of a place, and fees are paid online)$t$::text))
where meta->>'dateOfIssue' = $t$1 September 2026 (version 1.3, updated 9 November 2026: a tablet with a stylus is recommended for every pupil, and a printer at home is required without one)$t$
  and body_md like '%## 4. Payment Dates%';

update public.policy_links
set meta = jsonb_set(meta, '{dateOfIssue}', to_jsonb($t$1 September 2026 (version 1.3, updated 11 November 2026: How to Apply matches the website, and the first fee payment is due on acceptance)$t$::text))
where meta->>'dateOfIssue' = $t$1 September 2026 (version 1.2, updated 9 November 2026: a tablet with a stylus is recommended for every pupil, and a printer at home is required without one)$t$
  and body_md like '%## 5. How to Apply%';

-- Anything else in the website text that still offers a standing order or a
-- bank transfer is listed in the migration output for a person to reword.
do $$
declare r record;
begin
  for r in select question from public.faq_entries where answer ilike '%standing order%' or answer ilike '%bank transfer%' loop
    raise notice '0214: FAQ still mentions standing order or bank transfer: %', r.question;
  end loop;
  for r in select number, title from public.policy_links where deleted_at is null and (body_md ilike '%standing order%' or body_md ilike '%bank transfer%') loop
    raise notice '0214: policy % (%) still mentions standing order or bank transfer', r.number, r.title;
  end loop;
end $$;
