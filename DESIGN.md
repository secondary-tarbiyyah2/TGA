# DESIGN.md — Tarbiyyah Global Academy

This is the standing brief all further work on this repo follows. Read it before making
changes; if a task conflicts with it, flag the conflict rather than silently picking a side.

## Project

Tarbiyyah Global Academy (TGA) — an online British school (Reception to Year 11) under the
Tarbiyyah Education Trust (10+ years running Tarbiyyah Primary, Tarbiyyah Secondary Boys,
Tarbiyyah Al-Banaat). Live, timetabled lessons with qualified UK teachers; British curriculum
taught with *tarbiyyah* (nurturing character and faith). Induction week 4 to 8 January 2027; first live lessons Monday 11 January 2027.
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
- **The portal is the school (owner's decision, 10 November 2026: "Option B").** Everything
  except the live lesson happens in the portal: timetable, classwork and homework (set, submitted,
  marked and returned), grades, registers, reports, messages, revision, Qur'an progress, fees and
  admissions. Microsoft Teams for Education is used only for the live lessons themselves (and their
  recordings); each class stores a `teams_class_url` and the timetable's Join button opens it.
  Never tell families or pupils to look in Teams for work or grades. No Moodle. Keep Microsoft Graph
  integration possible (pulling meeting links and recordings) but don't build it yet.
- **Exception (owner's decision, October 2026): Unit revision.** Revision quizzes and the
  practice coach run in the portal (`/student/revision`, migration 0094), because results feed
  the Lesson library's "Pupil results" and the "Revision results" page. Formal assessments stay
  in Teams Forms. No AI is used with pupils: questions, hints and explanations come from
  teacher-checked content and are marked on the server, so answers never reach pupils' browsers.
- **Classwork quizzes** (owner, 11 Nov 2026; migration 0205) also run in the portal: teachers build
  them in the full-screen quiz builder (`src/components/learn/quiz/`), pupils sit them full screen,
  and they are marked on the server so answers never reach pupils' browsers before they finish.
  AI may draft questions for a teacher to check; it is never used with pupils.
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

## Portal design system (learn.tarbiyyah.co.uk; owner brief 10 Nov 2026)

The portal has its own, quieter design language (the public website keeps "Brand direction"
above). The owner's brief is `docs/owner-briefs/2026-11-10-ui-ux-redesign.md`; the working
notes and history are in `docs/portal-redesign.md`. Everything below lives as tokens in the
`.portal` block of `src/app/globals.css` and as components in `src/components/learn/ui.tsx`
and `kit.tsx`: change it there, never page by page.

- **Feel:** premium, calm, scholarly; information first. No AI-dashboard look: no endless
  rounded white cards, no gradients, no heavy shadows, no coloured icon tiles, no random badges.
- **Colour, one job each:** warm ivory canvas (`--portal-canvas`), stone sidebar
  (`--portal-sidebar`), near-white panels (`--portal-surface`), hairline borders
  (`--color-gold-light`, now a warm stone grey); charcoal text (`ink-900`) and grey-green
  secondary text and icons (`ink-500`); **deep forest green** (`forest-700`) for actions,
  links, focus and "you are here"; **muted green** (`forest-500`) for progress and quiet
  emphasis; **antique gold** only as an accent (logo, the small marker beside the page you
  are on); amber, red and green only for status.
- **Type:** Inter only (self-hosted). Roles as classes: `t-title` (page title, 22px
  semibold), `t-section` (15px semibold), body 14 to 15px, `t-meta` (13px grey-green),
  `t-eyebrow` (11px capitals). Never make everything the same size and weight.
- **Spacing:** a 4px grid. Page gutter 16 / 24 / 40px (phone / tablet / desktop); 24 to 28px
  under a page header; 24px between blocks; rows 32 to 40px tall on desktop and at least
  44px on touch screens.
- **Shape and depth:** controls 7px corners, panels 10px, chips are pills. Hairlines at rest;
  one shadow (`--portal-shadow-pop`) only for things that float (menus, popovers, dialogs).
  No card inside a card.
- **Shell:** collapsible sidebar (268px, or a 64px icon rail with tooltips): Pinned, Home,
  then category dropdowns; the page you are on is lifted onto the surface colour with
  forest text and a short gold marker. The profile button at the foot opens the account menu
  (account, switch portal, sign out). The top bar sits on the canvas: search with its
  shortcut, clock-in, display, feedback, then **Report a concern** in its own red outline
  (never in a menu), then notifications. **No strip of tabs across the top of a page** (owner,
  11 Nov 2026): the sidebar is the way between a category's pages (a page's own steps are
  listed one level further in while you are on it), and a page header names the category in a
  small eyebrow. **Actions open in place** (a right-side panel, a bottom sheet on phones, or a
  dialog), never on a separate page; lists open a record's detail in a side panel. The
  structural patterns are in `docs/portal-structure.md`.
- **Status language:** a dot and a word, not a coloured badge: pending, in progress,
  completed, needs attention, overdue, approved, unavailable (`Status` in `ui.tsx`;
  lesson review uses `WorkflowBadge` in `kit.tsx`).
- **Motion:** 120 to 200ms, ease-out; nothing bounces; all of it off under reduced motion.
