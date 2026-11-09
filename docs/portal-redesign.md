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
2. Move the remaining hand-written menus (`LearnAccountMenu`, `ClassworkTab`) onto `ActionsMenu`.
3. Apply `WorkspaceHeader` to the other hub pages that still open with a card header (Classes, a class page, Pupils,
   Reports), and the "one primary action plus a menu" rule to their rows.
4. Family and student dashboards: their own figures (as teacher and admin now have).
5. A phone pass at 360px over the new pages (lesson workspace, map, review queue).
6. Later: curriculum analytics, connections visualiser.

## Log
- 2026-11-09 (late): confirmations and pinned lessons (PR "Portal redesign 2").
- 2026-11-09: PR #66 merged. Design system, grouped sidebars, workspace dashboards, lesson workspace, unit header,
  lesson rows, review workflow (0192) with Lesson review queue, Curriculum map, lessons and pupils in ⌘K search.
- 2026-11-09: audit written; design rules agreed (forest green for actions, gold as accent only, monochrome icons).
