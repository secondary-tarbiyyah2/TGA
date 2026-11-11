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
- **Classwork quizzes** (owner, 11 Nov 2026; migration 0206) also run in the portal: teachers build
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
their section names. Our identity = gold, ink, cream, "tarbiyyah",
"wherever home is." No star motifs anywhere (owner, 11 Nov 2026).

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

## Portal design system (learn.tarbiyyah.co.uk): Evergreen

**Owner's decision, 11 November 2026:** of five design directions the owner chose **"1. Evergreen"**
("i like 1, so change everything to that. but the buttons etc on the pages themself need to be
improved"). Evergreen replaces the earlier quiet look of 10 November (7px controls, hairlines only,
"no gradients, no heavy shadows") for the whole portal; the public website keeps "Brand direction"
above. The owner's earlier brief still stands: the portal must be "modern, cool and very well made",
"especially the classroom". The reference mockup is design 1 of the five (Main.dc.html); the working
notes and history are in `docs/portal-redesign.md`.

Everything below lives as tokens in the `.portal` block of `src/app/globals.css` (plus the
"Evergreen" components block at the end of that file) and as components in
`src/components/learn/ui.tsx` and `kit.tsx`: change it there, never page by page.

- **Surfaces:** a warm stone canvas (`--portal-canvas` #f6f4ef). Cards are white with a 1px
  `--portal-line` (#ebe6db) edge, 18px corners (`rounded-2xl`), 20px padding and one soft shadow
  (`--portal-shadow-card`). A card inside a card loses its frame and shadow and takes the soft
  fill (`--portal-soft` #f6f3ec). Menus, popovers and dialogs float higher (`--portal-shadow-pop`).
- **Colour, one job each:** near-black ink (#16191c) and a grey (#646a71, 5:1 on the canvas) for
  secondary text; **forest green** (`forest-700` #1d4a37) for actions, links and "you are here";
  `forest-500` (#3d7a5f) for progress bars and small charts; the page or row you are on is
  `--portal-selected` (#eef5f0) with forest text. **Gold** is the accent: the TGA mark, the 3px
  marker beside the current page, the class hero's eyebrow and its Join button. Gold as text is only
  `gold-700` (#7d6428, 4.9:1 on the canvas) for 12px eyebrows; on the hero it is #e3c98f on green.
- **Tags and status:** soft tinted pills (`Tag`, `StatusChip`, `Status` in `ui.tsx`;
  `.portal-tag--ok|warn|bad|info`): ok #e3f0e8/#1b5a3d, warn #fcf0d6/#7a4f00, bad #fde7e4/#9a2a1e,
  info #e6eef8/#25507d, neutral #f1ede4/#3a3f45. Every pair passes 4.5:1.
- **Avatars:** round initials on one of six soft tints chosen from the name (`Avatar`).
- **Buttons (the owner's specific ask):** 40px high (44px on phones), 11px corners, 16px icons.
  Secondary: white, 1px #ddd6c8 edge, a tiny shadow; hover #faf8f3 with a #c9c1ae edge. Primary: a
  forest vertical gradient (#245a43 to #1d4a37), a #173f2c edge, an inner highlight and a lift on
  hover. Danger: the same shape in red. Gold call to action (`variant="gold"`, the class hero's Join):
  46px. Small (`size="sm"`): 32px with 9px corners. Ghost: no box until hovered. Focus: a 3px soft
  green ring (`--portal-focus-ring`). Use `Button`, `ButtonLink`, `IconButton` or `btn()`; the look
  is `.portal-btn--*` in globals.css.
- **Controls:** filter pills 34px (`ui.chip` / `ui.chipOn`, forest when on); segmented controls on
  a #f1ede4 track with the chosen option raised in white (`ui.seg`, `Tabs variant="switch"`); text
  fields 44px with 11px corners and a green focus ring (`ui.input`, `.portal-field`); yes/no
  settings are switches (`Switch` in `ui.tsx`, or `className="portal-switch"` on a checkbox).
- **Tables:** inside a white card; small grey headers; rows 10 to 14px padding; hover #faf8f3; the
  chosen row #eef5f0 (`data-selected="true"`).
- **Type:** Inter only. `t-title` 28px weight 750 with -0.025em tracking; `t-eyebrow` 12px gold-700
  capitals (grey inside tables); `t-section` 15px; body 14 to 15px; `t-meta` 13px grey. The class
  hero's title is 34px.
- **Shell:** the sidebar is a **floating panel**: 16px from the window's edges, white, 22px corners,
  a soft shadow. At its top the brand block (a 36px forest square with "TGA" in gold, then
  "Tarbiyyah / Global Academy"); then Pinned, Home and the categories with icons, which open and
  close; pages sit indented under their category; the page you are on is #eef5f0 with forest bold
  text and a 3px gold inset marker on the left. The account sits at the foot in a soft #f6f3ec block
  and opens the account menu. It still collapses to an icon rail (tooltips) and is the phone drawer.
  The top bar sits on the canvas with no strip or line: search (white, 12px corners, the Ctrl K
  hint), then guide, clock-in, display and feedback as 40px white buttons with 12px corners, then
  **Report a concern** in red text with a pink edge (always visible, never in a menu), then
  notifications. **No strip of tabs across the top of a page** (owner, 11 Nov 2026): the sidebar is
  the way between a category's pages, and a page header names the category in its gold eyebrow.
  **Actions open in place** (a right-side panel that floats with 22px corners, a bottom sheet on
  phones, or a dialog), never on a separate page. The structural patterns are in
  `docs/portal-structure.md`.
- **Page header:** the eyebrow (12px gold capitals), the 28px title, a 13px grey line, actions on
  the right.
- **The classroom** (`components/learn/class/`): the class opens on a deep green hero
  (`ClassHero.tsx`, `.portal-hero`: `radial-gradient(120% 140% at 100% 0%, #2f6b52, #1d4a37 45%,
  #173f2c)`, 24px corners, a faint gold ring top right) with the subject and year as a gold eyebrow,
  the class name, when it meets (the published timetable) and how many pupils, the teachers'
  avatars, three figures for staff (attendance, work in, average result over ten weeks) and the live
  lesson's gold Join button. Below it the sections are listed **down the left in a white card**,
  marked like the sidebar's current page (never tabs across the top, never a dropdown; a board of
  buttons on phones). Stream: a composer card and post cards with an icon avatar, tags and the title,
  with Next lesson and Due soon on the right. Classwork: grouped by kind or topic, each piece with
  its icon tile and a hand-in progress bar. Lessons: a week-by-week timeline. People: teacher cards
  and pupil cards in a grid with each pupil's attendance. Attendance: a heat grid of the last ten
  lessons (rounded code cells and a key), then the registers. Grades: tinted score chips and small
  trend bars. Insights: figure cards with weekly bars, then "Who needs attention". Every figure comes
  from the class's real records; nothing is invented.
- **Motion:** 100 to 200ms, ease-out; buttons settle 1px when pressed; nothing bounces; all of it
  off under reduced motion.
