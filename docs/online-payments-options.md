# Taking fee payments online: options and recommendation

Owner's request (11 November 2026, Tafweed 3, item T71): "way to pay now is online so we need to find a
way to accommodate for this on the website, identify a way to do so, minimal commission". Standing
orders and bank transfers are no longer offered (T72).

Prices were checked on 11 November 2026 from the sources at the end. Providers change prices, so
check the provider's own pricing page when you sign up. All figures are per payment, before any VAT.

## The payments we need to take

| Payment | Typical size |
| --- | --- |
| Application fee | £150 per child |
| Monthly instalment (7 a year) | £228.00 (Years 1 to 2) up to £428.57 (Years 10 to 11) |
| One of two payments | £798 (Years 1 to 2) up to £1,500 (Years 10 to 11) |
| Annual, paid in full (2% off) | £1,564.08 (Years 1 to 2) up to £2,940 (Years 10 to 11) |

The first payment under every plan is due when the family accepts the place (T70), so it should be
instant and hard to reverse.

## What each option costs

| Per payment | £150 | £228 | £428.57 | £798 | £1,500 | £2,940 |
| --- | --- | --- | --- | --- | --- | --- |
| **Stripe, Pay by Bank** (0.5% + 20p, capped at £5) | £0.95 | £1.34 | £2.34 | £4.19 | £5.00 | £5.00 |
| Stripe, Bacs Direct Debit (1%, min 20p, capped at £4) | £1.50 | £2.28 | £4.00 | £4.00 | £4.00 | £4.00 |
| GoCardless Direct Debit, Standard plan (1% + 20p, capped at £4, plus 0.3% over £2,000) | £1.70 | £2.48 | £4.00 | £4.00 | £4.00 | about £12.82 |
| Stripe, standard UK card (1.5% + 20p) | £2.45 | £3.62 | £6.63 | £12.17 | £22.70 | £44.30 |
| Stripe, international card (3.15% + 20p, plus 2% if currency is converted) | £4.93 | £7.38 | £13.70 | £25.34 | £47.45 | £92.81 |
| SumUp or Zettle payment link (2.5%) | £3.75 | £5.70 | £10.71 | £19.95 | £37.50 | £73.50 |
| PayPal (2.9% + 30p, plus 1.29% to 1.99% for payers abroad) | £4.65 | £6.91 | £12.73 | £23.44 | £43.80 | £85.56 |

A year of monthly payments for one Year 7 to 9 pupil (7 x £399.43) costs the school about **£15** by
Pay by Bank, £28 by Direct Debit, £43 by UK card and £83 by PayPal.

Other open-banking providers: Atoa is listed at 0.6% to 0.7% with no published cap (about £17.64 to
£20.58 on £2,940); TrueLayer, Yapily and Token publish no prices (quotes only). Stripe's capped Pay by
Bank is cheaper for every fee size we charge.

## Recommendation: Stripe, with Pay by Bank first and cards as a fallback

1. **One Stripe account, no monthly fee.** Stripe Payment Links need no website code: a hosted,
   secure payment page that Stripe runs, so no card or bank details ever touch our site or database.
2. **Pay by Bank as the main way to pay.** The family picks their bank and approves the payment in
   their banking app. It is the cheapest option for every payment we take (never more than £5), the
   money is confirmed straight away, and there is no chargeback: right for the first payment on
   acceptance, where the owner wants commitment. It works for UK (and Irish and Finnish) bank accounts.
3. **Cards switched on as well**, mainly for families abroad whose banks Pay by Bank does not reach.
   They cost more (see the table), so the payment page should list Pay by Bank first. The owner could
   decide later whether to add a card surcharge; that is a policy decision and is not built.
4. **Later, optional: Bacs Direct Debit for the monthly plan.** Once the first payment is in, the six
   remaining monthly payments could be collected automatically by Direct Debit through the same
   Stripe account (capped at £4 each). This needs a small Edge Function and is not built yet; until
   then, families pay each month with the same link, and the portal already shows what is due.

