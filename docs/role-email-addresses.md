# Role email addresses

Owner's request (11 November 2026, Tafweed 3, item T74): "compile list of emails that need to be made
for different roles so not every team is globalacademy@tarbiyyah.co.uk, for e.g. Finance team should
be finance@globalacademy.tarbiyyah.co.uk, and complaints etc".

Today almost everything uses **globalacademy@tarbiyyah.co.uk**. Below is each mailbox to create, what
it is for, and every place in the site, portal, policies and emails that should switch to it.

## How the code handles this now

All addresses live in one file: `supabase/functions/_shared/contacts.ts` (`ROLE_EMAILS`), re-exported
for the website and portal from `src/content/contacts.ts`. Pages, portal screens and Edge Functions
read the role they need (`ROLE_EMAILS.finance`, `ROLE_EMAILS.safeguarding` and so on).

**Every value is still the address that works today.** The new address for each role is written
beside it and in `PLANNED_ROLE_EMAILS`, but is not shown anywhere yet. Why: if a page showed
`complaints@...` before that mailbox exists, a parent's complaint would bounce or vanish, and some of
these addresses also send or receive automated email. So nothing visible changes until the owner has
created a mailbox and confirmed it receives mail. Then the switch is one line per role in
`contacts.ts` (plus the extra steps marked below), and every place that uses the role changes at once.

## The mailboxes

Suggested as shared mailboxes in the school's Microsoft 365 (several staff can open one, and it
stays when staff change). Addresses follow the owner's example: `role@globalacademy.tarbiyyah.co.uk`.

| Mailbox | Role in code | What it is for | Who reads it |
| --- | --- | --- | --- |
| `admissions@globalacademy.tarbiyyah.co.uk` | `admissions` | Applications, offers, admissions calls, open evenings and the taster morning, proof of payment uploads, reply-to on admissions emails | Admissions lead and office |
| `finance@globalacademy.tarbiyyah.co.uk` | `finance` | Fees, online payments, payment plans, missed payments, refunds, withdrawal notices | Finance team, Headteacher |
| `complaints@globalacademy.tarbiyyah.co.uk` | `complaints` | Formal complaints under the Concerns and Complaints Policy | Headteacher; Chair of Trustees for stage 3 |
| `safeguarding@globalacademy.tarbiyyah.co.uk` | `safeguarding` | The Designated Safeguarding Lead and deputies (backlog T23 suggested `safeguarding.globalacademy@tarbiyyah.co.uk`; use one pattern for all) | DSL and deputy DSLs only |
| `absence@globalacademy.tarbiyyah.co.uk` | `attendance` | Already exists: parents report absence; the portal reads it and records the absence (`docs/absence-email-setup.md`) | Read by the portal; unclear ones go to Absences > Emails |
| `exams@globalacademy.tarbiyyah.co.uk` | `exams` | International GCSE entries, access arrangements, private candidates, results | Exams officer |
| `careers@globalacademy.tarbiyyah.co.uk` | `careers` | Job applications and recruitment | Headteacher, recruitment panel |
| `hr@globalacademy.tarbiyyah.co.uk` (optional) | `hr` | Staff contracts, staff absence, safer recruitment checks (DBS, references) | Headteacher, HR |
| `dpo@globalacademy.tarbiyyah.co.uk` | `dataProtection` | Data protection officer: subject access requests, data breaches, privacy questions | The DPO |
| `support@globalacademy.tarbiyyah.co.uk` | `itSupport` | Portal sign-in problems, devices, Teams and website issues | Digital lead |
| `senco@globalacademy.tarbiyyah.co.uk` (optional) | `senco` | SEND questions and EHC plan paperwork | SENCo |
| `globalacademy@tarbiyyah.co.uk` (keep), or `info@globalacademy.tarbiyyah.co.uk` | `general` | General enquiries; printed on the prospectus and footer | Office |
| `gbchair@tarbiyyah.co.uk` (exists) | `chair` | Chair of Trustees | Chair |

Not a mailbox: `noreply@globalacademy.tarbiyyah.co.uk` (`NOREPLY_EMAIL`) is only the address
automated email is sent from.

## Where each address belongs

