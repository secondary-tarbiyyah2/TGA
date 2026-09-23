# Tarbiyyah Global Academy — marketing & admissions site

Next.js (App Router) + TypeScript + Tailwind CSS, **statically exported** (`output: "export"`
in `next.config.ts`) — the built site is plain HTML/CSS/JS with no Node.js server needed at
runtime. This is deliberate: the production server has 2GB RAM and already runs a WordPress
site, so a persistent Next.js Node process there was judged too risky (see "Why static
export" below). The previous static HTML/PHP site is kept for reference in `legacy-static/`
(not built or deployed). A fully server-rendered version of this Next.js rebuild (with
Next.js API routes and an embedded Sanity Studio) is preserved on the
`backup/nextjs-ssr-server-render` branch if this decision ever needs to be reversed.

## Getting started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in values as they become available (see below).
The site works with **zero configuration** out of the box — every page falls back to
realistic placeholder content (clearly marked) bundled in `src/content/seed.ts` whenever the
CMS isn't connected yet.

## Building & deploying

```bash
npm run build
```

produces a self-contained `out/` folder — that folder's contents (plus the `.php` files and
`.htaccess` it includes automatically, since they live in `public/`) is everything that needs
to go in the web root on the server. No `npm install`, no Node, no running process required
there.

Then, if Sanity is connected (see "Admin panel" below):

```bash
npm run sanity:build
```

adds the admin panel into `out/studio/` — same deploy, one extra static folder, still zero
Node processes at runtime.

**Recommended deploy path:** build in CI (e.g. a GitHub Actions workflow — build cost is free
there and it keeps the 2GB server from ever having to run `next build`, which is itself
memory-hungry for the few minutes it runs), then sync the `out/` folder to the server (rsync
over SSH, or however the current site is deployed). Building directly on the server with
`npm run build` also works if preferred — the build process just needs to be given enough
headroom (or run at a quiet time) since it's transient, not persistent, memory use.

The one file that must exist on the server outside of git is `register.config.php` (see
below) — it's gitignored on purpose (holds a live API key) and won't come from a deploy. Once
it's placed in the web root once, it survives every future deploy untouched.

### Why static export (not `next start`)

A persistent Node.js server (`next start`) typically idles around 100–200MB and grows under
load/image optimisation — on a 2GB box already running WordPress (Apache/PHP-FPM/MySQL) plus
occasional Claude Code sessions, that's a real risk of both sites getting OOM-killed together.
Static export removes the Node process from production entirely: Apache just serves files, the
same way it already does for WordPress and did for the legacy site. The tradeoff is CMS
content and code changes only appear after a rebuild+redeploy, not instantly — acceptable
here since this is a low-frequency-change marketing site, not an app.

## Admin panel (no-code content editing)

