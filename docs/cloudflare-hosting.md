# Hosting on Cloudflare Pages (from 13 Nov 2026)

The GitHub account that owns this repo was locked over billing on 12 Nov 2026,
so no GitHub Actions workflow can start: not `deploy-site.yml` (FTP), not
`deploy-supabase.yml`, not the scheduled jobs. The owner chose to move off
GitHub Actions to free hosting instead of paying.

## The website and the portal

Two Cloudflare Pages projects in the Cloudflare account of
secondary@tarbiyyah.co.uk (account id `440981c589e4f7ff6e608c55a0942dbc`):

| Project | Serves | Test address | Real address(es) |
| :- | :- | :- | :- |
| `tga-site` | `out-main/` (website, holding site, staff preview) | https://tga-site.pages.dev (preview behaviour: https://preview.tga-site.pages.dev) | globalacademy.tarbiyyah.co.uk, preview.tarbiyyah.co.uk |
| `tga-learn` | `out-learn/` (portal) | https://tga-learn.pages.dev | learn.tarbiyyah.co.uk |

The custom domains are attached to the projects. They go live when the DNS
records for `globalacademy`, `preview` and `learn` (zone tarbiyyah.co.uk, whose
DNS is on Cloudflare) become CNAMEs to `tga-site.pages.dev` /
`tga-learn.pages.dev`. Until then the old cPanel host still serves the public.

### Deploying

```
export CLOUDFLARE_API_TOKEN=...   # Cloudflare token with "Pages: Edit"
export CLOUDFLARE_ACCOUNT_ID=440981c589e4f7ff6e608c55a0942dbc
export SUPABASE_ACCESS_TOKEN=...  # to read the anon key at build time
export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt   # only inside Claude's sandbox (proxy)
scripts/deploy-cloudflare.sh            # build + split + deploy both projects
BRANCH=preview scripts/deploy-cloudflare.sh --skip-build   # just the preview alias
```

Ask the owner for fresh tokens if none are at hand; never commit them.

### What replaces the Apache files

Pages cannot run PHP or read `.htaccess`, so `cloudflare/*/functions/_middleware.js`
does the same job (keep both in step while the old host exists):

- `public/.htaccess` -> `cloudflare/main/functions/_middleware.js`: holding-site
  allowlist and rewrites, staff preview key and cookie on `preview.*`, old
  address redirects, security headers and CSP, caching, `/learn/*` bridge,
  `/studio/` fallback, policy PDFs (`/policies/<slug>.pdf|docx` proxied to the
  `policy-file` Edge Function, falling back to the bundled PDF).
- `public/register.php` -> the middleware forwards `POST /register.php` to the
  new Edge Function `website-enquiry` (same checks, emails through
  `_shared/resend.ts`). `apply.php` is not used by any page and is not ported.
- `deploy/learn-subdomain.htaccess` -> `cloudflare/learn/functions/_middleware.js`
  (staff-only gate, headers, `sw.js` scope); `deploy/calendar.php` -> the same
  middleware proxies `/calendar.php?token=` to `timetable-ics`.
- `PREVIEW_KEY` is a secret environment variable on both Pages projects (set
  from `deploy/preview-key.txt`). To change it: change it in the Cloudflare
  dashboard (project > Settings > Variables and secrets) and redeploy.

## Supabase (database and Edge Functions)

Deployed straight from a Claude session with the Supabase CLI and a personal
access token (`supabase functions deploy <name> --project-ref bgtspjhdajqheaktudip --use-api`),
and SQL through the Management API (`POST /v1/projects/<ref>/database/query`).
Record each migration in `supabase_migrations.schema_migrations` (version, name)
after applying it. `website-enquiry` is NOT in `deploy-supabase.yml` (workflow
files cannot be pushed from Claude sessions); add it there when that workflow
is used again (with `--no-verify-jwt`).

## Scheduled jobs

Migration `0222_scheduled_jobs_pg_cron.sql` moved every schedule that only
calls an Edge Function into Supabase (pg_cron + pg_net, key from Vault secret
`tga_service_role_key`): message digest, no-show alerts, flagged messages,
open-evening reminders, safeguarding review check, purge data exports,
payments daily, Teams sync, weekly digest. See `select * from cron.job` and
`net._http_response` for results.

**When GitHub Actions works again, disable those workflows** or each job runs twice.

Still on GitHub Actions only (Node scripts with no Edge Function yet), so NOT
running while GitHub is locked: lms-absence-alerts (needed before live lessons
start on 11 Jan 2027), compliance-retention, lms-recording-retention,
messaging-retention, check-policy-reviews, check-scr-expiry,
nudge-outstanding-signatures, sync-curriculum-from-portal,
sync-signable-documents. Next step: port each to an Edge Function or SQL and
schedule it in pg_cron the same way.