Why not the others: GoCardless is as cheap for Direct Debit but adds a second provider for the
one-off payments and charges more above £2,000; PayPal and SumUp cost several times more; standing
orders and bank transfers are no longer offered (owner's decision).

## How it fits this site (static website + Supabase)

The website stays static and holds no keys. Built in this pull request:

- **One setting:** `site_settings.online_payment_url` (migration 0214), the payment page's public
  https address. The owner pastes it in the portal: **Admissions > Settings > Online payment link**.
  It must start with `https://`; the database refuses anything else. Empty means no button anywhere.
- **Website Fees page** (`src/app/(marketing)/fees/page.tsx`, `src/components/PayOnline.tsx`): a
  **Pay online** button under "How to pay", shown only when the setting is filled (after the next
  site deploy, because the page is built ahead of time).
- **Portal, family Fees page** (`src/app/learn/family/fees/page.tsx`,
  `src/components/learn/fees/PayOnlinePanel.tsx`): a **Pay online** panel, shown live as soon as the
  setting is filled.
- **Offer email** (`supabase/functions/admissions-correspond/templating.ts`): under "How to pay", the
  `{{bank_details}}` token now gives the online link once it is set (and the older payment
  instructions only until then). New token `{{pay_online_link}}`.
- **Matching payments to families:** for a Stripe Payment Link (`buy.stripe.com`) the buttons add
  `client_reference_id` (the family's portal account id, or the application reference in the offer
  email) and, in the portal, `prefilled_email`. Stripe stores these on the payment, so staff can see
  who paid, and a webhook can match it later.
- **Recording:** staff record a payment in **Fees** with the new method **Online payment** (the
  default). Old records marked "Bank transfer" still show.

Next step, once the Stripe account exists (not built, needs the account's keys):

- An Edge Function `payments-webhook` that Stripe calls on `checkout.session.completed`. It checks
  the signature with `STRIPE_WEBHOOK_SECRET` (kept only in Supabase secrets, never in the repo), reads
  `client_reference_id`, amount and method, and writes a row in `fee_payments` with method `online`
  against the family's oldest unpaid charge (or flags it in the Action centre when it cannot match).
  Families would then see "Paid" without the office typing it in, and the proof-of-payment upload for
  admissions becomes unnecessary for online payments.

## What the owner needs to do

1. Open a Stripe account for the school (stripe.com/gb), in the name of the entity that receives the
   fees (the Fees Policy names An Noor Islamic School), and finish Stripe's identity and bank checks.
2. In the Stripe Dashboard, **Settings > Payment methods**: turn on **Pay by Bank** and **Cards**.
3. Create a **Payment Link**: product "Tarbiyyah Global Academy fees", price type **"Customers choose
   what to pay"** (so one link covers the application fee and every instalment), currency GBP. Add a
   required custom field "Child's full name". Turn on "Collect customers' email addresses".
4. Copy the link (it starts with `https://buy.stripe.com/`) into the portal: **Admissions >
   Settings > Online payment link**, and Save. The portal and offer emails use it at once; the
   website's button appears after the next site deploy.
5. Make a £1 test payment by Pay by Bank and by card, then refund them in Stripe.
6. Optional, for automatic matching: ask for the `payments-webhook` Edge Function to be built, then
   add the webhook in Stripe (**Developers > Webhooks**, event `checkout.session.completed`) and give
   the signing secret to whoever runs the Supabase deploy (`STRIPE_WEBHOOK_SECRET`).
7. Until step 4 is done, offer emails still show the old payment instructions from Admissions
   settings (the bank details), so families can still pay. Clear that box once the link is set.

## Sources

- Stripe UK pricing (cards, Bacs Direct Debit, Payment Links): https://stripe.com/gb/pricing
- Stripe Pay by Bank, 0.5% + 20p capped at £5, as listed for Stripe accounts by Xero:
  https://www.xero.com/uk/pricing-plans/pricing-and-fees-for-stripe/
- Stripe Pay by Bank documentation (UK banks, £0.50 to £10,000, Payment Links supported, no
  disputes): https://docs.stripe.com/payments/pay-by-bank
- GoCardless pricing comparison (Standard plan 1% + 20p, capped at £4, no monthly fee):
  https://support.gocardless.com/hc/en-gb/articles/17145011940380-Pricing-comparison
- GoCardless pricing page draft (0.3% extra on payments above £2,000):
  https://gocardless.com/draft/en-pricing-v3-79521364
- PayPal UK merchant fees (2.9% + 30p; international 1.29% or 1.99%):
  https://www.paypal.com/uk/webapps/mpp/merchant-fees
- UK payment link providers compared (SumUp, Zettle, Atoa and others), SumUp, 2026:
  https://www.sumup.com/en-gb/compare/best-payment-link-providers/
- UK open banking costs (TrueLayer, Yapily, Token quote only), Noda, December 2025:
  https://noda.live/articles/open-banking-costs-uk
