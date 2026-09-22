# Tarbiyyah Global Academy — marketing & admissions site

Next.js (App Router) + TypeScript + Tailwind CSS, with a Sanity Studio admin panel embedded
at `/studio`. Deployed for `globalacademy.tarbiyyah.co.uk`. The previous static HTML/PHP site
is kept for reference in `legacy-static/` (not built or deployed).

## Getting started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in values as they become available (see below).
The site works with **zero configuration** out of the box — every page falls back to
realistic placeholder content (clearly marked) bundled in `src/content/seed.ts` whenever the
CMS or email isn't connected yet.

## Admin panel (no-code content editing)

The admin dashboard is a [Sanity](https://sanity.io) Studio, embedded at **`/studio`** on this
same site (e.g. `https://globalacademy.tarbiyyah.co.uk/studio`).

**To connect it (one-time setup):**
1. Create a free project at [sanity.io](https://sanity.io).
2. Set `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` (see `.env.example`)
   in your hosting provider's environment variables, then redeploy.
3. From the Sanity project's **Members** page, invite:
   - The Owner/site admin as **Administrator** (full edit + project settings access).
   - The Headteacher (Hardeep Sandhar) as **Editor** (can add/edit all content below, cannot
     change project settings or schema). Sanity's built-in Editor role does not require the
     paid tier.
4. Visit `/studio` and log in with the invited email — no separate password to manage.

**Every one of these is editable from `/studio` once connected, with no code change or
redeploy needed:**
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

`/api/register` and `/api/apply` send email via the Brevo HTTPS API (ported from the legacy
site's `register.php`, which uses Brevo because this domain's SPF/DKIM only authorise Brevo).
Set `BREVO_API_KEY` to enable sending — without it, submissions succeed in "dev mode" (logged
to the server console, not actually emailed), so the forms are fully testable pre-launch.

Set `CRM_WEBHOOK_URL` to also forward every submission as JSON to a CRM/Notion webhook.

## SEO / accessibility / analytics

- Per-page metadata, Open Graph/Twitter tags, `EducationalOrganization` JSON-LD, `sitemap.xml`
  and `robots.txt` (`src/app/sitemap.ts`, `src/app/robots.ts`).
- Skip link, visible focus rings, semantic headings, `aria-*` on the accordion/mobile nav —
  built against WCAG 2.1 AA; run a full manual pass (keyboard-only + screen reader) before
  launch, especially on the multi-step application form.
- Analytics: [Plausible](https://plausible.io) (cookieless, no consent required under UK
  GDPR) — set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to enable. A cookie consent banner still ships
  (`src/components/CookieConsent.tsx`) for future cookie-based tools.

## Open questions (flagged, not guessed at)

These need a decision from the school/human team — see the original brief:
- Final domain name and hosting budget (site currently assumes `globalacademy.tarbiyyah.co.uk`)
- Notion vs. a dedicated CRM for lead sync (`CRM_WEBHOOK_URL` supports either)
- Real photography/video — every image/video slot currently uses a placeholder or stock asset
- Confirmed term dates/admissions calendar for the January 2027 launch
- Which differentiators (two live-lesson time bands, Big Sibling, Weekly Tarbiyah Note,
  student portfolio, office hours, bursary seats) are confirmed vs. still under consideration
  — each is tagged in the CMS so status can be flipped without a redeploy
- Moodle hosting choice and SSO branding/theming extent (the Portal page only links out)
- Whether a blog/news section is wanted for SEO

## Not yet done

- Lighthouse ≥90 audit and cross-browser/mobile pass — not run in this environment (no
  browser automation available); recommended before launch.
- Fee termly/monthly figures are an even split of the confirmed annual fee, not the school's
  actual published payment-plan figures — flag for confirmation.
