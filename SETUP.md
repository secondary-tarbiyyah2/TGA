# Prompt 3 setup — what's configured, what's still needed

## What's done

- Full schema, RLS (default-deny on every table), and the double-booking
  exclusion constraint: `supabase/migrations/0001_init.sql`.
- `get_open_slots()` RPC — timezone/DST-correct (tested across the Oct 2026
  UK clock change), returns times only, callable by anon.
- Edge Functions: `book-admissions-call`, `manage-booking`,
  `send-reminders` — `supabase/functions/`.
- Public booking page `/book-a-call`, `/manage-booking`, and a staff area at
  `/staff` (sign-in, bookings, weekly availability, Teams link, CSV export).
- `.github/workflows/deploy-supabase.yml` — deploys all of the above
  automatically on every push to `supabase/**`, using the two repo secrets
  you've already added (`SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY`). It also
  configures Supabase Auth to send magic links through Resend SMTP, and runs
  `supabase test db` (pgTAP) as a gate before deploying.
- pgTAP tests: `supabase/tests/database/` (slot generation, RLS). See
  `supabase/tests/README.md` for why the double-booking *race* is verified
  by the exclusion constraint itself rather than an automated test.

## Still needed from you

1. **Confirm the Supabase project exists and is named exactly `TGA`**
   (region London) — the workflow finds it by that name. If you haven't
   created it yet, do that first at supabase.com, then re-run the workflow
   (Actions tab → "Deploy Supabase backend" → Run workflow).
2. **Resend domain verification** — add these DNS records for
   `tarbiyyah.co.uk` in cPanel → Zone Editor (get the exact values from your
   Resend dashboard → Domains, they're generated per-account so I can't
   print them here):
   - 1 × TXT record (SPF)
   - 2 × CNAME records (DKIM)
3. **Seed yourself as the first staff admin** — GitHub → Actions → "Deploy
   Supabase backend" → Run workflow → fill in your email in `owner_email` →
   Run. You'll get an email; after that you can sign in at `/staff`.
4. **Wire the site's own build to the new backend** — after the workflow
   runs once, its job summary prints `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Add those (plus
   `NEXT_PUBLIC_ADMISSIONS_TEAMS_URL`, same value as the Teams link you gave
   me) to wherever the Next.js site itself gets built — see `.env.example`.
   The anon key is meant to be public; safe to commit to CI config.

## Settings layer — one manual step to make publishing actually go live

The site is statically exported, so publishing a change in Sanity Studio
doesn't appear on the live site by itself — it needs a rebuild. This is
automated (`.github/workflows/setup-sanity-webhook.yml`), but it needs two
secrets only you can create (they're credentials, not something I can
generate on your behalf):

1. **`SANITY_MANAGEMENT_TOKEN`** — sanity.io/manage → your project → API →
   Tokens → Add API token → give it a name, choose an access level that can
   manage webhooks (Editor or Administrator), copy the token.
2. **`GH_DISPATCH_TOKEN`** — github.com/settings/personal-access-tokens/new
   → Fine-grained token → repository access: only this repo → permissions:
   **Actions: Read and write**, nothing else → generate, copy the token.

Add both as repo secrets (Settings → Secrets and variables → Actions →
New repository secret), then run **Actions → "Set up Sanity auto-rebuild
webhook" → Run workflow** once. After that, every publish in Studio
triggers a fresh deploy automatically — no more manual redeploys needed for
content changes.

## Phase B: lessons, attendance, BBB — what's needed from you

Live lessons, recordings, attendance alerts, and the recording-retention
job all need a real BigBlueButton (BBB) server. Nothing in this codebase
provisions one — that's an infrastructure decision only you can make. Once
you have one:

1. **Provision a self-hosted BBB server.** BBB publishes an official
   install script for Ubuntu 22.04 — see
   https://docs.bigbluebutton.org/administration/install/ (needs a
   dedicated VM/VPS with a public IP, a domain, and enough RAM/CPU for your
   expected concurrent lesson count — BBB's own sizing guide covers this;
   it cannot run on the same 2GB shared server the static site deploys to).
   After install, run `bbb-conf --secret` on the server to get its shared
   secret.
2. **Add repo secrets** (Settings → Secrets and variables → Actions → New
   repository secret):
   - `BBB_SERVER_URL` — e.g. `https://bbb.tarbiyyah.co.uk`
   - `BBB_SECRET` — the shared secret from step 1
   - Optionally `BBB_CHECKSUM_ALGORITHM` — `sha256` (default, BBB ≥ 2.6) or
     `sha1` for an older server; check with `bbb-conf --version`.
