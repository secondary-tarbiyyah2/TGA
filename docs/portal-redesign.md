# Portal redesign (owner brief, 9 Nov 2026)

The owner asked for a full rethink of the learning portal (learn.tarbiyyah.co.uk), not a prettier version of the
current one. It must "feel like a proper, professionally engineered education management platform, not a website
with a collection of buttons and lesson cards". This file holds the audit, the design rules and the plan. **Any AI
continuing this work starts here**, keeps the phase list below current, and never removes working features to make
the redesign easier.

The owner's five problems: (1) no visual hierarchy; (2) action-heavy, buttons before content; (3) the curriculum
reads as a list of downloads, not a learning programme; (4) navigation is fragmented (top bar, bottom bar, unit
tabs compete); (5) little visual identity beyond the logo and gold buttons.

Owner's priority order: design system, navigation and dashboards, curriculum and unit pages, lesson workspaces,
review and approval workflow, universal search, curriculum map; analytics and a connections visualiser later.
Make design decisions without asking about small styling choices.

## Phase 1: audit (9 Nov 2026)

**Size.** 117 portal pages: admin 55, teach 28, family 20, student 14. About 270 components under
`src/components/learn`. Roles: head_teacher, admin, admissions, teacher, teaching_assistant_cover, senco, parent,
student (`src/lib/learn/session.ts`).

**Shell and navigation** (`LearnLayoutShell.tsx`, `PortalSidebar.tsx`, `src/lib/learn/nav.ts`).
- A left sidebar already exists (collapsible to an icon rail, remembered per browser); phones get a drawer plus a
  bottom tab bar (`MobileTabBar.tsx`, hidden from `lg` up, so desktop has no bottom bar).
- Destinations are pages or "hubs"; a hub's pages show as a tab strip at the top of the content (`HubTabs`).
- Only the admin area is grouped (Overview, Pupils, Teaching, School office); teach, family and student are flat.
- Every sidebar icon sits in a coloured tile, with eight different hues (`TILE_HUE` in nav.ts). This is the main
  source of "too many colours" and "random decorative icons".
- The top bar holds search (`CommandPalette.tsx`, ⌘K), clock-in, display options, feedback, report a concern and
  notifications.

**Design tokens** (`src/app/globals.css`, `.portal` block; `src/components/learn/ui.tsx`).
- Brand: gold scale, ink, cream; a teal scale that the portal remaps to logo gold, so actions, links, focus and
  "you are here" are all gold. There is no green. Gold does every job, so nothing stands out.
- Dark mode exists (`html[data-dark] .portal`, toggled in Display options) and remaps tokens.
- Buttons: primary (gold-700 fill), secondary (bordered), ghost, danger. Cards: `rounded-2xl` with a border.

**Curriculum** (`curriculum/CurriculumLibrary.tsx`, 1,600 lines; `CurriculumPlanner.tsx`, `SyllabusBrowser.tsx`,
`LessonStudio.tsx`, `LessonEditor.tsx`).
- The Lesson library shows a subject, a year, a row of unit tabs, then lesson cards. Each card carries up to six
  equal buttons: Sign off, Lesson plan, Download, Share to class, Edit lesson or Open lesson, Feedback. There is no
  lesson page of its own; "Open" shows a viewer in the same screen.
- Sign-off (`curriculum_signoffs`, migration 0102) is one row per lesson or spec unit, with status
  `in_review | approved | changes_needed`. There is no submitted or published step, and editing an approved lesson
  does not reopen it. Lesson versions are kept (`curriculum_lesson_versions`, migration 0091).
- The planner (`/admin/planner`) edits units per year and half term; there is no read-only year map.

**Dashboards.** Admin and teacher dashboards are different pages already (`/admin/dashboard`, `/teach/dashboard`),
but both open with the same dark hero banner and a similar layout, so they feel like one page with permissions.

