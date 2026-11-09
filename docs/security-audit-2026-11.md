# Security audit, November 2026 (Tafweed T20)

Audited 9 November 2026 on branch `claude/tafweed-T20-security`, against `main` at
migration 0185. Scope: the Supabase database (190 tables, 265 functions, views, storage),
47 Edge Functions, the static website and portal (Next.js export, `.htaccess`, PHP form
handlers), and 47 GitHub Actions workflows.

**Overall:** the foundations are good. Every table has Row Level Security switched on,
every SECURITY DEFINER function pins its `search_path`, every storage bucket except
public policies is private with short signed links, safeguarding data is limited to the
safeguarding lead and Headteacher (with a fresh sign-in), and every staff Edge Function
re-checks the caller's role on the server. The problems found were around the edges:
passwords showing in GitHub logs, a public email function that could be abused, scheduled
functions anyone could trigger, and missing browser headers.

Ranks: **Critical** (exploitable now, serious harm), **High** (exploitable now, real harm
or data exposure), **Medium** (needs a second failure, or harm is limited), **Low**
(hardening, tidiness). "Fixed" means fixed in this branch.

---

## Critical

None found.

## High

### H1. Passwords shown in clear in GitHub Actions logs (Fixed; owner action needed)
- **Files:** `.github/workflows/seed-demo-accounts.yml`, `.github/workflows/set-learn-password.yml`
- **Why it matters:** both workflows tried to hide the password typed in when the run
  was started with `echo "::add-mask::${{ inputs.password }}"`. GitHub prints a step's
  script, with those `${{ }}` values filled in, at the top of the step's log, *before*
  the mask takes effect. So the passwords were readable by anyone who can open the
  repository's Actions tab, for 90 days. Checked (without printing anything): run
  36771240887 (demo accounts, 30 Sept) and run 36771757482 (set password on a real
  account, 30 Sept) contain a password in clear.
- **Fix:** the workflows now read the inputs from the event file and mask them without
  ever printing them; the account email is passed through an environment variable (no
  shell injection).
- **Owner must:** change the three demo account passwords and the password set on
  30 September (or ask the account holder to reset it), and delete the logs of those two
  runs (Actions, open the run, "..." menu, "Delete all logs").

### H2. "Is it right for us?" email could be used to flood any inbox (Fixed)
- **File:** `supabase/functions/quiz-send-plan/index.ts`
- **Why it matters:** this public function emails the summary to the address on a
  `quiz_leads` row. Anyone can create such a row (any address), and the function would
  send to it again on every call, with no limit, from the school's own domain. That could
  get the domain marked as spam (hurting every school email) and harass a stranger.
- **Fix:** one email per lead, only for a lead created in the last hour (claimed
  atomically, so two calls at once still send once), plus the shared per-IP and
  per-address rate limit (`_shared/spam.ts`). Provider error text is no longer returned.

## Medium

### M1. Scheduled functions could be triggered by anyone (Fixed)
- **Files:** `supabase/functions/notify-flagged-messages`, `safeguarding-review-check`,
  `purge-data-exports`, `send-reminders`; workflows `notify-flagged-messages.yml`,
  `safeguarding-review-check.yml`
- **Why it matters:** these are deployed without JWT checks so a timer can call them,
  but they accepted any caller. They are written to be safe to repeat, so the harm was
  limited to extra load and early runs, but nobody outside should be able to start a
  safeguarding sweep.
- **Fix:** new `_shared/serviceCaller.ts` (the check `noshow-alerts` already used):
  only the service-role or secret key may run them. The two workflows now send that key
  (masked). If the booking reminders are scheduled with pg_cron, its job must send the
  service-role key, as `0001_init.sql` says it should.

### M2. Login lockout could lock other people out (Fixed)
- **File:** `supabase/functions/learn-login/index.ts`
- **Why it matters:** the lockout counted failed sign-ins per email only, and anyone can
  report a "failed attempt". Five fake reports would lock, say, the Headteacher out for
  15 minutes, again and again.
- **Fix:** failures are counted per email *and* network (hashed IP). This loses no real
  protection: an attacker could always skip reporting, and Supabase Auth's own
  server-side limits remain the backstop. Database error text is no longer returned.

### M3. Policy text could carry script onto the public website (Fixed)
- **Files:** `src/app/(marketing)/policies/[slug]/page.tsx`,
  `src/components/learn/documents/PolicyTextEditor.tsx`, new `src/lib/safeMarkdown.ts`
