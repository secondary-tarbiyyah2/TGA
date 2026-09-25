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
