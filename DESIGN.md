# DESIGN.md — Tarbiyyah Global Academy

This is the standing brief all further work on this repo follows. Read it before making
changes; if a task conflicts with it, flag the conflict rather than silently picking a side.

## Project

Tarbiyyah Global Academy (TGA) — an online British school (Reception to Year 11) under the
Tarbiyyah Education Trust (10+ years running Tarbiyyah Primary, Tarbiyyah Secondary Boys,
Tarbiyyah Al-Banaat). Live, timetabled lessons with qualified UK teachers; British curriculum
taught with *tarbiyyah* (nurturing character and faith). Live lessons launch 7 December 2026.
Audience: Muslim families in the UK and abroad — "wherever home is."

## Architecture

- **The site stays static** — no server of our own runs continuously. It's built with
  Next.js (App Router) + TypeScript + Tailwind, exported via `output: "export"` to plain
  HTML/CSS/JS (see `next.config.ts`). This was a deliberate choice (not vanilla hand-written
  HTML) to support 19+ CMS-driven pages cleanly, but the deployed *output* behaves exactly
  like a static site: no Node process runs on the production server. That server has 2GB RAM
  and already runs a WordPress site — nothing here may risk that.
- Dynamic features (booking, portals, auth) will call **Supabase** (Postgres + Auth + Edge
  Functions, London region) from the browser. Only the Supabase *anon* key may ever appear in
  shipped frontend code. Service-role keys and email API keys live only in Supabase Edge
  Function secrets — never in this repo, never in a `NEXT_PUBLIC_*` variable.
- **Keep owner setup minimal.** The owner should only ever need a Supabase account (access
  token) and one email provider: a Resend API key, or Amazon SES credentials (optional,
  chosen by the owner in October 2026; see SETUP.md "Email via Amazon SES"). Whoever implements each feature uses the Supabase CLI to link
  the project, run migrations, deploy functions and set secrets — not hand the owner manual
  dashboard steps unless truly unavoidable. No Azure/Microsoft app registrations, no captcha
  accounts, no extra paid services, unless a specific prompt says otherwise.
- Logins (staff, parents, students): email magic link / one-time code via Supabase Auth,
  sent through Resend SMTP (Supabase's default email sending is too rate-limited for real use).
- **Row Level Security on every table, no exceptions. Default deny.**
- **No Moodle.** Microsoft Teams for Education (already licensed) is the classroom: live
  lessons, Assignments & Grades, Forms quizzes, OneNote Class Notebook, Insights. Portals here
  are the branded front door that link into each class's Team — never rebuild an LMS. Each
  class stores a `teams_class_url`. Structure code so Teams data could later be pulled in via
  Microsoft Graph without a rebuild — don't build that integration yet.
- **Exception (owner's decision, October 2026): Unit revision.** Revision quizzes and the
  practice coach run in the portal (`/student/revision`, migration 0094), because results feed
  the Lesson library's "Pupil results" and the "Revision results" page. Formal assessments stay
  in Teams Forms. No AI is used with pupils: questions, hints and explanations come from
  teacher-checked content and are marked on the server, so answers never reach pupils' browsers.
- Load `supabase-js` only on the pages that need it (booking, portals, staff area) — as a
  React client component import scoped to those routes, not a site-wide script.
- The two existing PHP form endpoints (`public/register.php`, `public/apply.php`) are
  unrelated to Supabase and should keep working as-is unless a prompt explicitly says to
  replace them.

## Brand direction

Move from the current maroon/burgundy to a **gold palette** matching the logo
(`public/brand/ga-wordmark.png`, mirrored from `legacy-static/assets/brand/`). Feel: premium,
calm, trustworthy, scholarly — a well-bound book with gold foil, not flashy. Lots of
whitespace, soft cream backgrounds, deep ink text, gold as the accent. Subtle Islamic
geometric patterns only as very low-opacity textures.

## Competitor note

We benchmark against another online Islamic school. We must **not** look like a copy: no
crescent/moon motifs, no word "pathway(s)", no yellow-on-white SaaS dashboard styling, none of
their section names. Our identity = gold, ink, cream, 8-point geometric star, "tarbiyyah",
"journey", "wherever home is."

## Rules

- All colours, spacing, radii, shadows and type sizes come from CSS custom properties /
  Tailwind theme tokens in one place (`src/app/globals.css`'s `:root` / `@theme inline`
  block). No hard-coded hex values inside components.
- **Accessibility:** WCAG 2.2 AA. Gold is an accent, not a small-body-text colour. Every
  text/background pair passes 4.5:1 (3:1 large text). Visible focus states. Respect
  `prefers-reduced-motion`.
- **Performance:** keep the framework footprint we already have — don't add a second one.
  Prefer small, dependency-light components; lazy-load images and anything third-party
  (especially `supabase-js` — see above).
- **Mobile first.** No horizontal scroll at 360px.
- **Never invent** testimonials, statistics, accreditations or staff details. Placeholder
  content must be clearly marked as such (see `PlaceholderNote` component and the
  `isPlaceholder` fields already in the Sanity schema).
- Keep existing working features (forms, cookie banner, analytics consent) working through
  every change.
- Anything touching children's personal data (student portal, achievements, absence reports)
  is safeguarding-sensitive: minimum data collected, no student-to-student contact, no public
  profiles, RLS enforced, and called out explicitly for human review before going live.
- **Dropdowns:** never a bare `<select>` or `<datalist>` on the public site. Use
  `Select` / `Dropdown` from `src/components/ui/Dropdown.tsx` (drop-in for `<select>`,
  same `<option>` children, keyboard and screen-reader support, search for long lists) or
  `Combobox` (`src/components/admissions/Combobox.tsx`) for free-text-with-suggestions.
  In the portal use `Select` from `src/components/learn/Select.tsx` (the same dropdown,
  behaving exactly like a native `<select>`). A unit test and an ESLint rule stop new bare
  `<select>`s.
- **No emojis** in the portal or website UI: use `Icon` (`src/components/learn/Icon.tsx`,
  Lucide outlines; add a name there rather than drawing a new path). Checked by
  `src/lib/learn/uiControls.test.ts`.
- **Times for families:** pages that show times ask "Where are you joining from?" with
  `PlacePicker` (`src/components/booking/PlacePicker.tsx`): country first, then the region
  for countries with several time zones. The choice is saved in the browser
  (`src/lib/place.ts`) and shared by the booking page, "Is it right for us?" and the fees
  page. The country list comes from `src/lib/countryZones.generated.ts`; regenerate it
  with `python3 scripts/gen-country-zones.py`.