- **Why it matters:** policy bodies typed in the portal were turned into HTML with plain
  `marked` and placed on the page as-is, so `<script>` or a `javascript:` link would have
  run for every visitor. Only Headteacher/Admin can edit policies, so this needs a
  hijacked staff account first.
- **Fix:** `renderSafeMarkdown` shows raw HTML as text and only keeps http(s), mailto,
  tel, same-site and `#section` links. The bundled policies contain no raw HTML, so
  nothing visible changes.

### M4. No security headers on the main website (Fixed)
- **File:** `public/.htaccess` (main site), `deploy/learn-subdomain.htaccess` (portal)
- **Why it matters:** the website could be framed by another site (clickjacking), files
  could be MIME-sniffed, and full page addresses were sent to other sites.
- **Fix:** main site: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
  `frame-ancestors 'self'; base-uri 'self'`, `Referrer-Policy`, `Permissions-Policy`.
  These are skipped for the portal host, whose folder sits inside the main folder on the
  server and keeps its own stricter CSP; the portal gained `nosniff` and
  `Referrer-Policy`. A full script CSP for the main site is listed under Low (L6).

### M5. Public PHP forms had no rate limit (Fixed)
- **Files:** `public/register.php`, `public/apply.php`, `public/_mailer.php`
- **Why it matters:** each submission emails the school and (if switched on) sends an
  acknowledgement to the address typed in. A script could flood the inbox or a stranger.
- **Fix:** `mailer_rate_limited()`: 6 an hour per network, 3 an hour per email address,
  stored as hashes in the server's temp folder (outside the website).

### M6. Workflows ran with the default token permissions (Fixed)
- **Files:** 45 files in `.github/workflows/`
- **Why it matters:** without a `permissions:` block, a workflow's `GITHUB_TOKEN` gets the
  repository default, which may include write access. A compromised step could then push
  code.
- **Fix:** every workflow that had none now has `permissions: contents: read`. The two
  that push screenshots or curriculum keep their existing write permissions.

### M7. Third-party actions not pinned (Fixed)
- **Files:** `deploy-site.yml` (FTP deploy) and every workflow using `supabase/setup-cli`
  or `denoland/setup-deno`
- **Why it matters:** `@v4.3.5` or `@v1` is a tag the action's owner can move. The FTP
  action receives the site's FTP password; the Supabase CLI step receives the Supabase
  access token.
- **Fix:** pinned to the commit of the current tag (comment shows the version).
  GitHub's own `actions/*` stay on major tags (Low, L8).

### M8. A service-role key was not masked in one workflow (Fixed)
- **File:** `.github/workflows/seed-website-content.yml`
- **Why it matters:** the key was passed to a later step's `env:`, which GitHub lists in
  the log. The September runs show `***` (GitHub happened to know the value), so nothing
  leaked, but it relied on luck.
- **Fix:** `::add-mask::` added as soon as the key is fetched.

### M9. Anyone could call `resync_lesson_teachers` (Fixed)
- **File:** new `supabase/migrations/0186_security_audit_revokes.sql`, test
  `supabase/tests/database/security_audit_revokes.test.sql`
- **Why it matters:** a SECURITY DEFINER function that rewrites future lessons' teacher.
  Postgres lets everyone execute functions unless revoked, so anon could call it through
  the API. It only re-applies the current mapping, so no wrong data could result.
- **Fix:** execute revoked from public, anon and authenticated; the trigger that uses it
  still works (it runs as the owner). pgTAP test added.

### M10. Direct public inserts have no rate limit (Not fixed)
- **Tables:** `quiz_sessions`, `quiz_events`, `quiz_leads`, `eligibility_responses`,
  `admissions_applications`, `admissions_families` (anon INSERT policies)
- **Why it matters:** a script could fill these tables with junk (they are well
  constrained, so no privilege is gained). Staff would have to clean up.
- **Fix (later):** move these inserts behind Edge Functions using `_shared/spam.ts`, or add
  a per-session/IP counter trigger. Also `quiz_sessions` has an anon UPDATE policy of
  `using (true)`; it holds no personal data, but should be limited to the row's own token.

### M11. Dependencies with known advisories
- **File:** `package.json`, `package-lock.json`
- **Why it matters:** `npm audit --omit=dev` reports 2 critical and 8 high. The critical
  `next` advisories (`next/og` image responses, draft mode) need a running Next.js server;
  this site is a static export, so they do not apply to the live site. `dompurify` and
  `js-yaml` come in through Sanity Studio.
- **Fix (not done here):** `npm audit fix` rewrites about 6,000 lines of
  `package-lock.json`, which would clash with every other open branch, so it belongs in
  its own small PR: run `npm audit fix`, upgrade `next` to 16.4.5 or later and Sanity, build,
  and check the site. CI now prints the audit summary on every run (information only).

