# Online payments (Stripe)

Owner, 11 November 2026: "we want all payments to be online, no bank transfer ... think about
references for students and generate a system so it's easy to ensure payments have been done,
account for everything, but it's better if they pay in portal." Confirmed the same day: payments
are **only** through Stripe (its page offers Pay by Bank and card), with no other method offered
anywhere on the site, portal, emails or policies. Backlog item T71 (`docs/backlog/tafweed.md`).
Why Stripe, and what each option costs: `docs/online-payments-options.md`.

## How it works, in one page

1. **Every family has a payment reference** and every charge has an invoice number (formats below).
2. **Charges are made by the system, not typed in.** The application fee is charged the moment an
   application arrives. When a place is offered, the family chooses a plan on their payment page and
   the plan's dated payments are created from the fee bands, the sibling discount and the 2% annual
   discount (the same maths as the website's fee calculator, in whole pence; the last payment takes
   any rounding).
3. **Families pay on Stripe's secure page**, from:
   - the **Fees page of the parent portal** (preferred): "Pay now" on any charge, or "Pay all due";
   - their **personal payment link** in the application confirmation and offer emails (for families
     who have no portal login yet): the application fee, then the plan's first payment.
   Stripe lists **Pay by Bank** first (from their banking app, never more than £5 in fees) and
   **card** second (mainly for families abroad).
4. **Stripe tells us when money arrives** (the webhook). The payment is recorded against the right
   charges only after checking the amount against what we asked for, and the charge turns Paid. The
   first payment of an offered place ticks "first payment received", which secures the place.
5. **Every day** the system marks missed payments overdue, emails reminders, and checks Stripe's
   own records of the last four days against ours. Anything that does not match, and every failed
   payment, refund or dispute, appears in the **Action centre** for the office.

No card or bank details ever touch our site or database. The Stripe secret key and webhook secret
live only in Supabase's server secrets.

## Reference formats

| What | Format | Example | Where it comes from |
| --- | --- | --- | --- |
| Family payment reference | `TGA-F-` + number from 1001 | `TGA-F-1042` | `fee_accounts.reference`, one per family, permanent |
| Pupil number | `TGA-P-` + number from 10001 | `TGA-P-10017` | `children.pupil_number`, given to every pupil record, permanent |
| Invoice number | `TGA-INV-` + academic year + 5 digits | `TGA-INV-27-00123` (27 = 2026-27) | `fee_charges.invoice_number`, one per charge, never changes |
| Application reference | `TGA-` + year + 4 digits | `TGA-2026-0001` | unchanged (admissions) |

The family reference is shown on the Fees page, in reminders, on Stripe's page and on the family's
bank statement for card payments (statement descriptor suffix). Stripe keeps the family reference,
charge ids and invoice numbers on every payment, so a payment can be searched in the Stripe
dashboard by any of them.

## What a charge can be

`due`, `overdue` (the day after its due date), `processing` (a bank payment waiting to clear),
`paid`, `part_paid`, `failed` (the bank declined; the family can try again), `refunded`, `waived`
(needs a reason and a head teacher or admin; recorded in the audit log), and `void` (cancelled).

## Payment dates 2026-27

- **Pay in full (2% off):** one payment, due a week after the plan is chosen and no later than
  Friday 8 January 2027.
- **Two payments:** the first as above, the second on 28 March 2027.
- **Seven monthly payments:** the first as above, then the 28th of each month, January to June 2027.
- **Sibling discount:** 5% off the second child, 10% off the third and later (ranked by fee).

The dates live in `supabase/functions/_shared/feePlan.ts`; change them there for 2027-28.

## The owner's setup steps (plain English)

1. **Open a Stripe account** at stripe.com/gb **in the name of the organisation that receives the
   fees** (the Fees Policy names it), and finish Stripe's identity and bank checks.
2. In Stripe, **Settings > Payment methods**: turn on **Pay by Bank** and **Cards**. (For Direct
   Debit later, also ask Stripe to turn on **Bacs Direct Debit**.)
3. Stay in **test mode** (the switch at the top of the Stripe dashboard). In **Developers > API
   keys**, copy the **Secret key** (it starts `sk_test_`).
4. In **Developers > Webhooks > Add endpoint**, paste this address:
   `https://<project-ref>.supabase.co/functions/v1/payments-webhook`
   (Portal: Admissions > Settings > Payments shows the exact address.) Choose these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
   `charge.dispute.created`, `payment_intent.succeeded`, `payment_intent.processing`,
   `payment_intent.payment_failed`, `mandate.updated`. Save, then copy its **Signing secret**
   (starts `whsec_`).