3. **Add the same two as Supabase Edge Function secrets** (`supabase
   secrets set BBB_SERVER_URL=... BBB_SECRET=...` against the linked
   project, or via the Supabase dashboard → Edge Functions → Secrets) —
   the Edge Functions (`lesson-join`, `recording-control`,
   `recording-access`) need them at runtime, separately from the GitHub
   Actions secrets above (which the two scheduled jobs use).
4. **Deploy the new Edge Functions and migration** — they deploy the same
   way as every other Edge Function here, via
   `.github/workflows/deploy-supabase.yml` on push (nothing extra to run).
5. **Generate lesson instances once a timetable is published** — from
   `/learn/admin/lessons`, select the published run and use "Generate
   lesson instances" for the date range you want live lessons to exist for
   (re-run it periodically, e.g. weekly, to keep generating further ahead —
   this isn't automated yet, see below).
6. **Set retention/alerting values** at `/learn/admin/settings` (defaults:
   90-day recording retention, 60-minute absence alert delay, 3 unexplained
   absences in 30 days before Safeguarding Lead escalation) — change them
   to match your actual policy.
7. **Fill in Site settings in Sanity Studio**: `safeguardingLeadContact`
   (an email address — the absence-escalation job only sends if it looks
   like one) and `admissionsEmail` (used as the Head Teacher's absence
   digest recipient — there's no dedicated "Head Teacher email" field yet;
   see the report for why `admissionsEmail` was reused instead of adding
   one).

Both new scheduled jobs (`lms-recording-retention.yml`,
`lms-absence-alerts.yml`) already run on a schedule once these secrets
exist — no extra step needed beyond adding the secrets.

**Known residual risk, not fixed by configuration:** BBB's built-in
in-meeting chat is whole-class by default in the settings this integration
applies (`lockSettingsDisablePrivateChat: true` on meeting creation), which
is the mitigation for "no unsupervised private teacher-student channel" —
but this is a per-meeting BBB setting enforced at meeting creation, not a
platform-wide lock. If BBB is ever upgraded/reconfigured independently of
this codebase, re-verify that setting still applies. See the final report
for the full reasoning.

## Phase C: homework, assessment, reports, messaging, e-signature — what's needed from you

Almost everything in this phase runs on migrations/RLS already, so there's
less to configure than Phase B. Still:

1. **Nothing to create manually for Supabase Storage.** Unlike a typical
   Supabase project, the `homework-submissions` bucket (private, 20MB
   limit, PDF/image/Word/text only) is created BY the migration
   (`0010_homework.sql`, `insert into storage.buckets ...`) — it appears
   automatically once migrations run against your project, no dashboard
   step needed.
2. **Deploy the schema + new scheduled jobs** the same way as every other
   migration/workflow here — `.github/workflows/deploy-supabase.yml`
   picks up the new migrations on push; the three new scheduled workflows
   (`messaging-retention.yml`, `nudge-outstanding-signatures.yml`,
   `sync-signable-documents.yml`) start firing on their own schedule once
   merged — no extra secrets beyond what Phase A/B already added
   (`SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY`, `SANITY_IO`,
   `NEXT_PUBLIC_SANITY_PROJECT_ID`).
3. **Mark which policies require a signature, in Sanity Studio.** Open any
   Policy document, tick "Requires e-signature on /learn", and choose
   "Who must sign" (the /learn role vocabulary). Run the "Sync signable
   documents from Sanity" workflow once by hand
   (`workflow_dispatch` on `sync-signable-documents.yml`) after setting
   this up the first time, rather than waiting for its nightly schedule —
   after that it stays in sync automatically. Nothing needs setting in the
   database directly; that table is Sanity-synced only, same as `terms`.
4. **Set `message_retention_days`** in the `messaging_settings` table
   (default 730 days / ~2 school years) to match your actual data-retention
   policy — there's no admin-UI screen for this one yet (see "deliberately
   not built" below), so it's a one-off SQL update against your project:
   `update messaging_settings set message_retention_days = <n>;`.
5. **Add at least one assessment type, mark scheme and set of grade
   boundaries** from `/learn/admin/reports` before teachers start entering
   grades — the list ships with five starter assessment types
   (`insert`-ed by the migration) but NO mark schemes, since those are
   genuinely school-specific.
6. **Review the starter safeguarding keyword list** at
   `/learn/admin/compliance` (Safeguarding Lead or Head Teacher/Admin) —
   six illustrative phrases ship in the migration; extend it to match your
   actual safeguarding policy before relying on it.

## "Your Child's Week" quiz + per-year-group sample weeks — what's needed from you

Runs on migrations/RLS already (`0016_eligibility_quiz_v2.sql`), and the
public `/eligibility` page works out of the box on bundled fallback copy
(`src/lib/quiz/defaultConfig.ts`) even before any of this is done. Still:

1. **Publish an initial quiz config.** Visit `/learn/admin/quiz` as a Head
   Teacher/Admin — a draft is seeded automatically from the bundled
   default copy the first time the page loads. Review it and click
   "Publish draft" so the public quiz reads from the database (and shows
   a real "last updated" date) instead of the bundled fallback.
2. **Mark a public sample week per year group.** Under the "Sample weeks"
   tab, for each year group pick one of your PUBLISHED `timetable_runs`
   and publish it as that year group's public sample week. Until this is
   done for a year group, the quiz shows the honest "no sample week yet"
   fallback for it — never a fabricated timetable — and the same tab
   shows you exactly which year groups still need this.
3. **No new secrets or scheduled workflows** — this phase reuses the
   existing Supabase anon-key client and `leadRef()`/`register.php` lead
   mechanism already deployed; nothing new to add to
   `deploy-supabase.yml`.

## Compliance area (Phase D) — what's needed from you

Everything under `/learn/admin/compliance` runs on migrations/RLS already
(`0015_compliance.sql`), so there's little manual setup — but this is the
most sensitive area of the app, so read this section before relying on it.

1. **Nothing to create manually for Supabase Storage.** The
   `safeguarding-attachments` bucket (private, 20MB limit, PDF/image/text
   only) is created BY the migration, same as `homework-submissions` in
   Phase C.
2. **Deploy the schema + two new scheduled jobs** the same way as every
   other migration/workflow here — `compliance-retention.yml` (daily) and
   `check-scr-expiry.yml` (weekly) start firing on their own schedule once
   merged, with no new secrets beyond what earlier phases already added.
3. **Set up MFA (any Safeguarding Lead / Head Teacher account must have an
   authenticator app enrolled)** before trying to open the safeguarding
   log — it's gated behind a FRESHLY re-entered code (not just "signed in
   with MFA earlier"), by design (see the migration header and the final
   report for the reasoning). If you see "Set up an authenticator app from
   any other admin page first", visit any other admin page to enroll, then
   come back.
