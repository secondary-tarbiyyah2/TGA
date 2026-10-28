# Architecture

A map of the whole system as it stands in October 2026. DESIGN.md is the
standing brief; this file says what actually exists and how it fits together.
Keep it short and correct; when something here is wrong, fix it in the same
pull request that changed the code.

## One build, three sites

`next build` (App Router, TypeScript, Tailwind v4, `output: "export"`) produces
`out/`. `scripts/split-static-export.mjs` splits it into two document roots that
`deploy-site.yml` uploads over FTPS to the cPanel server (2 GB, shared with a
WordPress site; nothing of ours runs as a process there):

| Host | Root | What it serves |
|---|---|---|
| `globalacademy.tarbiyyah.co.uk` | `out-main/` | **Public holding site** until launch: `/` (register interest), `/term-dates`, `/fees`, `/curriculum` (subjects), legal pages, booking links already emailed. Everything else 302s to `/`. Rules: `public/.htaccess`, "PRE-LAUNCH" block. |
| `preview.tarbiyyah.co.uk` | same `out-main/` | **Staff preview** of the full site. A browser that has opened `/?key=<PREVIEW_KEY>` once carries a `tga_staff` cookie (domain `.tarbiyyah.co.uk`, renewed on every visit, never expires) and sees the full site; everyone else gets `staff-only.html`. `X-Robots-Tag: noindex`, `robots.txt` disallows all. The key comes from the `PREVIEW_KEY` secret, else `deploy/preview-key.txt`. |
| `learn.tarbiyyah.co.uk` | `out-learn/` | **The portal** (`src/app/learn/**` moved to the root), its own `.htaccess` (`deploy/learn-subdomain.htaccess`: strict CSP, HSTS, `no-store`, noindex), `calendar.php` (ICS proxy), PWA files. Behind the same staff cookie until launch. |

Opening the full site: delete the PRE-LAUNCH block in `public/.htaccess`, set
`PRELAUNCH = false` in `src/lib/prelaunch.ts` (it only widens the sitemap),
remove the gate from `deploy/learn-subdomain.htaccess`, redeploy.

Content comes from Sanity (`/studio` is the Studio built into the same export;
`publish-website-content` and the `sanity-content-published` repository
dispatch rebuild the site) with bundled fallbacks in `src/content/seed.ts` so
the site builds with no CMS at all.

## Marketing site (`src/app/(marketing)`)

Twenty-three pages plus `(holding)/coming-soon/*` for the pre-launch pages.
Shared chrome: `Header`, `Footer`, `MobileCtaBar`, `CookieConsent` (gates
Plausible in `Analytics`), `ViewSettings` (contrast, reading, dark modes).
Interactive pieces and where they post:

| Component | Backend |
|---|---|
| `RegisterInterestForm` | `public/register.php` → Brevo via `_mailer.php` (origin check, 6/IP and 3/email an hour, length caps) |
| `ApplicationForm`, `admissions/ApplyForm` | `public/apply.php` (same), and the Supabase `admissions_*` tables + `admissions-submitted` function |
| `admissions-payment/*` | `admissions-payment-proof` function (token-protected upload) |
| `booking/BookingCalendar`, `/manage-booking` | `get_open_slots` RPC, `book-admissions-call`, `manage-booking` (both validate the slot against `get_open_slots`) |
| `OpenEveningLive`, `/open-evening/manage` | `open_evening_upcoming` RPC, `open-evening-book` |
| `eligibility/YourChildsWeekQuiz` | `quiz_sessions` / `quiz_events` / `quiz_leads` (anon inserts; session updates need the `x-quiz-session` header), `quiz-send-plan` |
| `FeeEstimator`, `TimezoneConverter`, `LiveFaq`, `PolicyDirectory` | content only; policies stream live through `deploy/policy.php` → `policy-file` |

SEO: `src/lib/seo.ts`, `src/app/robots.ts`, `src/app/sitemap.ts`,
`JsonLd`/`BreadcrumbSchema`. Fonts are self-hosted from `src/app/fonts`.

## Portal (`src/app/learn`)