## Low (listed, not fixed)

- **L1. Generated support passwords appear in the job summary** (`set-learn-password.yml`
  by design). Anyone with repo read access can read them. Prefer the portal's "Send a new
  link" and treat any generated password as one-use.
- **L2. CORS is `*` on Edge Functions** (`_shared/cors.ts`). Safe today because they use
  bearer tokens, not cookies; tightening to the two site origins would add defence.
- **L3. Some SECURITY DEFINER helpers are callable by anon** (e.g. `is_staff_member`,
  `thread_participant`, `child_taught_by`, `class_teacher_names`, `run_status`). They
  return yes/no or names only and some are used inside policies, so revoking needs care.
- **L4. `site_settings` is world-readable**, including `assessment_join_url` and the bank
  details text. Both are meant for families, but a separate public view would be tidier.
- **L5. The staff preview key is in the repository** (`deploy/preview-key.txt`). The repo
  is private and the key only opens the pre-launch preview; prefer the `PREVIEW_KEY`
  secret.
- **L6. No script Content-Security-Policy on the main website.** It needs a careful list
  of embeds (Sanity, video, booking) and testing; the portal already has one.
- **L7. No HSTS header.** Set it in Cloudflare (SSL/TLS, Edge certificates) rather than
  `.htaccess`, once every subdomain is HTTPS only.
- **L8. GitHub's own actions on major tags** (`actions/checkout@v4` etc.), and the Supabase
  CLI step uses `version: latest`. Pin both when convenient.
- **L9. `admin-manage-staff` and `publish-website-content` check the old `profiles.role`
  = admin** rather than `user_roles`. Not a hole (a trigger stops people changing their own
  role) but inconsistent: a Headteacher without the old flag is refused.
- **L10. Error details** are still returned to service-role callers in some scheduled
  functions; fine, but keep provider/database text out of public responses.

## Checked and fine

- **RLS:** all 190 tables have RLS enabled; 5 have no policies at all (service role only:
  `booking_attempts`, `login_attempts`, `user_pins`, `message_reads`,
  `curriculum_sync_state`). Safeguarding tables: safeguarding lead or Headteacher only,
  with a sign-in in the last 15 minutes. SEND plans: SENCO/managers manage; parents see
  active/closed plans for their own child; teachers see active plans for children they
  teach. Pupil medical details: parent of the child, Headteacher/Admin, and teachers of the
  child through `teacher_pupil_health()`. Admissions, payment proofs, job applications and
  recruitment: Headteacher/Admin (and Admissions where relevant). The public application
  insert policy blocks every staff-only column. Users cannot change their own role
  (`protect_profiles_role_column`). Message edits cannot clear a safeguarding flag.
- **Views:** definer views (`assessments_for_family`, `outstanding_signatures`,
  `document_signature_progress`, `bookable_staff`, `year_group_places`,
  `bursary_seats_public`) filter by the caller or expose only counts; the others are
  `security_invoker`.
- **SECURITY DEFINER:** all 223 set `search_path`; those returning personal data check the
  caller (`send_can_manage`, `child_enrolled_in_teachers_class`, role helpers).
- **Storage:** all buckets private except `policy-documents` (public policies). Staff-only
  buckets (safeguarding, recruitment, admissions, payments, data exports) are restricted
  by role. Signed links last 5 to 10 minutes (staff photos 1 hour, revision video 3 hours).
- **Edge Functions:** every staff function verifies the JWT and re-reads the caller's role
  on the server; public ones (booking, open evening, careers, admissions, payment proof)
  use honeypot, timing and `_shared/spam.ts` rate limits or a secret token.
- **Secrets:** no service-role key or secret in `src/`, `public/` or the built `out/`
  folder (searched after `npm run build`); keys come from GitHub/Supabase secrets.
- **Login:** no `next`/`redirect` parameter, so no open redirect; password reset uses
  Supabase's code and link flow back to `/login/invite`; the portal is on its own
  subdomain, so a website bug cannot read portal sessions.
- **XSS:** no `dangerouslySetInnerHTML` on user content apart from policy markdown (now
  safe); assessment SVGs come from the code-authored item bank.
- **Retention:** unsuccessful job applications are deleted after 6 months by
  `scripts/compliance-retention.mjs`, run daily (one transient CLI download failure on
  8 November).
- **Supabase advisors:** not run here: the Supabase project reachable from this session
  is not TGA's. Run "Advisors, Security" in the TGA dashboard after this merges.