4. **Review/extend the safeguarding classification list**
   (`safeguarding_categories`) and the **consent wording**
   (`consent_wordings`) to match your school's actual safeguarding policy
   and actual parental-consent letter wording — both ship with small,
   clearly illustrative starter content, the same convention as Phase C's
   safeguarding-keyword list.
5. **Populate the Single Central Record** (`/learn/admin/compliance`, Head
   Teacher/Admin) for every existing staff member — nothing is
   pre-populated, since DBS/reference/right-to-work data is genuinely
   school-specific and was never anywhere in this codebase before this
   phase.
6. **Decide on closed-safeguarding-concern retention by hand.** The
   registry lists a 25-year anonymise-don't-delete entry for closed
   safeguarding concerns, but deliberately has NO automated job wired up
   for it (see `retention_schedule`'s seed row and the migration header) —
   this is exactly the kind of decision (when a child-protection case file
   stops mattering) that should never run unattended. Review closed cases
   periodically by hand instead.
7. **`RESEND_API_KEY`** (already added in earlier phases) is reused for
   `check-scr-expiry.yml`'s best-effort email to the Head Teacher; without
   it, the weekly Actions run summary is still the real notification.

## `/learn` UX fixes — what's needed from you

Real first-use feedback from someone actually using `/learn` surfaced a
batch of genuine problems, now fixed in code: the public marketing
Header/Footer no longer render on top of `/learn`'s own shell (see
`src/app/(marketing)/layout.tsx` vs `src/app/learn/layout.tsx`), a single
account menu (top-right of every `/learn` page) now holds account
settings/sign-out instead of a buried sidebar text link, MFA now offers a
30-day "remember this device" so an enrolled admin isn't re-challenged on
every sign-in, the admin People flow now adds several children to one
family in a single pass, and timetable generation can now be triggered from
a button on `/learn/admin/lessons` instead of GitHub Actions. Only the last
of these needs anything from you:

