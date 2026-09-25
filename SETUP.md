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