**Other patterns found.**
- 78 `window.confirm` calls: browser pop-ups instead of a consistent confirmation dialog.
- Menus written three times (`LearnAccountMenu`, `ClassworkTab`, `CurriculumLibrary`'s `ActionMenu`).
- Cards inside cards on several hub pages.

## Phase 2: the design system (rules every page follows)

**Colour has one job each.**
| Colour | Job |
| --- | --- |
| Forest green (`--color-forest-*`) | Actions and where you are: primary buttons, links, selected tabs and rows, focus ring. |
| Heritage gold (`--color-gold-*`) | Brand accent only: the logo, the active-page marker in the sidebar, key figures. Never a button fill. |
| Warm neutrals | Canvas (`--portal-canvas`), white surfaces, hairline borders, charcoal text. |
| Amber / red / green | Status only: needs attention, problem, done. |

In the portal the old `teal-*` utilities now mean forest green, so existing pages pick it up without edits.

**Shape and depth.**
- Controls have 0.5rem corners; panels 0.75rem.
- Borders are hairline and only where they separate things. Shadows only on things that float (menus, dialogs).
- No cards inside cards.

**Type.**
- One family (Inter).
- Page titles 24px semibold; section titles 15px semibold; small uppercase eyebrow labels for context
  ("ART & DESIGN / YEAR 7").

**Buttons (three levels).**
- Primary: one per view, forest fill.
- Secondary: bordered.
- Tertiary: text only.
- Everything occasional goes in an actions menu (`ActionsMenu` in `ui.tsx`).

**Icons.** One outline family (`Icon.tsx`), drawn in the text colour. No coloured tiles in navigation.

**Statuses.**
- Workflow statuses use one map, `WORKFLOW` in `ui.tsx`: Draft, Submitted, Under review, Changes requested,
  Approved, Published.
- Other states use the tones neutral, info, good, warn and bad.

**Feedback.**
- Skeleton loading (`LoadingState`), empty states (`EmptyState`) and notices (`Notice`).
- Confirmations use `ConfirmDialog` in `ui.tsx`, not `window.confirm`.

**Themes.** Light and dark, from the same tokens (Display options).

## Plan and status
1. [x] Audit (this file).
2. [x] Design system: tokens, buttons, `ActionsMenu`, `ConfirmDialog`, stat tiles, workflow status badge, quieter
   sidebar (PR #66).
3. [x] Navigation (grouped sidebar for every staff area: Workspace / Pupils / Management) and role dashboards
   (teacher: today, priorities, classes, recently opened lessons; admin: curriculum coverage, approvals, staff
   activity, alerts).
4. [x] Curriculum (PR #66):
   - a unit workspace (compact header with lesson, objective and review counts; lesson rows with one primary action
     and a menu);
   - a lesson workspace page per lesson (overview, slides, plan, objectives, spec links, connections, resources,
     teacher notes, review and version history);
   - a year curriculum map.
5. [x] Review and approval workflow (PR #66, migration 0192):
   - Draft → Submitted → Under review → Changes requested / Approved → Published.
   - Who created, edited and approved it, and when; reviewer comments; versions.
   - Editing an approved or published lesson reopens it automatically (database trigger).
6. [x] Universal search: lessons, units, pupils and classes in the existing ⌘K palette (PR #66).
7. [ ] Pass over every page for consistency, phones (360px), keyboard and contrast; replace `window.confirm`.
8. Later: curriculum analytics, connections visualiser.

## Next (in this order)
1. [x] Every `window.confirm` in the portal now uses the portal dialog (`askConfirm()` in `kit.tsx`; 78 calls in 62
   files). Use `askConfirm`/`useConfirm` for any new confirmation.
1a. [x] Pinned lessons (migration 0193 `lesson_pins`, own rows only): pin from a lesson row or workspace; "Your lessons"
   on the teacher and admin dashboards shows pins then recently opened.
2. [x] The remaining hand-written menus now use `ActionsMenu`: the account menu (`LearnAccountMenu`: avatar trigger, a header with who is signed in, Switch area with "Current", and the View settings as a `content` block) and the class Classwork **Create** menu (`trigger="primary"`, items with a `hint` line). `ActionsMenu` gained, additively: `hint`, `aside` and `content` on items; `trigger="primary"`, `triggerContent`, `header`, `menuClassName`; it flips side and scrolls so it stays on a 360px screen.
3. [x] `WorkspaceHeader` with one primary action and a menu on Classes (admin: Add a class; menu Timetable, Classwork to action), My classes (teacher; menu Gradebook, Classwork to action), a class page (Set work; menu Take the register, Grades, Class settings, All classes; the class sections are a plain tab strip under it), Pupils (Add pupil; figures for pupils, missing details, medical alerts, support plans) and Progress reports (Review approvals when reports are waiting). Pupil rows keep one action (Edit) and open the record on click.
4. [x] Family and student dashboards: their own figures (PR #109).
5. [x] Phone pass at 360px (lesson workspace, curriculum map, lesson review queue and the pages above): `WorkspaceHeader` puts its actions under the title on narrow screens instead of squeezing the title to a few words a line; review queue rows wrap their status line; the top bar shows the square mark below 420px so every button (search, clock, display, feedback, report a concern, notifications) fits instead of being cut off. No sideways scrolling found.
6. Later: curriculum analytics, connections visualiser.

## Navigation and tour (owner, 10 Nov 2026)

Owner: "the TGA portal, I need it better and just easier to navigate; add a really good tour on it and make the tour
very concise and useful; categorise things better and maybe make it dropdown; look at SIMS and Arbor and Moodle."
Tracked as T38 in `docs/backlog/tafweed.md`.

### How the big systems organise it (researched 10 Nov 2026)
| System | Top level | Inside an area | Search | Favourites | Help |
| --- | --- | --- | --- | --- | --- |
| **Arbor** | Fixed top menu: My Items, Students, School, System; "My Homepage" first | Left-hand menu for the pages of the area, collapsible; breadcrumbs | One box for pages, students, guardians, staff, courses | Star a page in the left menu: "Custom Favourites" on My Homepage, per person, renameable | Help Centre link opens guidance for the current page |
| **SIMS** (classic and Next Gen) | Role-based homepage; menus by job (registers, markbook, profiles) | Home page panels: My Timeline, Messages, Reminders, Missing Registers, Favourites | Quick search for pupils and staff | Favourites panel learns the areas, reports, pupils and marksheets you use | Separate help site |
| **Bromcom** | Left main menu by module (MAT: Analysis, Reporting, Admin), dashboard for quick tasks | Hover-out sub-menus | Global search: classes, students, staff, rooms | Not a feature | Documentation centre |
| **Moodle 4** | Primary navigation: Home, Dashboard, My courses, Site admin; a drawer on phones | Secondary tabs (at most 5, the rest under "More"); course index drawer | Global search | Starred courses | **User tours**: short step-by-step tours shown once on first visit to a page, filtered by role, "Reset user tour on this page" in the footer |

Sources: Arbor "How to navigate and get around Arbor" and "Custom Favourites on My Homepage" (support.arbor-education.com);
SIMS home page guide (Buckinghamshire schools web); Bromcom MIS/MAT quick guide; Moodle "Moodle 4.0 navigation
improvements" (docs.moodle.org) and Moodle User tours documentation.

**What TGA adopts.**
- Arbor/SIMS: a **Home** set of everyday pages always visible, then **categories named after the job** (school MIS
  style), each a dropdown in the sidebar, with the category's pages as a tab strip at the top of each page (Moodle's
  secondary navigation).
- Arbor's star: **Pinned** pages per person at the top of the staff menu (the pin beside every page, or "Pin" in search).
- Arbor/Bromcom global search: **one search** that finds every page, sub-page and common job by plain words ("take a
  register", "pay fees", "gdpr"), plus classes, lessons and pupils.
- Moodle user tours: a **short role tour**, shown once, relaunchable from the menu (see "Take the tour").
- Families and pupils: a short flat menu (Moodle's student view), not the staff categories.

### Audit before the change (10 Nov 2026)
| Role | Sidebar entries | Pages | Phone bar |
| --- | --- | --- | --- |
| head_teacher / admin | 10 hubs | 47 | Today, Messages, Pupils, Classes |
| admissions | 6 | 13 | Today, Pupils, Admissions |
| teacher / teaching_assistant_cover | 6 | 27 | Today, My classes, Messages, Pupils |
| senco | 2 | 2 | Support plans, Staff handbook |
| parent | 6 | 17 | Today, Messages, My children, Progress |
| student | 5 | 11 | Today, My classes, Revise, My progress |

Problems found:
- **Wrong place / odd names.** Admin "Pupils" hub held seven different jobs (records, registers, absences, SEND,
  behaviour, house points, enrichment). "Office" held Policies, Accounts, Website, Academic setup and Settings. The
  "Safeguarding" hub's first page was called "Compliance". Parent evenings sat under Today; portal Feedback under
  Messages. Teachers' Gradebook and Reports sat under "My classes"; pupils' "My teachers" under Calendar.
- **Hidden work.** "Waiting for you" (the Action centre) was a tab inside Today, so its count showed on Today instead;
  families' and pupils' Homework was also a tab inside Today.
- **Duplicates.** Hub and first tab with the same name (Classes > Classes, Staff > Staff, Today > Today, Calendar >
  Calendar); "Absences" in two hubs' worth of meaning (pupil absences and staff cover on one page, named only "Absences").
- **Phone menu.** The drawer left out the tab-bar pages, so a group could show a single orphan link (Pupils > Progress).
- **Search** matched only names and descriptions: "attendance" did not find Registers; jobs ("take a register") and
  sub-pages (Subjects, Teacher availability) were not found; no way to save favourites.

### The new structure (nav.ts `NAV_CATEGORIES`)
Every address is unchanged; only the menu moved. `src/lib/learn/nav.test.ts` checks every page under
`src/app/learn/<area>` is in the menu, a sub-page or a detail page, that nothing is listed twice, and that search finds
every menu page.

- **Head teacher / admin** (55 pages): Pinned; **Home** (Today, Waiting for you, Messages, Calendar); **Pupils and
  admissions** (All pupils, Applications, Entry assessments, Open evenings); **Classes and timetable** (Classes,
  Timetable, Make the timetable, Teams links, Classwork to action); **Curriculum** (Curriculum map, Lesson library,
  Lesson review, Planner, Syllabus); **Assessment and reports** (Term reports, GCSE grades, Revision results, School at
  a glance); **Attendance and behaviour** (Registers, Absences and cover, Behaviour, House points, Enrichment);
  **Safeguarding and SEND** (Safeguarding, SEND register, Message oversight, Data protection, Audit log);
  **Communication** (Announcements, Weekly digest, Parent evenings, Portal feedback); **Staff** (Staff, Staff hours,
  Job applications, Staff handbook); **School office** (Fees, Policies to sign, Accounts and sign-ins, Website pages);
  **Settings** (Academic setup, School settings). Phone bar: Today, Messages, Pupils, Classes, Menu.
- **Admissions staff**: the same categories, cut to what they can open (Today, Calendar, Pupils and admissions,
  Safeguarding, Staff handbook, Accounts, Website, Settings). Phone bar: Today, Pupils, Applications, Calendar, Menu.
- **Teacher / cover** (28 pages): Pinned; **Home** (Today, Waiting for you, Messages, Calendar); **My teaching** (My
  classes, Lessons and registers, To mark, Classwork to action); **Pupils** (My pupils, Qur'an and Qaidah);
  **Curriculum** (map, library, review, planner, syllabus); **Assessment and reports** (Gradebook, Term reports,
  Revision results); **Attendance and behaviour** (Absences, Behaviour, House points); **Safeguarding and SEND**
  (Support plans, Report a concern); **Communication** (Announcements, Parent evenings); **My staff area** (My
  profile, My hours, Staff handbook). Phone bar: Today, Classes, To mark, Messages, Menu.
- **SENCo only**: Safeguarding and SEND (Support plans, Report a concern), My staff area (Staff handbook).
- **Parent** (flat, 7): Today (Today, Waiting for you), Homework, Messages (Inbox, Announcements), My children
  (Classes and timetable, Teachers, Child details, Support plan, Report an absence), Progress (Reports, Qur'an,
  Behaviour, Revision), Calendar (Calendar, Parent evenings), Fees. Phone bar: Today, Homework, Messages, Children, Menu.
- **Pupil** (flat, 6): Today (Today, Waiting for you, Announcements), Homework, My classes (My classes, My teachers),
  Revise (Unit revision, Qur'an and Qaidah), My progress (Reports, Merits), Calendar. Phone bar: Today, Homework,
  Classes, Revise, Menu.

Behaviour: categories start closed except the one you are in; opening or closing one, and pins, are saved per person
in `portal_prefs` (migration 0200, own row only) with a browser copy. The phone drawer shows the same categories.
Search (Ctrl K) lists Pinned, Recent and common jobs when empty, and matches every word typed against names,
descriptions and plain-word keywords.

### The guided tour (`src/lib/learn/tours.ts`, `src/components/learn/tour/`)
- One tour per role, 5 to 8 steps of one sentence each, each pointing at the real thing on screen (it dims the page
  and outlines the target). Head teacher: categories, pins, search, Waiting for you, notifications, pupil records,
  Report a concern, how to see it again. Teacher: categories, My teaching, Waiting for you, pins, search, Report a
  concern, again. Parent: Today, Homework, Messages, My children, search, Report a concern, again. Pupil: Today,
  Homework, My classes, Revise, search, again. Phones get phone wording and point at the bottom bar and Menu.
- Shown once, the first time someone signs in to an area; "Skip tour", Esc, or Done all count as seen. Saved in
  `portal_prefs.tours_seen` (migration 0201, own row only), so it does not come back on another device.
- Again at any time: "Take the tour" at the bottom of the menu (phones: in Menu), or search "tour" / "help".
- Keyboard: focus moves to Next and stays in the card (Tab cycles), Esc closes, arrow keys move; focus goes back where
  it was afterwards. Reduced motion: no movement. Built in-house: no third-party script, nothing tracked.
- Page tips, only on the two complex pages, once each and never on top of the first tour: the lesson editor (Slides or
  plan, edit in place, Save) and the planner (pick a year, open a unit, saved for everyone).
- To change a tour, edit `tours.ts` and bump `VERSION` if everyone should see it again; `tours.test.ts` keeps each tour
  5 to 8 steps, one short sentence a step, no dashes, British spelling.

## Log
- 2026-11-10: Guided tour (T38, PR "Portal: a short guided tour for every role"): role tours, page tips on the lesson
  editor and planner, "Take the tour" in the menu and search, migration 0201 `tours_seen`.
- 2026-11-10: Navigation rebuilt round categories (T38, PR "Portal navigation: categories, pins and search"): staff
  sidebar is Pinned, Home, then category dropdowns remembered per person (`portal_prefs`, migration 0200); families
  and pupils keep a short flat menu with Homework at the top level; search finds every page, sub-page and common job by
  plain words; phone bar is the four most-used places plus Menu with the same categories. Research and audit above.
- 2026-11-10: Rest of the canvas built (PR "Portal redesign: the rest"): staff edit a pupil's Home, Health, Support needs, Emergency contacts and Consents on one page with a section list and one Save bar (`PupilDetailsEditor`, `/admin/pupils?id=…&edit=details`; consents are Given / Refused / Not asked); "Fill in from application" on a pupil record re-runs `admissions-create-accounts` (no login, no email) to fill empty fields; teacher Today shows "Your day" as cards with register status, Take register and Start on Teams; Today's "Waiting for you" filters by category in place with a button per row.
- 2026-11-10: Redesign canvas (https://claude.ai/artifact/5xxUxFxTLMmFfoGSi4izku) built in part (PR "Portal redesign: build"): child switcher as cards with initials and year; country-code phone picker on pupil contacts, GP and staff phone; a "Live lessons on Teams" box at the top of Class settings (Test link, Save link); Classes hub gains "Make the timetable" and "Teams links" tabs, Staff hub's Recruitment tab is "Job applications"; hub tabs pick the most specific match; Curriculum map opens on One subject (subjects with approved/written counts, the subject's half terms as one list with one button each), Whole year keeps the old grid. 
- 2026-11-10: Push notifications for new messages (PR #111, migration 0199 `push_subscriptions`, edge function `push-notify`). Opt-in per device: a card on the family, teacher and admin Today pages and a row in Your account. The notification says who it's from, never the message. Hidden until the owner adds `VAPID_PUBLIC_KEY` (variable) and `VAPID_PRIVATE_KEY` (secret). Next candidates: absences, homework due, reports published.
- 2026-11-10: Polish (PR #110): one `Loading` component across 94 files; `askNotice` replaces `window.alert`. Family and pupil Today show their own figures; a pupil record links to the pupil's and parent's sign-ins (PR #109).
- 2026-11-10: Portal restructure (owner: "too crowded, hard to navigate, not centralised"; Option B: the portal is where everything happens, Teams only for live lessons). Every role has one home, **Today**, whose tabs gather what were separate Overview, Action centre (now "Waiting for you"), To do ("Homework"), To review ("To mark"), Calendar and Parent evenings. Places: admin 10 (Today, Messages, Pupils, Progress, Classes, Curriculum, Admissions, Staff, Office, Safeguarding; was 13), teacher 6 (Today, Messages, My classes, Pupils, Curriculum, My staff area; was 10), family 6 (Today, Messages, My children, Progress, Calendar, Fees), pupil 5 (Today, My classes, Revise, My progress, Calendar). Curriculum opens on the map. One word per thing: House points, Behaviour, Merits (pupil view), Timetable. Phone tabs: 4 per role. Breadcrumb root is "Today".
- 2026-11-10: Next 3 and 5 done (workspace headers on Classes, a class, Pupils, Reports; 360px pass).
- 2026-11-10: Next 2 done (menus on `ActionsMenu`); long forms split into titled sections with `FormSection` (PR #72).
- 2026-11-09 (late): confirmations and pinned lessons (PR "Portal redesign 2").
- 2026-11-09: PR #66 merged. Design system, grouped sidebars, workspace dashboards, lesson workspace, unit header,
  lesson rows, review workflow (0192) with Lesson review queue, Curriculum map, lessons and pupils in ⌘K search.
- 2026-11-09: audit written; design rules agreed (forest green for actions, gold as accent only, monochrome icons).