1. **Add `GH_DISPATCH_TOKEN` as an Edge Function secret too.** You already
   created this token for the Sanity publish webhook (see "Settings layer"
   above) — it's a fine-grained GitHub PAT scoped to only this repo with
   "Actions: Read and write", which already covers firing
   `workflow_dispatch` on `generate-timetable.yml` as well as the
   `repository_dispatch` the Sanity webhook uses, so there's no need for a
   second token. What IS needed: that secret currently only exists as a
   **GitHub Actions repo secret** (Settings → Secrets and variables →
   Actions) — the new `trigger-timetable-generation` **Edge Function** reads
   it as a **Supabase Edge Function secret**, a separate store. Add it once
   with `supabase secrets set GH_DISPATCH_TOKEN=<the same token>` against
   the linked project (or via the Supabase dashboard → Edge Functions →
   Secrets). Without this, the "Generate timetable" button on
   `/learn/admin/lessons` shows "not configured" instead of dispatching the
   workflow — GitHub Actions → "Generate timetable" → Run workflow by hand
   still works as a fallback either way.
2. **Deploy the new migration and Edge Function** the same way as every
   other one here — `.github/workflows/deploy-supabase.yml` picks up
   `0017_trusted_devices.sql` and `trigger-timetable-generation` on push, no
   extra step needed beyond #1 above.

**Judgement call — trusted-device storage:** this site is a static export
with no server (see `next.config.ts`), so there is no place to set a real
httpOnly cookie. The "remember this device" token is stored in
`localStorage` instead of a `document.cookie` value — a cookie here would
carry `Secure; SameSite=Strict` but gain none of a real cookie's actual
protection (no server ever reads it), while still being readable by any
script exactly like localStorage, and would additionally be attached to
every same-site request for no benefit. See
`src/lib/learn/trustedDevice.ts` for the full reasoning. Practical effect:
clearing site data, private browsing, or switching browsers all "forget"
the device, which fails toward asking for MFA again — never toward skipping
it when it shouldn't.

**Judgement call — no CSV import for the People flow:** the reported pain
point was "a family with a handful of children" and "several families in a
row", not bulk-loading an entire school roll at once. The fix lets the
guided flow add multiple children to one family without restarting, and
offers a clear "Start another family" action, which addresses both directly
without adding a CSV parser, validation UI, and partial-failure handling
for a bulk-import use case that wasn't actually reported. Worth
reconsidering only if onboarding an entire year group's worth of families
at once turns out to be a real, recurring need.

## Moving `/learn` to its own subdomain — what's needed from you

`/learn` (the authenticated portal — admin/teach/family/student dashboards,
sign-in) is moving off a path under `globalacademy.tarbiyyah.co.uk` onto its
own subdomain, `learn.tarbiyyah.co.uk`. This is a security
change, not a cosmetic one: right now the portal and the public marketing
site share one browser origin, so an XSS bug anywhere on the public site
(a comment field, a compromised script, anything) could in principle read
the portal's session token out of localStorage and act as a signed-in
user. A separate subdomain is a separate origin — the browser itself then
refuses that access, with no code on either side able to opt back in.

