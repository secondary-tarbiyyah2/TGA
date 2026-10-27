# Launch readiness

What still stands between the codebase and families using it, after the
October 2026 audit (branch `audit/oct-2026`). Effort: S = under a day,
M = a few days, L = a week or more. Owner is who decides, not necessarily who
types.

## Marketing site

| # | Item | Why it matters | Owner | Effort |
|---|---|---|---|---|
| M1 | **Remove the pre-launch gates at go-live**: the PRE-LAUNCH block in `public/.htaccess`, the staff gate in `deploy/learn-subdomain.htaccess`, `PRELAUNCH` in `src/lib/prelaunch.ts`. Until then every emailed portal link (parent setup, password reset, entry assessment, document signing, calendar feeds) lands on "Staff only", and `/book-a-call` links in quiz emails land on the holding page. | Families are locked out of links we send them | Owner | S |
| M2 | **Rotate the preview key** once staff testing is over. It is committed in `deploy/preview-key.txt`; set the `PREVIEW_KEY` secret instead and delete the file. | The key is the cookie value and is in git history | Owner | S |
| M3 | **Decide on `/staff` (legacy booking panel)**. `.htaccess` keeps it public during pre-launch for `StaffApp`; once `/learn/admin/admissions` availability management is confirmed, redirect `/staff` to the portal and delete `StaffApp.tsx`, `admin-manage-staff` and `seed-admin.mjs`. | Second login surface and legacy `profiles.role` model | Head of ops | M |
| M4 | **Deploy never deletes old files on the server** (`dangerous-clean-slate: false`). Old pages under allow-listed folders may still be served. Run one clean deploy or a manual clean of `public_html` before launch. | Stale pages can show old fees/dates | Owner | S |
| M5 | **Lighthouse and Playwright a11y pass on the PR** (CI runs them; this sandbox could not). Fix anything below 95. | Target in the brief | Dev | S |
| M6 | `DESIGN.md` still says "Reception to Year 11", "online British school" and "live lessons launch 7 December 2026"; the code and copy say Year 1–11 and January 2027. Update the brief so future work starts from the right facts (content decision, deliberately not changed in this audit). | Every new session reads it first | Owner | S |

## Portal

| # | Item | Why | Owner | Effort |
|---|---|---|---|---|
| P1 | **Queries that swallow errors**: most data reads use `.then(({ data }) => set(data || []))` and never look at `error`, so a failed query shows an empty list and the bell can say "nothing needs attention" when something does (dashboards, `ClassPage`, `CalendarView`, `TodoList`, `NotificationBell`). Sweep them into a shared `loadOrError()` helper that surfaces failures. | Silent data loss for users | Dev | M |
| P2 | **No loading state** on `/admin/pupils`, `/admin/staff`, `/admin/people`, the Academic sub-pages, `StaffAbsences` (`Suspense fallback={null}`). Use the `DataTable` skeleton or `EmptyState`. | Blank screens | Dev | S |
| P3 | **Admin IA**: `/admin/lessons/*` shows two stacked tab strips and "Timetable" means two different pages; `/admin/content` shows three tab rows; `/admin/settings` and Website → Site settings both edit `site_settings`. Merge the lessons strip into the hub tabs, drop the duplicate settings editor. | Admins can't find things | Dev + Head | M |
| P4 | **Tabs ↔ panels not linked** in ~37 of 44 `<Tabs>` usages (no `idBase`/`tabPanelProps`); `NavBadge` uses `aria-label` on a plain span. | Screen readers | Dev | S |
| P7 | **Setup/reset codes are 6 digits and valid 24 h** (`mailer_otp_exp`). Shorten to 1 h or lengthen the code. | Guessing window | Owner | S |
| P8 | **`timetable-move` is dead**: the editor writes slots directly, so availability/protected-time checks never run on drag-and-drop. Route the editor through the function or delete it. | Clashes slip into published timetables | Dev | M |
| P9 | **Class-centric hub**: `class` pages exist per role but homework/announcements/materials still have their own top-level entries; make the class page the hub with tabs (as in the brief) and demote the rest. | Google Classroom-style navigation promised | Dev + Head | L |

## Backend

| # | Item | Why | Owner | Effort |
|---|---|---|---|---|
| B1 | **Apply migrations 0160 and 0161 and redeploy functions** (`deploy-supabase.yml` on merge). 0160 needs pg_cron and pg_net enabled on the project (0001 creates them; confirm in Dashboard → Extensions). Then check `select * from cron.job` shows `send-reminders`. | Reminders start firing | Owner | S |
| B2 | **Move the GitHub-cron jobs to pg_cron** now that `invoke_edge_function()` exists: noshow-alerts back to every 5 min, flagged messages to 15 min, open-evening reminders hourly. Each is a one-line `cron.schedule` migration. | GitHub free minutes forced them to slow down | Dev | S |
| B3 | **CORS**: every function answers `Access-Control-Allow-Origin: *`. Restrict `_shared/cors.ts` to the three hosts once the preview host is retired. | Defence in depth | Dev | S |
| B4 | **Legacy `profiles.role`** is still read by 0001/0025-era policies (`current_role_is`) and the website-content tables. Migrate those policies to `user_roles` and drop the column's authority. | Two role systems | Dev | M |
| B5 | **Duplicate policies** on `site_settings` and `policy_links`; `children` INSERT lets any signed-in user create a child row for themselves. Tidy. | Hygiene | Dev | S |
| B6 | **`entry-assessment` `email` action accepts any `to`** (staff-only, but should be the applicant's address only). | Relay via a staff account | Dev | S |
| B7 | **Supabase advisors**: run security + performance advisors on the live project and add the indexes it suggests (not possible from this sandbox). | Query cost at 30 pupils is fine; at 300 it is not | Dev | S |
| B8 | **`localhost:3000` is in the production auth redirect allow-list** (`deploy-supabase.yml`). Remove it before launch. | Open redirect target | Owner | S |
| B9 | **Passwords in CI output**: `set-learn-password.yml` writes the new password to the step summary; `diagnose-signin.yml` takes a real password as an input. Replace with a reset link flow. | Repo collaborators can read them | Dev | S |
| B10 | **`register.log`** on the cPanel host stores applicant emails and child names forever. Rotate monthly or stop logging personal data. | GDPR retention | Owner | S |

## Ops

| # | Item | Why | Owner | Effort |
|---|---|---|---|---|
| O1 | Set the `OPS_ALERT_EMAIL` repository variable (defaults to the admissions inbox) and confirm one alert email arrives by failing a dispatch run on purpose. | Alerts go somewhere read | Owner | S |
| O2 | Error monitoring for the portal and functions (Sentry free tier or a Supabase logs alert). Nothing today reports a browser-side exception. | Pupils hit bugs before staff know | Dev | S |
| O3 | Playwright smoke tests for the critical paths (register interest, apply, book a call, log in as each role, join lesson, set + submit homework, sign document, upload fee proof) added to CI. The a11y job already drives Chromium, so the plumbing exists. | Regressions caught before deploy | Dev | M |
| O4 | Retire the diagnostic workflows that are marked historical (`check-learn-ssl`, `diagnose-*`, `verify-*`, `research-competitor-site`) once the issues they chased are closed; archive the manual scripts listed in ARCHITECTURE.md. | Noise | Dev | S |
| O5 | Backups: confirm point-in-time recovery is on for the Supabase project and that a restore has been tried once. | Only copy of pupil data | Owner | S |