The admin dashboard is [Sanity](https://sanity.io) Studio, and it lives **on the site itself**
at `/studio` (e.g. `globalacademy.tarbiyyah.co.uk/studio`) — `robots.txt` keeps it out of
search results. Studio is a client-side-only app, so it builds to static files exactly like
the rest of the site (`npm run sanity:build`, see above) and costs the server nothing at
runtime: it's just another static folder for Apache to serve, no Node process involved either
way.

(An alternative — Sanity's own free hosted Studio at `<project>.sanity.studio`, kept off this
site entirely — is still available via `npm run sanity:deploy` if ever preferred instead. Not
used by default since having it on our own domain is the more natural "admin panel" for the
owner/Headteacher.)

**To connect it (one-time setup):**
1. Create a free project at [sanity.io](https://sanity.io).
2. Set `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` (see `.env.example`)
   wherever the site is built (CI secrets, or a local `.env.local` if building on the server).
3. Run `npm run build && npm run sanity:build` and deploy the resulting `out/` — `/studio` is
   now live on the site.
4. From the Sanity project's **Members** page, invite:
   - The Owner/site admin as **Administrator** (full edit + project settings access).
   - The Headteacher (Hardeep Sandhar) as **Editor** (can add/edit all content below, cannot
     change project settings or schema). Sanity's built-in Editor role does not require the
     paid tier.
5. Editors go to `globalacademy.tarbiyyah.co.uk/studio` and log in with the invited email — no
   separate password to manage.

**Every one of these is editable from Studio once connected. Remember: because the site is
statically exported, changes appear on the site after the next build+redeploy, not instantly**
— wire a Sanity webhook to your CI build trigger if you want that to happen automatically on
publish.
- Fee table (`Fee bands`) — every year-group band, all three payment frequencies
- `Site settings` — application/registration fee, Open Evening booking widget URL and past
  recording URL, Parent/Student portal URL, admissions email
- `FAQ entries` — question, answer, category (feeds the searchable/filterable FAQ page)
- `Term & admissions dates`
- `Testimonials` — quote, attribution, role, photo
- `Staff members` — name, role, qualifications, photo, intro video link
- `Differentiator copy blocks` — each one can be marked "Confirmed commitment" or "Draft /
  concept", shown/hidden, or removed entirely as each is decided
- `Policy documents` — title + link, shown on the Policies page

Until Sanity is connected, this content ships as the placeholder data in
`src/content/seed.ts` — safe to edit directly if you'd rather populate real copy in code
before setting up Sanity.

## Forms & email

The two forms (register interest, application) can't be Next.js API routes under static
export (there's no server to run them), so they're standalone PHP endpoints in `public/` —
`register.php` and `apply.php` — which land in the deployed `out/` folder automatically since
everything in `public/` is copied verbatim by the export. Both share `public/_mailer.php`,
ported line-for-line in spirit from the legacy site's `register.php`: same Brevo HTTPS API
approach (this domain's SPF/DKIM only authorise Brevo; outbound SMTP is firewalled on this
class of shared host), same fallback to PHP `mail()` if no API key is set, same request
logging.

**Setup on the server:** copy `public/register.config.example.php` to
`public/register.config.php` **directly on the server** (it's gitignored, never committed —
holds the live Brevo API key) and fill in the values. If this server already ran the legacy
static site, a real `register.config.php` may already exist in the web root from that
deployment — same filename, same shape, so it should keep working unchanged. This file lives
outside git on purpose so it survives every future `git pull` + rebuild untouched.

Set `crm_webhook_url` in that same config file to also forward every submission as JSON to a
CRM/Notion webhook.

## SEO / accessibility / analytics

- Per-page metadata, Open Graph/Twitter tags, `EducationalOrganization` JSON-LD, `sitemap.xml`
  and `robots.txt` (`src/app/sitemap.ts`, `src/app/robots.ts`) — all prerendered at build time.
- Skip link, visible focus rings, semantic headings, `aria-*` on the accordion/mobile nav —
  built against WCAG 2.1 AA; run a full manual pass (keyboard-only + screen reader) before
  launch, especially on the multi-step application form.
- Analytics: [Plausible](https://plausible.io) (cookieless, no consent required under UK
  GDPR) — set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to enable. A cookie consent banner still ships
  (`src/components/CookieConsent.tsx`) for future cookie-based tools.

## Open questions (flagged, not guessed at)

These need a decision from the school/human team — see the original brief:
- Final domain name and hosting budget (site currently assumes `globalacademy.tarbiyyah.co.uk`)
- Notion vs. a dedicated CRM for lead sync (`crm_webhook_url` in `register.config.php` supports
  either)
- Real photography/video — every image/video slot currently uses a placeholder or stock asset
- Confirmed term dates/admissions calendar for the January 2027 launch
- Which differentiators (two live-lesson time bands, Big Sibling, Weekly Tarbiyah Note,
  student portfolio, office hours, bursary seats) are confirmed vs. still under consideration
  — each is tagged in the CMS so status can be flipped without a code change (just a rebuild)
- Moodle hosting choice and SSO branding/theming extent (the Portal page only links out)
- Whether a blog/news section is wanted for SEO
- Whether a CI workflow should be set up to auto-build+deploy on push (needs the server's SSH
  details as GitHub Actions secrets — not something to set up blind)

## Not yet done

- Lighthouse ≥90 audit and cross-browser/mobile pass — was run once against the
  server-rendered version (all pages ≥96, most 100/100) and the static HTML output is
  materially the same, but hasn't been re-run against this exact `out/` build.
- Fee termly/monthly figures are an even split of the confirmed annual fee, not the school's
  actual published payment-plan figures — flag for confirmation.
- No CI/deploy automation wired up yet (see open questions above).