Every page is a client component gated by `LearnGate` (roles from
`user_roles`, read under the caller's own RLS). Four role surfaces:

| Area | Pages | Navigation (`src/lib/learn/nav.ts`) |
|---|---|---|
| `admin` | 55 | grouped sidebar; hubs render tab strips (`PageHeader` → `HubTabs`); `headOnly` tabs hidden from Admissions |
| `teach` | 30 | flat sidebar |
| `family` | 22 | flat sidebar; one current child shared by every page (`src/lib/learn/selectedChild.ts`) |
| `student` | 14 | flat sidebar; younger year groups get a simpler dashboard |

Shells: `LearnLayoutShell` (top bar, sidebar, `MobileTabBar`, `CommandPalette`
Ctrl/Cmd-K, `NotificationBell`). `AdminShell` and `LearnShell` are empty
wrappers kept for the imports. `src/app/learn/error.tsx` catches render errors.

Auth: Supabase Auth with password (students use `<username>@students.tarbiyyah.internal`),
one-time setup link **and** 6-digit code (`learn-invite`, `/login/invite`,
`/login/forgot`), lockout per (email, IP) via `learn-login`. Password changes
email the holder (`mailer_notifications_password_changed_enabled` in
`deploy-supabase.yml`). Role pages are protected client-side; the data they
show is protected by RLS and the functions' own checks.

Live lessons: a class stores a Teams meeting link (`teams_class_url`) or a
BigBlueButton room; **Join now** calls `lesson-join`, which checks the caller is
the class teacher, staff, an enrolled pupil or their parent, logs the join and
returns the URL. Recordings: `recording-access` (by `recordID`),
`recording-control`, `lms-recording-retention.mjs`. Teams attendance and
meetings sync through `teams-sync` (Microsoft Graph).

PWA: `public/learn/sw.js` caches only `offline.html` and an icon and handles
GET navigations network-first; it never caches API responses. Manifest and
install guide at `/learn/install`.

## Backend (Supabase, London)

- **Database**: 134 migration files (`supabase/migrations`, numbered 0001–0161
  with gaps), 172 tables, 10 views, ~570 policies. **RLS is enabled on every
  table**; four tables have no policies at all and are reachable only through
  `security definer` RPCs (`booking_attempts`, `login_attempts`,
  `message_reads`, `user_pins`). Tests: `supabase/tests/database/*.test.sql`
  (pgTAP, run by CI).
- **Edge Functions**: 42 in `supabase/functions` plus `_shared/` (`cors.ts`,
  `resend.ts`/`ses.ts` email, `spam.ts` rate limits, `auth.ts` caller roles and
  service-caller check, `bbb.ts`, `graph.ts`, `ics.ts`, `manageToken.ts`,
  `studentAccount.ts`, `signedPdf.ts`, `weeklyDigest.ts`). Functions deployed
  with `--no-verify-jwt` are listed in `supabase/config.toml`. CI type-checks
  every function with Deno.
- **Email**: Amazon SES or Resend (chosen by which secrets exist), one shell
  (`emailShell`). The two PHP forms use Brevo (the cPanel host firewalls SMTP).
- **Secrets**: only the anon key ships in the browser. Service-role and
  provider keys live in Edge Function secrets, GitHub secrets, and (for
  pg_cron) Vault, all written by `deploy-supabase.yml`.

### Role × table access (summary)

Full policy text: see the migrations; the shape is consistent.

| Who | Can |
|---|---|
| anon | read published website content tables and three owner-run views (`bookable_staff`, `year_group_places`, `bursary_seats_public`); insert applications, families, quiz sessions/events/leads (constrained `with check`); update their own quiz session (token header); call the public RPCs `get_open_slots`, `public_sample_timetable_week`, `open_evening_upcoming`, `admissions_upload_allowed` |
| parent | own children and everything keyed to them (attendance, homework, marks when released, reports, Qur'an, behaviour excluding incidents, fees, consents, absence notes, withdrawal notices, messages they are a participant of) |
| student | own record and the same read scope as a parent for themselves; own homework submissions; revision attempts through RPCs |
| teacher / TA | classes they teach (`class_taught_by_current_user`) and the pupils in them: registers, homework, marks, feedback, behaviour, badges, stars, announcements, class stream, Qur'an sessions, term reports while draft |
| admissions | admissions tables, user_roles (read), calendar (read) |
| head_teacher / admin | everything above plus people, staff, fees, settings, curriculum, compliance; safeguarding case tables additionally require the safeguarding-lead permission or Headteacher and a JWT issued in the last 15 minutes |
| permissions (`user_permissions`) | `manage_academic` (timetable, classes, subjects), `timetabler`, `safeguarding_lead`, `can_export_data`, `assessment_lead`, `view_compliance`, `manage_people_accounts`, `manage_website_content` |

### Scheduled jobs

| Job | Where | Cadence | Alerts |
|---|---|---|---|
| send-reminders (24h/1h admissions-call reminders) | pg_cron → `invoke_edge_function()` (migration 0160, Vault secrets) | every 15 min | n/a (idempotent) |
| close-stale-shifts | pg_cron (migration 0099) | every 2 min | n/a |
| noshow-alerts | GitHub cron | :10 and :40, 08–16 UTC weekdays | failure email |
| notify-flagged-messages | GitHub cron | every 3 h | failure email |
| open-evening-reminders | GitHub cron | every 6 h | failure email |
| safeguarding-review-check + purge-data-exports | GitHub cron | every 3 h | failure email |
| teams-sync | GitHub cron | 05:35 daily; 12:35, 16:35, 19:35 Mon–Sat | failure email |
| weekly-digest | GitHub cron | Fri 15:05 UK | failure email |
| lms-absence-alerts.mjs | GitHub cron | every 2 h, 08–20 UTC weekdays | failure email |
| lms-recording-retention.mjs / messaging-retention.mjs / compliance-retention.mjs | GitHub cron | nightly 03:00 / 03:30 / 04:00 UTC | failure email |
| sync-signable-documents | GitHub cron | 04:00 daily | failure email |
| check-policy-reviews / check-scr-expiry | GitHub cron | Mon 08:00 UTC | failure email |
| nudge-outstanding-signatures | GitHub cron | Tue 08:00 UTC | failure email |

"failure email" = `alert-on-failure.yml` emails `OPS_ALERT_EMAIL` (repository
variable; default the admissions inbox). Several crons were slowed in October
2026 to stay inside GitHub's free minutes; moving them to pg_cron is the
intended next step (the `invoke_edge_function()` helper now makes that a
one-line migration each).

### Scripts (`scripts/`)

| Class | Scripts |
|---|---|
| CI / build | `a11y-check.mjs`, `assess-selftest.ts`, `ci/eslint-annotate.mjs`, `generate-term-dates-ics.mjs` (prebuild), `clean-studio-build.mjs`, `split-static-export.mjs`, `lessons/validate.mjs`, `syllabus/validate.mjs` |
| Scheduled | `lms-absence-alerts`, `lms-recording-retention`, `messaging-retention`, `compliance-retention`, `check-policy-reviews`, `check-scr-expiry`, `nudge-outstanding-signatures`, `sync-signable-documents-from-sanity`, `alert-workflow-failure` (+ `lib/sendMail.mjs`, `lib/bbb-node.mjs`) |
| Content build (on push to `content/**`) | `lessons/build-decks`, `lessons/upload-decks`, `lessons/sync-revision`, `revision/build-booklets`, `revision/upload-booklets`, `syllabus/build`, `syllabus/upload` and their libraries |
| One-off setup / support (workflow_dispatch) | `seed-admin`, `invite-first-head-teacher`, `seed-demo-accounts`, `seed-sanity`, `seed-website-content`, `setup-sanity-cors`, `setup-sanity-webhook`, `set-learn-account-password`, `patch-site-settings`, `sync-policies`, `test-data`, `capture-portal-screenshots` |
| On demand | `timetable-solver/generate.py` (OR-Tools; dispatched by `trigger-timetable-generation`) |
| Diagnostic (dispatch only) | `diagnose-signin.mjs`, `check-dns.py`, `extract-page-text-rendered.mjs`, `test-bbb.ts`, and the `diagnose-*`/`check-*`/`verify-*` workflows |
| Manual, not wired to anything | `syllabus/export-portal-index.mjs`, `syllabus/merge-lessons.mjs`, `lessons/strip-review-flags.mjs`, `seed-timetable-test-data.py`, `sync-terms-from-sanity.mjs` (stale: terms now live in the portal) |

## Content pipeline

`content/lessons/*.json` (one file per lesson), `content/revision/*`,
`content/syllabus/*` are the source of truth for teaching material. Pushing
them builds PPTX decks, lesson-plan DOCX files, revision booklets and the
syllabus pack (workflows `build-lesson-decks`, `build-revision-booklets`,
`build-syllabus-pack`) and uploads them to Supabase Storage and the
`curriculum_lessons` / `revision_units` tables. `content/retired-lessons.json`
lists lessons withdrawn from the portal. `src/lib/learn/syllabusIndex.json` is
regenerated by hand with `syllabus/export-portal-index.mjs`.

## Timetabling

Availability (`teacher_availability`, `protected_times`) → **Generate**
(`trigger-timetable-generation` dispatches `generate-timetable.yml`, which runs
the OR-Tools solver and writes a `timetable_runs` draft + `timetable_slots`) →
**Timetable** editor (`/admin/lessons/timetable`; drag-and-drop writes slots
directly under RLS) → **Publish** (`timetable-publish`) → **Create dated
lessons** (`lesson-instances-generate`, up to 120 days) → cover
(`timetable-cover`, `cover-notify`) → ICS feeds (`timetable-ics`, tokens in
`ics_tokens`). `timetable-move` exists but the editor does not call it, so its
server-side clash checks do not run (see LAUNCH-READINESS.md).