All the code/config for this is written and pushed to
`claude/sweet-albattani-e7fav5`, but **it cannot go live until you do one
thing only you can do**: create the subdomain in hosting. Do this BEFORE
merging/deploying this branch, in this order:

1. **Create the subdomain and its document root.** In cPanel (or your
   host's equivalent) → Domains/Subdomains → create
   `learn.tarbiyyah.co.uk`, pointed at a NEW, separate
   document root (not the same folder the main site's FTP account
   already deploys to — it needs its own folder so the two builds
   (`out-main/` and `out-learn/` — see `scripts/split-static-export.mjs`)
   don't collide). DNS for a cPanel subdomain is usually created
   automatically as part of this step; if your DNS is managed elsewhere,
   add an A/CNAME record for `learn.tarbiyyah.co.uk` pointing at the same
   server the main site already resolves to.
2. **Create a SEPARATE FTP account scoped directly to that document root**
   (cPanel → FTP Accounts → Create FTP Account, directory =
   `public_html/learn` or wherever step 1 put it) — do NOT reuse the main
   site's `FTP_USERNAME`/`FTP_PASSWORD`. This is required, not just
   convenient: that account is itself scoped ("chrooted") to the MAIN
   site's own document root, confirmed live when a first attempt at this
   migration used it with a `server-dir` of `public_html/learn/` — instead
   of reaching the real subdomain folder, it silently created a nested
   phantom folder INSIDE the main site's own docroot
   (`public_html/globalacademy.tarbiyyah.co.uk/public_html/learn/`,
   provably reachable at the time via
   `https://globalacademy.tarbiyyah.co.uk/public_html/learn/index.html`
   returning the `/learn` build's own HTML) while the real
   `learn.tarbiyyah.co.uk` document root stayed empty and 404'd. A chroot
   can't be escaped with any relative path, so no secret value fixes this
   with the same account — only a second account scoped to the right
   directory does.
3. **Add two repo secrets** (Settings → Secrets and variables → Actions →
   New repository secret): `FTP_LEARN_USERNAME` and `FTP_LEARN_PASSWORD`,
   from the account created in step 2. `deploy-site.yml`'s second FTP step
   is conditional on `FTP_LEARN_USERNAME` being set — until it is, the
   pipeline keeps deploying only the main site, exactly as before, so
   there's no risk of a half-broken deploy in the meantime.
4. **Re-run the deploy.** Push to this branch (or `workflow_dispatch` →
   "Deploy site") — this builds `out-main/`/`out-learn/` and now deploys
   both, the second one using the new dedicated FTP account with
   `server-dir: ./` (its home directory already IS the subdomain's
   document root).
5. **You do NOT need to touch the Supabase dashboard by hand for the Auth
   allowlist** — `deploy-supabase.yml`'s "Configure Auth" step already adds
   `https://learn.tarbiyyah.co.uk/**` to `uri_allow_list`
   declaratively (alongside the existing main-domain and localhost entries)
   and runs on every push to `supabase/**`, so it takes effect automatically
   the next time that workflow runs (or trigger it by hand once via
   `workflow_dispatch` if you want it live sooner, without waiting for an
   unrelated Supabase change).
6. **Optional: override `LEARN_SITE_URL`** (Settings → Secrets and
   variables → Actions → Variables) only if the portal's real address will
   ever differ from `https://learn.tarbiyyah.co.uk` — it
   feeds both the frontend build (`NEXT_PUBLIC_LEARN_ORIGIN`, see
   `src/lib/learn/origin.ts`) and the Supabase Auth/Edge Function config, so
   changing it in one place updates every link and redirect together. Leave
   it unset to use that default.

**What was already sent before this migration.** Real invite and
password-reset emails went out this session pointing at
`globalacademy.tarbiyyah.co.uk/learn/login/invite`. Those links keep
working: `public/.htaccess` falls back any `/learn/*` request on the main
domain to a small bridge page
(`deploy/learn-bridge.html`) that reads the link's own URL (including the
`#access_token=...` fragment Supabase's invite/recovery links carry) and
redirects the browser to the equivalent address on the new subdomain,
carrying that fragment over explicitly — this was chosen over a plain
server-side 301 specifically so an already-sent link can't silently break.

**Do not delete the old `/learn/` bridge folder from the main domain**
after the subdomain goes live — as long as any invite/reset link sent
before this migration might still be unused in someone's inbox, that
bridge is what keeps it working.

**Why `learn.tarbiyyah.co.uk`, not `learn.globalacademy.tarbiyyah.co.uk`.**
The portal was originally built at the latter (one level under the
marketing site's own subdomain), but that is a SECOND level of subdomain
below the registered apex (`tarbiyyah.co.uk`). Cloudflare's free Universal
SSL certificate only covers the apex plus ONE level of wildcard
(`tarbiyyah.co.uk` + `*.tarbiyyah.co.uk`) — confirmed by inspecting the
actual certificate presented for each hostname — so the two-level address
got no certificate at all (browser: `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`,
not a graceful fallback). It was renamed to `learn.tarbiyyah.co.uk`, one
level deep, which the existing wildcard covers for free. Do not move it
back under `globalacademy.*` unless Cloudflare's paid Advanced Certificate
Manager add-on (~$10/mo) is bought to cover that depth.

## Deliberately not built yet

- Admin management of staff/meeting-types/families from `/staff` (only the
  signed-in staff member's own bookings/availability/Teams link) — there's
  no Parent or Student Portal yet for that to serve (Prompts 5–6), so it
  wasn't worth building blind.
- True in-place reschedule on `/manage-booking` — "cancel, then book a new
  time" for now, not an atomic pick-new-slot-and-release-old-one flow.
- Microsoft Graph integration (per-booking unique Teams meetings) — the
  meeting-link logic is structured so this can be added later without a
  rebuild, per the brief, but isn't built now.
- Automatic, ongoing `lesson_instances` generation — an admin currently
  re-runs "Generate lesson instances" by hand for each date range needed.
  A scheduled workflow that keeps generating, say, the next 4 weeks on a
  rolling basis would be a natural follow-up (same cron-batch pattern as
  everything else here) but wasn't built to keep this phase's scope
  reviewable.
- A dedicated "Head Teacher contact email" field in Sanity's siteSettings —
  the absence-alert digest currently reuses `admissionsEmail` for this,
  since no such field exists yet; see the final report.
- Approval workflow for the eligibility-based discounts in Sanity's
  `discounts` catalogue (bursaries etc.) — the parent/admin fee views in
  `/learn` only ever show the sibling discount (computed from real
  enrolments), never the self-reported ones, because no system yet records
  which family was actually approved for which discount.
- An admin UI screen for `messaging_settings.message_retention_days` —
  it's a real, RLS-governed, scheduled-job-enforced setting (see Phase C
  above), just without its own settings-page field yet; the same one-off
  SQL update works until that's added.
- A drawn-signature pad for e-signature — deliberately not built (see the
  final report): typed name + affirmation checkbox is the standard,
  legally-sufficient approach for internal policy acknowledgement and
  consent capture, and a signature pad would add complexity without
  adding legal weight here.
- Real-time (websocket) message delivery — `/learn` messaging is
  request/response (send, then the next load/poll picks it up), matching
  every other `/learn` data view in this codebase (no realtime
  subscriptions used anywhere else either); a parent/teacher conversation
  refreshes on next visit/action rather than pushing instantly.
- A UI for editing an individual `document_signatures` row, or for
  un-signing — deliberate: no edit/retract policy exists in the schema at
  all (see 0014_esignature.sql), so there is nothing for a UI to expose.
- An automated deletion/anonymisation job for closed safeguarding concerns
  — deliberate, see "Compliance area" above.
- A public self-serve data-rights request form — `data_rights_requests` is
  currently logged by Head Teacher/Admin after a request arrives by
  whatever channel a person actually used (email, letter, in person),
  matching how schools handle SARs today; a public form could be added
  later without a schema change, but wasn't built now to avoid an
  unauthenticated write surface into a GDPR-sensitive table.
- Right-to-work document number/image storage — deliberately never
  captured at all (verified/date/type/verifier only); see
  0015_compliance.sql's `staff_vetting_records` header for the reasoning.
- An RLS policy letting a `can_export_data` holder who ISN'T Head
  Teacher/Admin/Admissions reach `/learn/admin/compliance` at all —
  `LearnGate` gates by role, not by add-on permission, so a plain
  Teacher/TA holding only `can_export_data` currently can't open the page
  to use their export access, even though the underlying RLS would allow
  the reads. In practice `can_export_data` is expected to be granted
  alongside an admin-ish role; widening `LearnGate` to understand
  permissions (not just roles) would fix this properly but touches a
  shared component used by every `/learn` page, so it wasn't done under
  this phase's time budget. See the final report.
- Actually emailing the "Your Child's Week" plan as a PDF — the "Email me
  this plan" CTA saves email + explicit consent as a real `quiz_leads` row
  (the GDPR-critical part, schema-enforced and pgTAP-tested) but does not
  yet generate or send a PDF; the confirmation copy says a family's plan
  is saved and admissions will follow up, which is accurate today. Sending
  an actual PDF needs a templating/PDF-generation step and an Edge
  Function (or a mailer endpoint alongside `register.php`/`apply.php`)
  that doesn't exist yet — see the final report for the reasoning.
- Hot-reloading the `/eligibility` page's intro heading/kicker/body from
  the published quiz config without a rebuild — that copy is read from
  the bundled `DEFAULT_QUIZ_CONFIG` at build time (the page is a static
  server component), while the questions/rules/result copy the admin
  edits at `/learn/admin/quiz` are live immediately (fetched client-side).
  Editing the intro copy currently means updating `defaultConfig.ts` and
  redeploying; wiring the server component to fetch the published version
  at build time (same pattern as `getSiteSettings()`) would fix this.


## Live policies, uploads and open evenings (migrations 0086 and 0087)

- **Policies are live without a rebuild.** `/policies` (and the FAQs and
  open-evening pages) re-read Supabase in the visitor's browser with the
  public anon key; the build-time copy is only the first paint and the
  fallback. The admin editor ("Website content" > "Policy documents") says
  "Changes are live immediately" and no longer triggers a rebuild for policies.
- **Policy files** (PDF or Word `.docx`) are uploaded to the public
  `policy-documents` bucket but are linked as `/policies/<slug>.pdf` on the
  main site. `deploy/policy.php` (copied into `out-main/` by
  `scripts/split-static-export.mjs`, same idea as `calendar.php`) and the
  rewrite in `public/.htaccess` stream the current file through the
  `policy-file` Edge Function, so no `supabase.co` address is visible. If
  nothing is uploaded for a slug, it falls back to the PDF bundled in
  `public/policies/`. The project ref is hard-coded in `policy.php`, exactly
  as in `calendar.php`: change both if the project moves.
- **Documents to sign** can be uploaded (PDF or `.docx`) in Documents &
  signatures > "New document to sign". The original goes in the private
  `signable-documents` bucket. A PDF is the file people sign; for a `.docx`
  the text is extracted in the browser (no library) and the signed copy is a
  clean PDF built from that text. Replacing a file is a new version.
- **"Sync signable documents from Sanity"** only ever touches rows with
  `source = 'sanity'`, so it keeps working unchanged next to policy and portal
  documents; it can be switched off once nothing in Sanity needs a signature.
- **Open evenings:** admin page `/admin/open-evening` (Headteacher, Admin,
  Admissions). Parents book on `/open-evening` via the `open-evening-book`
  Edge Function (honeypot, minimum fill-in time, per-IP/per-email rate limit,
  capacity enforced inside `open_evening_book()` under a row lock). It emails
  the parent a confirmation with an .ics and the joining link and notifies
  `ADMISSIONS_EMAIL`. `open-evening-reminders.yml` (hourly) calls
  `open-evening-reminders`, which sends a reminder in the 24 hours before.
  Both new functions deploy with `--no-verify-jwt` (see `deploy-supabase.yml`).

## Email via Amazon SES (optional, replaces Resend)

Every email the site sends goes through one of three providers, each used
only when its secrets exist, tried in this order:

1. **Microsoft 365** (`MS_*` secrets): sent from the school's Outlook mailbox.
   The same app registration also creates Teams meetings for lessons and
   reads Teams attendance: see `docs/microsoft-365-setup.md`.
2. **Amazon SES** (`AWS_SES_*` secrets): `supabase/functions/_shared/ses.ts`,
   and `scripts/lib/sendMail.mjs` for the scheduled GitHub Actions jobs.
3. **Resend** (`RESEND_API_KEY`): the original provider, kept as a fallback.

Sign-in (magic link) emails are sent by Supabase Auth over SMTP: Amazon SES
SMTP when `SES_SMTP_USER`/`SES_SMTP_PASS` are set, otherwise Resend SMTP
(`.github/workflows/deploy-supabase.yml`, "Configure Auth").

**AWS setup (done October 2026, region Europe (Stockholm), `eu-north-1`):**

- SES identity `globalacademy.tarbiyyah.co.uk` with Easy DKIM, and custom
  MAIL FROM domain `mail.globalacademy.tarbiyyah.co.uk`. DNS in Cloudflare
  (all DNS only, never proxied): three `<token>._domainkey.globalacademy`
  CNAMEs to `<token>.dkim.amazonses.com`, MX `mail.globalacademy` →
  `10 feedback-smtp.eu-north-1.amazonses.com`, TXT `mail.globalacademy` →
  `v=spf1 include:amazonses.com ~all`. DMARC is inherited from the existing
  `_dmarc.tarbiyyah.co.uk` record.
- Production access requested (until approved, SES only delivers to
  verified addresses).
- IAM user `tga-ses-sender` with a policy allowing only `ses:SendEmail` and
  `ses:SendRawEmail`; its access key is the `AWS_SES_ACCESS_KEY_ID` /
  `AWS_SES_SECRET_ACCESS_KEY` pair. SMTP credentials come from SES → SMTP
  settings.

**GitHub repository secrets** (Settings → Secrets and variables → Actions):
`AWS_SES_REGION` (`eu-north-1`), `AWS_SES_ACCESS_KEY_ID`,
`AWS_SES_SECRET_ACCESS_KEY`, `SES_SMTP_USER`, `SES_SMTP_PASS`. Then re-run
"Deploy Supabase backend" so they reach Supabase. Nothing AWS-related ever
goes in the website code or a `NEXT_PUBLIC_*` variable.

The SES identity lives in Stockholm only: in the AWS console, select
Europe (Stockholm) before looking for it.

## Staff preview site (pre-launch)

While the public address shows the holding site, staff see the full website at
**https://preview.tarbiyyah.co.uk**. Both are served from the same deployed
files; `public/.htaccess` (the PRE-LAUNCH block) picks the site by address.

One-time setup:

1. **Cloudflare → DNS → Add record:** type `CNAME`, name `preview`, target
   `globalacademy.tarbiyyah.co.uk`, proxy status **Proxied** (orange cloud).
   The free wildcard certificate already covers `*.tarbiyyah.co.uk`.
2. **cPanel → Domains → Create a new domain:** `preview.tarbiyyah.co.uk`,
   untick "Share document root" and set the document root to the SAME folder
   the main site is deployed to: `public_html/globalacademy`. No second
   deploy or FTP account is needed.

The portal (learn.tarbiyyah.co.uk) is staff-only too until launch
(`deploy/learn-subdomain.htaccess`). Staff open `https://preview.tarbiyyah.co.uk/?key=<key>`
(or `https://learn.tarbiyyah.co.uk/?key=<key>`) once per browser (access is renewed on every visit, so it does not expire while used); the cookie is
set for `*.tarbiyyah.co.uk`, so either link opens both
(key: `deploy/preview-key.txt`, or the `PREVIEW_KEY` secret if set). Without it
the address shows a short "staff only" page. Every preview response carries
`X-Robots-Tag: noindex` and its `robots.txt` disallows everything. Change the
key and redeploy to cut off old links. At launch, delete the PRE-LAUNCH block
and the preview subdomain.