| Role | Website and portal | Policies (`content/policies/`) | Emails and functions |
| --- | --- | --- | --- |
| admissions | Booking (`src/components/booking/BookingCalendar.tsx`, `src/app/(marketing)/book-a-call/page.tsx`), register interest (`src/components/RegisterInterestForm.tsx`), old application form (`src/components/ApplicationForm.tsx`), apply form (`FALLBACK_ADMISSIONS_EMAIL` in `src/components/admissions/applicationShared.ts`), open evening (`src/components/OpenEveningLive.tsx`, `open-evening/manage/ManageOpenEveningClient.tsx`), manage booking (`manage-booking/ManageBookingClient.tsx`), entry assessment end screen (`src/components/learn/assess/AssessmentSitting.tsx`) | 24 Admissions | `site_settings.admissions_email` (the `{{school_email}}` in admissions emails), `ADMISSIONS_EMAIL` secret: staff alerts in `admissions-submitted`, `admissions-payment-proof`, `book-admissions-call`, `manage-booking`, `open-evening-book`, `open-evening-reminders`, `parent-evening-confirm`; reply-to on all automated email (`_shared/resend.ts`) |
| finance | Fees page "How to pay" (`src/app/(marketing)/fees/page.tsx`), family Fees page (`src/app/learn/family/fees/page.tsx`, "contact the office") | 25 Fees, sections 6 (late payment) and 7 (withdrawing) | Payment reminders and receipts, when built |
| complaints | Concerns and complaints are not yet on a web page of their own | 26 Concerns and Complaints (formal complaint) | |
| safeguarding | Safeguarding page (`src/app/(marketing)/safeguarding/page.tsx`, used when the DSL contact in Settings is empty), portal Report a concern | 01 Child Protection and Safeguarding (DSL and Headteacher rows), 05 | Safeguarding alerts (`notify-flagged-messages`, `safeguarding-review-check`) |
| attendance | Family absences (`src/components/learn/absences/FamilyAbsences.tsx`), staff Emails tab (`EmailAbsences.tsx`, `ABSENCE_INBOX`) | 08 Attendance | `inbound-absence` (`ABSENCE_INBOX_EMAIL`) |
| exams | | 19 Examinations and Private Candidates | |
| careers | Careers page (`src/app/(marketing)/careers/page.tsx`, today the admissions address); Recruitment settings default (`src/components/learn/recruitment/RecruitmentSettingsPanel.tsx`) | 30 Safer Recruitment | `careers-apply` fallback inbox; `recruitment_settings.notify_email` (set in the portal) |
| dataProtection | Privacy page (`src/app/(marketing)/legal/privacy/page.tsx`) | 28 Data Protection | |
| itSupport | Portal sign-in page and help (not shown yet) | 02 Online Safety | |
| general | Footer, contact page, accessibility page, terms page, policy directory, prelaunch page, site metadata (`src/app/layout.tsx`), report letterhead (`src/components/learn/reports/ReportDocument.tsx`) | Policy PDF header (`scripts/build-policies.cjs`) | Push notification contact (`push-notify`, `VAPID_SUBJECT`) |

## Spots that send or receive email: keep the current address until the mailbox exists

Changing any of these before the mailbox can send or receive would break email:

1. **Reply-to on every automated email**: `ADMISSIONS_EMAIL` secret, else `ROLE_EMAILS.admissions`
   (`supabase/functions/_shared/resend.ts`). Change the GitHub secret `ADMISSIONS_EMAIL` and the
   portal's **Settings > Admissions email** together.
2. **Staff alert inboxes**: the same `ADMISSIONS_EMAIL` (new applications, payment proofs, bookings,
   open evening sign-ups). `careers-apply` falls back to `ROLE_EMAILS.careers` when Recruitment
   settings has no notify address.
3. **Sending mailbox in Microsoft 365**: `MS_SENDER_EMAIL` secret (see
   `docs/microsoft-365-setup.md`). Must be a real licensed mailbox; leave it as it is.
4. **Sender address**: `MAIL_FROM_EMAIL` (default `noreply@globalacademy.tarbiyyah.co.uk`) in
   `_shared/resend.ts` and `scripts/lib/sendMail.mjs`. Unchanged.
5. **Website PHP forms** (`public/register.php`, `public/apply.php` via `public/_mailer.php`):
   recipient and sender come from `register.config.php` on the server (default
   `globalacademy@tarbiyyah.co.uk`). Change on the server only.
6. **Absence inbox**: `absence@globalacademy.tarbiyyah.co.uk` receives mail through Resend (an MX
   record on `globalacademy.tarbiyyah.co.uk`). See the DNS note below.
7. **Policies** are text, not code: policy 25 (finance team, withdrawal notice), 26 (complaints)
   and 01 (DSL) still say `globalacademy@tarbiyyah.co.uk`. Each needs a reworded line (and a
   migration for the live text) once its mailbox exists.

## DNS note before creating `...@globalacademy.tarbiyyah.co.uk` mailboxes

`globalacademy.tarbiyyah.co.uk` is a subdomain. For Microsoft 365 to hold mailboxes on it, it must be
added as a domain in Microsoft 365 with its **MX record pointing to Microsoft 365**. If the absence
email set-up (`docs/absence-email-setup.md`) has already put a Resend MX record on that same
subdomain, the two clash. Pick one before creating the mailboxes:

- **A (owner's pattern):** add `globalacademy.tarbiyyah.co.uk` to Microsoft 365, point its MX there,
  and either forward `absence@` from Microsoft 365 to a Resend receiving address or move the parser to
  `absence@in.globalacademy.tarbiyyah.co.uk` (already supported: set the `ABSENCE_INBOX_EMAIL`
  variable and update `ROLE_EMAILS.attendance`).
- **B (no DNS change):** use the main domain, e.g. `finance.globalacademy@tarbiyyah.co.uk`, as T23
  suggested for safeguarding.

## What the owner needs to do

1. Choose the address pattern (A or B above) and which optional mailboxes to have (hr, senco, info).
2. Create the shared mailboxes and add the staff who should read each one.
3. Send a test email to each, from outside the school, and check it arrives.
4. Tell us which are ready. For each, we change one line in `contacts.ts`, reword the policy lines
   listed above (with a migration for the live text), and for admissions also update the
   `ADMISSIONS_EMAIL` secret and **Settings > Admissions email**.