5. In GitHub, **Settings > Secrets and variables > Actions > New repository secret**: add
   `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Then run **Actions > Deploy Supabase backend >
   Run workflow** (or wait for the next deploy). The portal's Payments settings then show
   "Connected, test mode" and, after the first payment, the last webhook event.
6. **Test run:** apply as a pretend family; open the payment link in the confirmation email and pay
   the application fee with Stripe's test card `4242 4242 4242 4242` (any future date, any CVC),
   then with Pay by Bank choosing Stripe's test bank. Offer the place, choose a plan from the offer
   link and pay the first payment. Check: each charge shows Paid on the family's Fees page and on
   the staff Payments page, and the application shows "first payment received". Refund one payment
   in Stripe and check the Action centre shows it.
7. **Go live:** switch Stripe to live mode, make a live webhook endpoint the same way (step 4),
   and replace the two GitHub secrets with the live `sk_live_` key and the live endpoint's
   `whsec_` secret. Redeploy. Settings then show "Connected, live mode".
8. Clear **Admissions > Settings > Online payment link** (the shared link from before). It is used
   only while Stripe's keys are missing.

## What the office does each day

1. Open the **Action centre**: the Fees items list failed payments, refunds, disputes and anything
   Stripe and our records disagree about. Open each, deal with it, and mark it resolved on the
   Payments page.
2. Glance at **Fees > Payments**: expected, received and outstanding at the top; filter "Overdue"
   to see who to contact. Reminders are already sent automatically (7 days before each due date,
   and the day after a missed one), so a phone call is only needed for payments still overdue a
   week later.
3. Export the CSV at month end for the accounts.

Payments are recorded automatically. **Record a payment by hand only** for a Stripe payment the
system could not match (for example one made through the old shared link): head teacher or admin,
with the Stripe reference and a reason; it is kept in the audit log. Bank transfer, standing order
and cash are not options.

## Refunds and disputes

- **Refund:** make it in the Stripe dashboard (Payments > the payment > Refund). The webhook marks
  the charge's money as refunded, the charge goes back to owing (or Refunded), and an Action centre
  item records it. If the charge should not be owed any more, void or waive it with a reason.
- **Dispute (chargeback):** card payments only (Pay by Bank has none). It appears at once as an
  urgent Action centre item. Respond in Stripe (Payments > Disputes) before Stripe's deadline, with
  the invoice, the family's acceptance of the place and the Fees Policy. Stripe charges a dispute
  fee; Pay by Bank avoids this, which is why it is listed first.

## Direct Debit (monthly plan), off until Stripe enables Bacs

Built and switched off. When Stripe has enabled Bacs Direct Debit on the account, the head teacher
turns on **Admissions > Settings > Payments > Direct Debit**. Families on the monthly plan then see
"Set up Direct Debit" on their Fees page (Stripe collects the mandate), and the daily job collects
each monthly payment due from families with an active mandate, once per charge. Results come back
through the webhook like any other payment; failures go to the Action centre and the family can
still pay that month on the Fees page.

## App-store builds: `NEXT_PUBLIC_STORE_APP`

The portal installs as a web app from the browser, which takes no store commission. If it is ever
built for the Apple App Store or Google Play, set **`NEXT_PUBLIC_STORE_APP=1`** for that build.
Every Pay button (portal Fees page, website Fees page, the personal payment page) is then hidden
and families see **"Fees are paid on our website"** instead. Reason: Apple's App Review Guideline
3.1.3(d) requires in-app purchase for one-to-many live classes, and Google Play requires Play
billing for education services. The switch is `src/lib/storeApp.ts`. Store apps are not built.

## Where things are

| Part | File |
| --- | --- |
| Tables, references, statuses, RLS | `supabase/migrations/0217_payments_references_charges.sql` |
| RLS tests | `supabase/tests/database/payments.test.sql` |
| Stripe API and signature check | `supabase/functions/_shared/stripe.ts` |
| Checkout, amount checks, idempotency | `supabase/functions/_shared/payments.ts` |
| Plan maths and dates | `supabase/functions/_shared/feePlan.ts` (checked against `src/lib/fees.ts` by `src/lib/payments/feePlan.test.ts`) |
| Plan charges from an offer | `supabase/functions/_shared/planCharges.ts` |
| Portal checkout (parent) | `supabase/functions/payments-checkout` |
| Payment link checkout (no login) | `supabase/functions/payments-checkout-public`, page `src/app/(marketing)/admissions/payment` |
| Webhook | `supabase/functions/payments-webhook` (tests: `payments_test.ts`, run `deno test supabase/functions/payments-webhook/`) |
| Daily job | `supabase/functions/payments-daily`, `.github/workflows/payments-daily.yml` |
| Staff status and plan tools | `supabase/functions/payments-admin` |
| Family Fees page | `src/app/learn/family/fees/page.tsx` |
| Secrets | `.github/workflows/deploy-supabase.yml` ("Set Stripe secrets") |

Tables: `fee_accounts`, `fee_charges` (extended), `fee_payments` (extended), `payment_attempts`
(what each Checkout asked for: the webhook checks against this, never against metadata alone),
`stripe_events` (each webhook event once), `payment_alerts` (Action centre), `payment_reminders`,
`payment_reconciliation_runs`. Finance data is visible to head teachers and admins only; a family
sees only its own account.
