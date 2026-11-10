# Tafweed backlog: owner feedback, November 2026

The owner's review notes ("Tafweed", 9 November 2026), as numbered tasks.
This file is the single source of truth for this batch of work. **Any AI or
developer picking up this work starts here.**

## How to carry on (read first)

1. Read `DESIGN.md` (the standing brief: brand, accessibility, no hard-coded
   colours, static site, RLS, safeguarding rules). It wins over anything here.
2. Pick the first item below whose status is **Not started** (or the one the
   owner names, e.g. "do T7"). Skip items marked **Needs decision** unless the
   owner has answered the question in the item; ask it instead.
3. Work on a branch named `claude/tafweed-T<n>-<short-name>` from `main`.
   Group small items in one PR if they touch the same files.
4. In the SAME PR, update this file: set the item's status, add a dated line
   under **Log** saying what changed and where, and tick its "Done when"
   boxes. Never delete an item; mark it **Done** or **Won't do** (with why).
5. The sandbox usually can't run `npm`, so CI (lint, `tsc`, build, a11y,
   `supabase test db`) is the check. Open the PR and confirm CI is green.
6. Keep the owner's intent, not just the words: these notes were typed fast.
   Where the meaning is unclear, the **Reading** line says how it has been
   understood so far; if that looks wrong, ask.

Statuses: **Not started** · **In progress** · **Done** · **Needs decision** · **Later** · **Won't do**

---

## Portal (learn.tarbiyyah.co.uk)

### T1. Classwork lives under each class, not as its own top-level list
- **Owner's note:** "Classwork: we only need it under classes, as appropriate and actionable." (screenshot: Teaching › Classes › *All classwork*)
- **Reading:** remove *All classwork* as a hub tab for teachers/admin, or turn it into a short "needs action" view (late/missing, to mark) that links into each class's Classwork tab. Setting and marking work happens in the class.
- **Files:** `src/lib/learn/nav.ts` (admin "Classes" hub tabs: `/admin/homework`; teach hub), `src/app/learn/admin/homework/page.tsx`, `src/app/learn/teach/homework/`, class page Classwork tab under `src/components/learn/class/`.
- **Done when:** [x] no duplicate place to set work; [x] whatever remains outside the class is only actions (late, missing, to mark) with one-click links into the class; [x] no broken links to the old route (same `/admin/homework` and `/teach/homework` routes, now "Classwork to action").
- **Status:** Done (awaiting owner check)

### T2. Revision pack page: clearer structure, plus generated action and question packs
- **Owner's note:** "Improve structure of this and generate your own action pack, Q pack." (screenshot: Curriculum › unit › *Revision pack*)
- **Reading:** reorder the pack page so staff see status and actions first (visible to pupils? what's in it? add questions), with the long explainer collapsed. "Generate your own action pack / Q pack": let staff generate an extra question pack and an action plan for the unit from the teacher-checked lesson content. DESIGN.md: **no AI with pupils**; generated questions must be teacher-reviewed before pupils see them.
- **Files:** `src/components/learn/revision/PackBuilder.tsx`, `src/components/learn/curriculum/CurriculumLibrary.tsx`, revision data (migration 0094 and later), `supabase/functions/ai-assist/` (only if AI drafting is used, staff-side only).
- **Done when:** [x] page leads with status and actions; [x] explainer collapsible; [x] staff can create a question pack and an action pack in a few clicks; [x] nothing generated reaches pupils without a teacher approving it.
- **Owner's answers (9 Nov):** the "action pack" is a **to-do list** for the unit (what each pupil should do next). **Yes**, AI may draft questions, staff-side only, for a teacher to check before pupils see them.
- **What was built:** `src/components/learn/revision/RevisionPackPanel.tsx` (moved out of `CurriculumLibrary.tsx`): status chip and Approve/Show/Hide first; "Add to this pack" with **Draft 8 questions with AI**, **Write questions yourself** and **Make the to-do list**; a "Waiting for your check" list (Approve, Approve all, Remove); the editable to-do list with **Show the list to pupils**; the quiz questions; "How pupils use this pack" folded away. AI drafting is `ai-assist` task `revision_questions` (`supabase/functions/ai-assist/revision.ts`): lesson content only, saved as `review = 'pending'`, which migration 0184 keeps inactive until approved. Pupils see the to-do list at the top of the unit (`UnitTodos.tsx`) and tick items (`revision_tick_todo`).
- **Status:** Done (awaiting owner check)

### T3. Pupils list: actionable, and open a pupil for their full record
- **Owner's note:** "Improve this and make it actionable; allow me to zoom into students to access full data." (screenshot: *Pupils*, "44 with missing details", long class lists)
- **Reading:** each row opens the pupil's full record (details, medical, attendance, behaviour, reports, entry assessment). Show actions up front: a "Missing details" filter with "Remind family", compact class column (count + expand instead of the full list), sticky header, row click target.
- **Files:** `src/components/learn/pupil/AdminPupils.tsx`, `src/app/learn/admin/pupils/page.tsx`, pupil profile `src/components/learn/pupil/ProfileTabs.tsx`.
- **Done when:** [x] whole row (keyboard too) opens the pupil record; [x] missing-details filter and bulk reminder; [x] class column no longer wraps to several lines; [x] works at 360 px.
- **Status:** Done (awaiting owner check)

### T4. Assessments: switching tabs wasn't stopped or noticed by the pupil
- **Owner's note:** "Anti-cheating isn't working for the assessments, I changed tabs easily."
- **Reading:** a browser can't block tab switching, so leaving must be made visible and costly: cover the questions as soon as the page loses focus, make the pupil press "Return to my assessment" (back to full screen), and show the count. Staff already see away/blur counts in the report.
- **Files:** `src/components/learn/assess/AssessmentSitting.tsx` (fair-sitting effect and overlays), `supabase/functions/entry-assessment/index.ts` (`CLIENT_EVENTS`), `src/components/learn/assess/EntryReport.tsx` (counts).
- **Done when:** [x] questions hidden behind a "You left the assessment" screen on tab/window switch; [x] count shown to the pupil; [x] staff report headline shows "Left the assessment N times" prominently (top of the Summary card, with time away and a chip if a part was ended; it counts tab/app switches plus another window in front, the same rule as the pupil's own count); [x] optional: staff setting to end the part after N leaves ("End a part if the child leaves it": Never / 3 / 5 / 10 times, off by default; enforced by the `entry-assessment` function, the pupil is warned on screen, and the report notes which part ended).
- **Status:** Done (awaiting owner check)

### T5. Printing an assessment report looks like a screenshot
- **Owner's note:** "When I try to print, it shouldn't come out as a screenshot of the page; the format should be good."
- **Reading:** Print should output only the report, full width, paginated, not the drawer and page behind it.
- **Files:** `src/components/learn/assess/EntryAssessmentsAdmin.tsx` (Detail drawer, Print button), `src/components/learn/printScope.tsx`, `src/components/learn/print.ts(x)` (`PRINT_CSS`), `EntryReport.tsx` print classes.
- **Done when:** [x] Print uses `printElement()` scoped to the report; [x] checked with Chrome's PDF output (Playwright): no drawer chrome, no cut-off right edge, charts readable, sensible page breaks. It was printing a **blank page**: the print rules hid every dialog, including the drawer the report sits in. Fixed in `PRINT_CSS` (the marked element and its ancestors are put back into the page flow), plus a letterhead, year labels under the strand chart on paper, and long cards allowed to run on to the next page. 3 A4 pages for a full Year 5 report.
- **Status:** Done (awaiting owner check)

### T6. Sign-in: each tab (Parent, Student, Staff) only accepts its own accounts
- **Owner's note:** "Improve the efficiency and standardisation of transitioning between staff / student."
- **Reading:** unclear. Probably moving between the staff area and the student (or parent) view: one consistent switcher in the account menu, same place on every page, remembering the last area.
- **Files:** `src/components/learn/LearnAccountMenu.tsx`, `src/components/learn/LearnLayoutShell.tsx`, `src/lib/learn/nav.ts` (`portalAreaFor`).
- **Owner's answer (9 Nov):** it's the portal sign-in page (Parent / Student / Staff). Signing in as staff on the Parent tab must not work.
- **Files:** `src/app/learn/login/page.tsx`.
- **Done when:** [x] an account without a role for the chosen tab is signed straight out with a message naming the right tab and a "Switch to … sign-in" button; [x] someone with several roles (e.g. teacher and parent) lands on the area of the tab they chose; [ ] owner checks: staff on Parent, parent on Staff, student on Staff are all refused.
- **Status:** Done (awaiting owner check)

---

## Public website (globalacademy.tarbiyyah.co.uk)

### T7. Booking a call: a fixed, no-scroll wizard like Calendly
- **Owner's note:** "The booking shouldn't need scrolling and should be fixed; make the page smoother, like a wizard, similar to Calendly."
- **Reading:** a single panel with steps (choose time zone, then date, then time, then details, then confirm), each step fitting the viewport on desktop, with a fixed step header and Back.
- **Files:** `src/app/(marketing)/book-a-call/page.tsx`, `src/components/booking/BookingCalendar.tsx`, `src/components/booking/PlacePicker.tsx`, function `book-admissions-call`.
- **Done when:** [x] each step fits a fixed 30rem panel on desktop (no page scroll); [x] mobile works as a step-by-step flow; [x] focus moves to each step heading, steps announced with `aria-current`; [x] same `book-admissions-call` request, `#book` anchor and query prefill kept; [ ] owner checks a real booking after deploy.
- **Status:** Done (awaiting owner check)

### T8. "RECIPE" and "perks": consider other wording
- **Owner's note:** "Use something other than RECIPE or perks?"
- **Files:** `src/app/(marketing)/about/page.tsx` (RECIPE section, Sanity `aboutContent.recipe_items`), `src/app/(marketing)/pastoral-care/page.tsx`, policy `23-recipe-character-framework`, report comments (`ReportAiDraft.tsx`), anywhere "perks" appears.
- **Decision (9 Nov):** owner asked for "something unique and suitable for our identity": **The Tarbiyyah Compass** (a compass rose echoes the 8-point star; the six values are unchanged). "Compass Star" replaces "RECIPE Star". Code identifiers (`RECIPE_VALUES`, `recipe_items`) keep their names. "perks" only appears in a GCSE Business lesson (correct use), so nothing to change.
- **Done when:** [x] owner picks the new name; [x] replaced in site copy, portal report drafts, lessons and policies (policy 23 is now `23-tarbiyyah-compass-character-framework`); [x] live DB text renamed by migration 0183 without triggering re-sign requests.
- **Status:** Done

### T9. Al-Banaat ethos: same as Secondary?
- **Owner's note:** "Al-Banaat ethos? Is it the same as secondary?"
- **Files:** `src/app/(marketing)/about/page.tsx` (sister schools paragraph), `src/components/Footer.tsx`, `src/components/prelaunch/PrelaunchHome.tsx`, `public/brand/school-*.png`.
- **Done when:** [ ] owner confirms each sister school's description; [ ] copy updated.
- **Status:** Won't do (owner, 9 Nov: "don't worry about it").

### T10. Accessibility display options
- **Owner's note:** "Display: improve accessibility features?"
- **Reading:** an "Accessibility" control (text size, high contrast, reduced motion, dyslexia-friendly font) saved in the browser, on the public site (the portal may already have large text in places).
- **Files:** `src/components/Header.tsx`, `src/app/globals.css` (tokens), `src/app/(marketing)/accessibility/page.tsx`.
- **Done when:** [x] settings menu in the header (now visible from `lg`, labelled "Accessibility"); [x] persists across pages (existing `ViewSettings`); [x] new "Links and focus" option (underline every link, thick focus ring); [ ] all pairs re-checked in each mode.
- **Status:** Done (awaiting owner check)

### T11. Smoother site, less "chunky"
- **Owner's note:** "Ensure the website is smooth; avoid chunkiness."
- **Reading:** reduce layout jumps and heavy blocks: consistent section spacing, no content shift as things load (reserve space for live widgets), lighter page transitions, respect `prefers-reduced-motion`.
- **Files:** `src/app/globals.css` (`.section-pad`, `.hero-pad`), live components (`OpenEveningLive`, `CareersLive`, `FitCheck`).
- **Done when:** [x] spacing scale consistent (`.section-pad` clamp(3rem,6vw,5rem), new `.section-pad-tight`); [x] smooth scrolling and short cross-page view transitions, only when motion isn't reduced; [x] CLS < 0.1 on key pages: measured with Playwright (layout-shift entries, phone 360 px and desktop) on 15 public pages after `npm run build`, with the live widgets' data answered after a 0.9 s delay. All pages 0 to 0.03, except opening `/open-evening/#book` and `/careers/#vacancies` directly (0.55 and 0.28 on phones): those now show placeholders the size of the list while it loads (`OpenEveningLive.tsx`, `CareersLive.tsx`), giving 0.07 and 0.
- **Status:** Done

### T12. Open evenings vs taster morning: same page, is one redundant? Testimonials CTA
- **Owner's note:** "When I press 'Open evenings' and 'taster evening' it goes to the same page. Is one useless? Have a CTA directly on testimonials? Or restructure so it works well."
- **Files:** `src/lib/nav.ts` (Admissions menu), `src/app/(marketing)/open-evening/page.tsx`, `src/content/keyDates.ts`, `src/app/(marketing)/testimonials/page.tsx`.
- **Done when:** [x] separate sections `#open-evenings` and `#taster` on the open-evening page, each with its own menu and footer link; [x] testimonials has hero buttons and an always-shown "Ready to apply?" band.
- **Status:** Done (awaiting owner check)

### T13. FAQ page: wasted space on the right; sticky search and topics
- **Owner's note:** "Blank space on the FAQ far right; ensure optimal use of space. The 'search questions' and navigation menu: when I scroll down, the navigation goes; it needs to be sticky under the header for constant access."
- **Files:** `src/app/(marketing)/faqs/page.tsx`, `src/components/FaqAccordion.tsx`, `src/components/FaqPreview.tsx`, `src/components/Header.tsx` (header height for `top-*` offset).
- **Done when:** [x] layout uses the width (topic sidebar + answers on wide screens); [x] search and topic menu stay visible under the sticky header while scrolling (sidebar on desktop, compact bar on phones); [ ] owner checks it on a phone (360 px) and desktop after deploy.
- **Status:** Done (awaiting owner check)

### T14. Eligibility ("Is it right for us?"): structure, sticky progress, second child
- **Owner's note:** "On the eligibility form I need optimal structure, and scrolling down shouldn't remove it [the navigation]. Adding a second child should maybe pop up across? Better use of space and ease of navigation. 'Where next' shouldn't be at the bottom of the eligibility page."
- **Files:** `src/app/(marketing)/eligibility/page.tsx`, `src/components/eligibility/FitCheck.tsx` (`add` child, ~line 465), `src/components/RelatedLinks.tsx` (remove "Where next" from this page), `src/content/fitCheck.ts`.
- **Done when:** [x] step header sticky under the header and footer buttons sticky at the bottom; [x] children side by side on wide screens; [x] no "Where next" block on this page.
- **Status:** Done (awaiting owner check)

### T15. Eligibility emailed summary: too much; offer short and full
- **Owner's note:** "The emailed summary is TOO MUCH INFO; restrict it to what's needed. Allow a condensed summary and a full summary?"
- **Files:** `supabase/functions/quiz-send-plan/` (the email), `src/components/eligibility/FitCheck.tsx` (send step).
- **Done when:** [x] default email is short (fit answer, times, fees total, up to 3 dates, one next step); [x] "What should we send?" choice on the form for the full version, and the short email links back for full details.
- **Status:** Done (awaiting owner check)

### T16. Curriculum pages: tighter spacing, better use of space
- **Owner's note:** "Curriculum pages need a reasonable distance; don't waste space. Better use of space."
- **Files:** `src/app/(marketing)/curriculum/page.tsx`, `src/app/(marketing)/curriculum/[stage]/page.tsx`.
- **Done when:** [x] spacing reduced (`section-pad-tight`, tighter gaps); [x] subject content in a grid on wide screens; [ ] owner checks at 360 px.
- **Status:** Done (awaiting owner check)

### T17. Fees calculator behind a button, visible from the start
- **Owner's note:** "Have the calculator as a button so when someone presses it, it expands, for the fees calculator, so they are aware of it being available from day one."
- **Files:** `src/app/(marketing)/fees/page.tsx` (`FeeEstimator` at ~line 162), `src/components/FeeEstimator.tsx`.
- **Done when:** [x] "Work out your fees" button in the fees hero expands the calculator in place (`FeeCalculatorPanel.tsx`; `#calculator` and old `#estimator` links open it); [x] collapsed by default; [x] `aria-expanded`.
- **Status:** Done (awaiting owner check)

### T18. Update the prospectus
- **Owner's note:** "UPDATE PROSPECTUS."
- **Files:** `public/prospectus/TGA-Prospectus-2026-27.pdf` (linked from the menu, footer and open-evening page).
- **Done when:** [ ] owner says what has changed (launch January 2027, Year 1 to Year 11, fees, dates, careers?); [ ] new PDF replaces the old one at the same path.
- **Status:** Later (owner, 9 Nov). Still needs: what should change, and an editable source.

### T19. Make the whole learning portal look more professional
- **Owner's note (9 Nov, with T2):** "I want the whole learning portal to look more professional."
- **Reading:** a portal-wide polish pass, not one page: consistent page headers, spacing and type scale; tables with sticky headers, aligned numbers and compact rows; fewer competing colours and chips; empty and loading states that look finished; clear primary action per page; consistent icons. Use the existing tokens and components (`src/components/learn/ui.tsx`, `PageHeader.tsx`, `DataTable.tsx`, `globals.css` `.portal` rules) and fix them at the source so every page benefits.
- **Approach:** (1) audit the most-used pages with screenshots (`scripts/capture-portal-screenshots.mjs` / the "Update portal screenshots" workflow) and list the inconsistencies; (2) fix shared components first; (3) then page by page, starting with Home, Classes, Pupils (T3), Classwork (T1), Curriculum (T2), Assessments.
- **Files:** `src/components/learn/ui.tsx`, `src/components/learn/PageHeader.tsx`, `src/components/learn/DataTable.tsx`, `src/components/learn/LearnLayoutShell.tsx`, `src/app/globals.css` (`.portal …`).
- **Done when:** [ ] audit list written here; [ ] shared components updated; [ ] top 6 pages reviewed against the list; [ ] owner signs off on before/after screenshots.
- **Status:** Superseded by the portal redesign (owner, 9 Nov evening). Shared polish merged with PR #66; the rest is tracked in `docs/portal-redesign.md`.
- **Long forms in titled sections (owner's note, from T29 "compartmentalise things"):** Done (awaiting owner check). `FormSection` in `ui.tsx` (a fieldset with a small uppercase title and one line of help; a hairline separates sections). Portal: Add pupil and Edit pupil (the pupil, parent, classes, login; `PupilPlacement` gained `part` so placement and classes can sit in different sections; the Add button stays visible at the bottom), new entry assessment (who it is for, timing and breaks, access arrangements, supervision and sending), staff details (name and contact, roles and status, safeguarding and SEND), staff compliance and public profile, policy details (the policy, policy file, listing and review), Settings school details (contact, safeguarding) and lessons (recordings, absence alerts). Website: each child's card on the admissions application (about the child, school and learning, documents, legal parent or guardian) and the careers application's first two steps. Layout only: no field, name, rule or handler changed.

---

## Second batch (owner, 9 Nov 2026, later the same day)

### T20. Security audit
- **Owner's note:** "Review for security audit."
- **Reading:** a written review, then fixes. Check: every table has RLS and the policies match roles (`supabase/migrations`, `supabase/tests`); Edge Functions check the caller's role server-side and rate-limit public endpoints (`_shared/rateLimit.ts`, `booking_attempts`); no service-role key or secrets in client code (`grep -r SERVICE_ROLE src/`); storage buckets private with signed URLs; Supabase advisors (`get_advisors` security) clean; headers/CSP on the static host; dependency audit (`npm audit` in CI); recruitment data retention (6 months, policy 30) actually enforced.
- **Files:** `supabase/migrations/*`, `supabase/functions/*`, `supabase/tests/*`, `next.config.*`, `.github/workflows/*`.
- **Done when:** [x] `docs/security-audit-2026-11.md` written with findings ranked; [x] high findings fixed with pgTAP tests; [ ] advisors clean (run "Advisors, Security" in the TGA Supabase dashboard; not reachable from the agent).
- **Status:** Done (owner: change the leaked demo and support passwords and delete two old run logs, see audit H1)

### T21. Policies: a side outline like Google Docs ("1. Intent", "2. …")
- **Owner's note:** "Have a nice navigation side bar for policies, '1. Intent of…', '2. …' just like Google Docs."
- **Reading:** on each policy page, a sticky left outline built from the policy's `##` headings, numbered, highlighting the current section as you scroll; collapses to a "Contents" button on phones. Same pattern as the FAQ sidebar (T13).
- **Files:** `src/app/(marketing)/policies/[slug]/page.tsx` (or wherever policy markdown renders), `src/components/FaqAccordion.tsx` (reuse the scroll-spy), the portal policy reader under `src/components/learn/policies/`.
- **Done when:** [x] outline on public and portal policy pages (portal: the Preview tab of Documents › Policies › Edit text, the only place the portal shows a policy's sections; the signing screen shows plain text from Word files, which has no headings); [x] current section highlighted (`aria-current="location"`); [x] works at 360 px and by keyboard (links, Escape closes the phone panel, focus moves to the section heading).
- **What was built:** `src/lib/policyOutline.ts` gives each `##` heading an id and builds the numbered list; `src/components/PolicyOutline.tsx` shows it as a sticky left column on wide screens and a sticky "Contents" button (with the section you are reading) under the header on phones and tablets.
- **Status:** Done (awaiting owner check)

### T22. LADO equivalent for an online school, and who is involved
- **Owner's note:** "Check equivalent of LADO and who's involved."
- **Reading:** LADO (Local Authority Designated Officer) handles allegations against adults who work with children, in the local authority where the adult works or the child lives. For an online school with international staff and pupils, the safeguarding policy must say which LADO is used (the school's registered UK local authority), what happens for staff or pupils abroad (local police/child protection in that country, plus the UK LADO for advice), and who in school leads (Headteacher; Chair of Governors if the allegation is about the Headteacher). Research the current KCSIE 2025/26 wording and the school's registered local authority **before** writing; do not invent phone numbers.
- **Files:** safeguarding and allegations policies in `content/policies/` (check numbers in `scripts/policies.json`), `content/policies/30-safer-recruitment.md` (links).
- **Done when:** [ ] owner confirms the school's registered local authority; [ ] policy text names the LADO route, contacts (from the LA website) and the overseas route; [ ] reviewed by the DSL.
- **Status:** Superseded 2026-11-10: the owner asked for no separate mention of the LADO (or Prevent); allegations against staff are described under safeguarding as consulting the local authority (Hounslow, already in policy 01). Migration 0196.

### T23. Safeguarding mailbox safeguarding.globalacademy@tarbiyyah.co.uk
- **Owner's note:** "For safeguarding, should we do safeguarding.globalacademy@tarbiyyah.co.uk?"
- **Reading:** yes, a role mailbox (shared mailbox in Microsoft 365, DSL and deputies as members) is better than a person's address: it survives staff changes. The owner must create it; then the site, policies and email footers switch to it.
- **Files:** grep for the current safeguarding contact in `src/`, `content/policies/`, `supabase/functions/_shared/resend.ts`.
- **Done when:** [ ] owner has created the shared mailbox; [ ] address replaced everywhere; [ ] a test email reaches the DSL.
- **Status:** Needs decision: owner creates the mailbox first.

### T24. Portal: calendar and other panels don't scroll
- **Owner's note:** "Ensure we can scroll on the portal, especially the calendar: there are 9 items, I see 3 or 4 but can't scroll."
- **Reading:** a fixed-height card with `overflow-hidden` (or a flex child missing `min-h-0`) clips the list. Fix at the source: scrollable panels get `min-h-0 overflow-y-auto` and a visible fade/"N more" hint.
- **Files:** the home/dashboard calendar widget under `src/components/learn/` (grep `upcoming`, `Calendar`), `LearnLayoutShell.tsx`, `globals.css` `.portal` rules.
- **Done when:** [x] all 9 items reachable by scroll, wheel, touch and keyboard; [x] same fix applied to other clipped panels.
- **Status:** Done (awaiting owner check)

### T25. Action centre: categorised, one page, actions in place
- **Owner's note:** "Action centre needs to be categorised and easier to navigate and action, for save as PDF etc. Structure everything better and not across two pages."
- **Reading:** one page with category tabs or a side list (Safeguarding, Attendance, Admissions, Recruitment, Reports, Staff, System) with counts; each item has its action buttons inline (open, mark done, save as PDF/print with `printElement`); no second "more" page.
- **Files:** grep `Action centre` under `src/app/learn/` and `src/components/learn/`, `src/lib/learn/nav.ts`.
- **Done when:** [x] one route (`/<area>/actions`); [x] categories with counts; [x] each item actionable in place, including Save as PDF; [x] old second page: there was no separate route; the second place was the admin Home "Needs attention" tiles, now folded into the Action centre (Home keeps one "Needs you" panel that links into each category with `?cat=`).
- **Status:** Done (awaiting owner check)

### T26. admin/pupils: less clutter, more per pupil; add and edit pupils
- **Owner's note:** "admin/pupils too cluttered, not enough unique info for each student." "I should be able to add and edit students on Pupils; remove the emojis that are not appropriate."
- **Reading:** extends T3. Compact rows with what's unique per pupil (photo/initials, year, classes count, SEND flag, attendance %, missing details, last contact); an "Add pupil" button and an Edit action that opens the full record in edit mode. No emojis; use the portal icon set.
- **Files:** `src/components/learn/pupil/AdminPupils.tsx`, `ProfileTabs.tsx`, pupil insert/update RLS (admin/head only).
- **Done when:** [x] add and edit work for admin roles only (RLS tested); [x] no emojis on the page; [x] row opens the full record.
- **Status:** Done (awaiting owner check)

### T27. Add pupil: year group from date of birth, branded date picker, "advanced", classes by year
- **Owner's note:** "When adding a student it should suggest year group; the date picker needs to be smoother and in line with our brand. Year group should be derived from DOB. If a student is advanced (doing GCSE at 12) there should be a way to show that. Pick by year group or show classes based on year group on Add pupil."
- **Reading:** England's rule: the school year runs 1 Sept to 31 Aug, so a child's year group = (academic year start − birth year), adjusted if born 1 Sept or later (Year 1 = turns 6 during the year). Suggest it and let staff override; if the chosen year is above the DOB year, show an "Working above age (advanced)" flag, stored on the pupil. Replace the native date input with a branded picker (day/month/year selects or a calendar in portal tokens). Class picker filtered to the chosen year group, with "show all" for advanced pupils.
- **Files:** the add-pupil form (grep `Add pupil`), a new `src/lib/learn/yearGroup.ts` with unit tests, a migration adding `pupils.working_above_age boolean default false`.
- **Done when:** [x] DOB suggests the correct year (test 31 Aug and 1 Sept birthdays); [x] override + advanced flag saved; [x] classes filtered by year; [x] branded date picker, keyboard accessible.
- **Status:** Done (awaiting owner check). The flag is stored as `children.working_above_year_group` (migration 0185), not `pupils.working_above_age`: the pupils table is `children`.

### T28. SEND register: editable, accessible, and a SENCO role
- **Owner's note:** "SEND register needs to be editable and accessible, with the role of SENCO leader available as an account."
- **Reading:** add a `senco` role (migration: role enum/check, RLS: SENCO reads/writes SEND records for all pupils; teachers read their classes' pupils' support notes only), assignable in staff accounts; register page with inline editing (need, provision, review date, documents) and an audit trail.
- **Files:** SEND register page (grep `SEND` under `src/app/learn/admin/`), roles in `src/lib/learn/roles*.ts` and `LearnGate` `allowedRoles`, `src/lib/learn/nav.ts`, new migration + pgTAP tests.
- **Done when:** [x] SENCO role assignable; [x] SENCO can edit, others per RLS; [x] changes logged; [x] tests pass.
- **Status:** Done (awaiting owner check). "SENCo" is now a staff role of its own (migration 0186), chosen when adding a member of staff or ticked in People › Staff by the Headteacher; the older SENCo switch stays for a teacher who also keeps the register. A SENCo-only account signs in on the Staff tab and lands on the SEND register.

### T29. Portal controls: custom dropdowns, no emojis, compartmentalised forms
- **Owner's note:** "Options shouldn't be the native dropdown, make it unique; remove the emojis and make it more suitable for the system; compartmentalise things to make it easy."
- **Reading:** use the existing `Select`/`Dropdown` from `src/components/ui/Dropdown.tsx` (already used on the public site) across the portal instead of bare `<select>`; replace emoji icons with the icon set; long forms split into titled sections/cards.
- **Files:** `grep -rn "<select" src/components/learn src/app/learn`, `grep -rnP "[\x{1F300}-\x{1FAFF}]" src/components/learn src/app/learn`.
- **Done when:** [x] no bare `<select>` in the portal; [x] no emojis in portal UI; [x] lint rule or test stops new ones.
- **Status:** Done (awaiting owner check). Every dropdown in the portal and on the website is now the branded one (`Select` from `src/components/learn/Select.tsx` in the portal, `src/components/ui/Dropdown.tsx` on the site); emojis replaced with the Lucide icon set (`Icon.tsx`). Splitting long forms into titled sections is not part of this change; raise it as its own item if still wanted.

### T30. Cover and absences: more than the basics
- **Owner's note:** "Suggesting cover and recording absences is very basic."
- **Reading:** record staff absence for a date range and part days; the system lists affected lessons and suggests cover ranked by subject match, free periods and recent cover load; one click to assign and notify; a cover log and simple report.
- **Files:** grep `cover` under `src/components/learn/` and `supabase/migrations/`.
- **Done when:** [x] ranged absences; [x] ranked suggestions with reasons; [x] assign + notify; [x] cover report.
- **Status:** Done (awaiting owner check). Admin › Absences › Staff cover (migration 0187).

### T31. Pronouns come from the pupil's profile
- **Owner's note:** "When filling in details from the profile, under pronoun we should have the pronoun of the child already linked."
- **Reading:** wherever a form asks for pronouns for a pupil (reports, report AI drafts, letters), prefill from the pupil record instead of asking again.
- **Files:** grep `pronoun` in `src/components/learn/` (e.g. `ReportAiDraft.tsx`).
- **Done when:** [x] prefilled everywhere; [x] still editable per document.
- **Status:** Done (awaiting owner check). The pronoun comes from the gender on the pupil record; if a pupil's gender isn't recorded yet, the form starts on "Use their name".

### T32. Portal AI isn't working
- **Owner's note:** "Need to fix AI because the API isn't working."
- **Reading:** check in this order: Supabase Edge Function logs for `ai-assist` (status and error text); secret `ANTHROPIC_API_KEY` set on the project (`supabase secrets list`); model name in `supabase/functions/_shared/claude.ts` still valid; daily limit (`ai_usage_reserve`) not exhausted; the client shows the real error (`edgeErrorMessage`).
- **Files:** `supabase/functions/_shared/claude.ts`, `supabase/functions/ai-assist/`, `.github/workflows/deploy-supabase.yml`.
- **Root cause (9 Nov, from code and the deploy logs):** the key was never the problem. The deploy log (run 42604544326) shows `ANTHROPIC_API_KEY` is in the GitHub secrets and was set on the TGA project, and `ai-assist` deployed. The fault was in `_shared/claude.ts`: every request sent `temperature` (0.2 to 0.8), and the default model `claude-haiku-5-5` (like all Claude 5.x models) rejects sampling parameters, so every draft failed with a 400. The function then hid the reason behind "The AI couldn't write a draft just now". Second, smaller issue: 5.x models think by default and thinking counts towards `max_tokens`, so short drafts (300 to 600 tokens) could stop before writing any text. The entry-assessment writing marker (`_shared/assess/writing.ts`, `claude-sonnet-5-5`, `temperature: 0`) had the same fault.
- **Fix:** `claude.ts` never sends `temperature`, turns thinking off for Haiku/Sonnet 5.x, keeps `max_tokens` at least 1024, treats a refusal or empty reply as an error, logs the API's own error text, and maps failures to plain English (`claudeErrorMessage`: key not accepted, out of credit, model not available, busy, too slow). `ai-assist` returns that sentence to staff and has a new `check` task; Settings › AI helpers has a **Test the AI connection** button (Headteacher/Admin). The writing marker uses the same request body.
- **If it still fails after deploy:** press *Test the AI connection*. It names the cause; for a key problem, replace the GitHub repo secret `ANTHROPIC_API_KEY` (Settings › Secrets and variables › Actions) and re-run "Deploy Supabase backend". Do not set the `AI_MODEL` variable unless you want a different model.
- **Done when:** [x] root cause written here; [ ] a draft generates in the portal (owner to check after deploy: Settings › AI helpers › Test the AI connection, then a report comment draft); [x] errors shown to staff in plain words.
- **Status:** Done (awaiting owner check)

### T33. Revision packs made automatically when a unit's spec is done
- **Owner's note:** "Revision packs need to be made automatically for the spec when done."
- **Reading:** when every lesson in a unit is marked complete/checked, create a draft revision pack (and its to-do list from T2) automatically, hidden from pupils until a teacher publishes it.
- **Files:** with T2: `PackBuilder.tsx`, revision migrations, a trigger or Edge Function on lesson status change.
- **Done when:** [x] draft pack created on unit completion; [x] teacher notified; [x] nothing visible to pupils until approved.
- **What was built (migration 0184):** "unit complete" means every lesson in the unit has an **approved** lesson sign-off in the Lesson library (`curriculum_signoffs`). A trigger then makes a hidden draft pack (`source = 'auto'`) with the lessons' own hinge questions and the default to-do list. It cannot be shown to pupils until a teacher presses **Approve and show to pupils** (`revision_units_guard`). Teachers and the office see "Revision pack ready to check" in the **Action centre**, which links straight to the unit's Revision pack tab. If a unit has no pack yet, the tab also offers **Make a draft pack from the lessons**. Spec-unit sign-offs (KS4 spec points) do not trigger it, because spec points don't map one-to-one to lesson units.
- **Status:** Done (awaiting owner check)

### T34. Lesson feedback: staff flag a lesson or a slide, the Headteacher acts on it
- **Owner's note (9 Nov):** "On every lesson, staff can leave feedback on the lesson or a specific slide ('this slide needs a picture', 'answer 3 is wrong'). It goes to a queue for the Headteacher/Admin (and the subject lead if that role exists) in the Action centre (Curriculum). Admin can accept and make the change in the lesson editor in one click, mark done, or decline with a reason; the staff member is notified. Pupils and parents never see it."
- **Reading:** a "Feedback" button on each lesson in the Lesson library, in the slides and lesson plan viewer and in the lesson editor, with a "Which part?" choice (whole lesson, title, objectives, hook, key words, starter, each teaching slide by its heading, practice, independent, exit ticket, homework, lesson plan). There is no subject lead role yet, so the queue goes to the Headteacher and Admin only (when one is added, give it the same two policies).
- **What was built (migration 0191):** table `curriculum_lesson_feedback` (staff insert their own, read their own; Headteacher/Admin read all and update status and response only; a decline needs a reason; the note itself can't be rewritten) and `curriculum_lesson_feedback_events` (who did what, written by a trigger), plus the audit log. `src/lib/learn/lessonFeedback.ts`, `src/components/learn/curriculum/LessonFeedback.tsx` (dialog, queue, item with Accept and edit / Mark done / Decline). Lesson library: "Feedback" on each lesson and in the viewer; Headteacher/Admin get a "Staff feedback (N waiting)" button. Action centre: new **Curriculum** category (`actionCentre.ts`, `loadLessonFeedbackItems`): one item per waiting note for the Headteacher/Admin, linking to `/admin/curriculum?feedback=<id>`, which opens the lesson editor at that slide with the note beside it (opening it marks it accepted; saving the lesson marks it done). The author sees "Your lesson feedback was acted on / declined" with the reply in their own Action centre for 14 days. The notification bell lists new notes.
- **Done when:** [x] staff can leave feedback on a lesson or a slide from the lesson row and both viewers; [x] Headteacher/Admin see it in the Action centre under Curriculum and in a queue in the Lesson library; [x] "Accept and edit" opens the editor at that slide with the note beside it; [x] mark done / decline with a reason; [x] the author sees the answer in their Action centre; [x] RLS tested (pgTAP `lesson_feedback_quick_build.test.sql`: staff own only, head/admin all, parents nothing); [x] log of who changed what.
- **Status:** Done (awaiting owner check)

### T35. Edit a lesson directly on its slides and download straight away
- **Owner's note (9 Nov):** "Staff can edit a lesson's slides and plan text directly (click a text box on the slide and edit it in place, not only form fields), save, and download straight away as PowerPoint, PDF and the plan as Word/PDF without waiting."
- **How it worked before:** Save in the Edit lesson form stored the lesson in the portal (`curriculum_save_lesson_content`) and asked the Edge Function `curriculum-sync` to start "Sync curriculum from the portal", which copies portal edits into `content/lessons` and then starts "Build lesson decks" (every changed lesson, LibreOffice for PDFs). New slides took up to 30 minutes.
- **What was built:** `LessonStudio.tsx`, opened by **Edit lesson**: the lesson as slides (title, objectives, hook, key words, starter, each teaching slide, practice, independent, exit ticket, homework) where every text box is edited in place (Enter adds a bullet or question, Backspace on an empty one removes it; worked examples, tables and other blocks have each piece of text editable, their shape kept), answers and teacher notes under each slide, and a **Lesson plan** tab with the plan text editable in place. **Download PDF of this lesson** prints the preview (slides landscape, one per page; or the plan) at once. **Save** stores it exactly as before (unknown fields kept, for the lesson builder v3) and the quick build starts: `curriculum-sync` now also takes `{ lesson_id }`, marks it queued (`curriculum_request_lesson_build`) and starts the new workflow **Build one lesson** (`build-one-lesson.yml`, `scripts/lessons/one-lesson.mjs`): only three npm packages, LibreOffice from an apt cache, builds that one lesson from the portal copy and uploads it with the usual `upload-decks.mjs`. The editor shows "Building your slides…" then download buttons (PowerPoint, Slides PDF, Lesson plan Word and PDF) from `curriculum_lesson_builds`. The sync still copies the edit into the repo, and the full build then sees the slides are current. The old form is still there ("Full form", or "Edit in the full form" in the ⋯ menu) and its Save also starts the quick build. Permissions: `curriculum_can_edit_lesson()` (teachers edit lessons in subjects recorded for them in class subject assignments, class roles or their staff profile, or any lesson if none is recorded; Headteacher/Admin all), enforced in `curriculum_save_lesson_content`.
- **Done when:** [x] click-to-edit slide preview and plan text; [x] Save starts a one-lesson build and the editor shows progress then download links; [x] in-browser PDF of the preview; [x] edits still reach content/lessons through the sync; [x] subject permission enforced in the database (pgTAP); [x] unknown lesson fields kept on save (also in the full form: items and hooks keep extra fields); [ ] owner checks a real save after deploy (time from Save to downloads).
- **Status:** Done (awaiting owner check)

### T36. Tell families: stylus tablet recommended, otherwise a printer is required
- **Owner's note:** families should be told that a drawing tablet with a stylus is RECOMMENDED for every pupil (so they can write on worksheets and the lesson PDFs), and that a pupil without one REQUIRES a printer at home.
- **Reading:** one consistent, plain-English line wherever the site, portal and policies list equipment. Keep it affordable: any tablet that takes a stylus, or a basic graphics tablet that plugs into the laptop, or a home printer. Say why: worksheets and the lesson PDF each day.
- **Files:** `src/app/(marketing)/learning/page.tsx` (What your child needs at home), `src/content/seed.ts` + migration 0190 (FAQs "What equipment do we need?" and "What is not included in the fees?", and the policy text held in `policy_links`), `src/content/fitCheck.ts` + `src/lib/fitCheck.ts` ("Is it right for us?" checklist, which also feeds its full emailed summary), `content/policies/` 02, 03, 07, 24, 25 (version lines bumped), `src/components/learn/StaffHandbook.tsx` (staff line: PDFs and worksheets must be printable or annotatable on a tablet).
- **Done when:** [x] learning page, FAQs, fit check and its email say it; [x] Admissions, Fees, Online Safety, Live Lesson Protocols and Behaviour policies say it, with version lines bumped; [x] staff guidance line; [ ] prospectus PDF updated (follow-up: its "What we ask of the home" panel lists only a device, camera, microphone and internet).
- **Status:** Done (prospectus PDF is a follow-up)


### T37. Pupil records: ideas from Ihsan LMS
- **Owner's note (9 Nov):** "Without copying what's on Ihsan LMS, use it for inspiration on the good things we can do on TGA in terms of structure and storing student data."
- **Reading:** Ihsan LMS (the owner's other product, repo `Bananamc/madrasa-maina`) does these well. **Check what TGA already has first** (some may exist after T3/T26/T27), then build the gaps TGA's way, with TGA's tables, RLS and DESIGN.md. Don't copy code.
  1. **Possible duplicates banner:** pupils with the same name (ignoring case) and date of birth are flagged at the top of the Pupils list, with a link to each record.
  2. **Who sees what, said on the form:** each section of the pupil record says who can see it ("office only, never shown to teachers" for the home address; "shown to the pupil's teachers" for allergies). TGA already enforces this (`teacher_pupil_health`, Policy 09); say it on the form too.
  3. **Consents with a date:** photos, trips and emergency medical treatment stored as yes / no / not recorded, plus when and who recorded each one. Add filter chips on Pupils for "Consent not recorded" and "No photo consent".
  4. **Households:** siblings grouped under one family on the Pupils list and the pupil record, with guardians listed once.
  5. **Privacy tools per pupil:** download everything held about a pupil, and erase a pupil (with a confirmation and an audit entry), for data-rights requests. Check `src/components/learn/compliance/DataRights.tsx` first.
  6. **List and record side by side:** on wide screens the list stays on the left and the chosen pupil opens on the right, so staff can move through pupils without going back.
- **Files:** `src/components/learn/pupil/AdminPupils.tsx`, `AdminPupilDetail.tsx`, `PupilRecord.tsx`, `ChildDetailsForm.tsx`, `data.tsx`, `src/components/learn/compliance/`, new migration + pgTAP tests for any new columns.
- **Done when:** [ ] what already exists is listed here; [ ] each missing idea built or marked Won't do with a reason; [ ] RLS tests for any new columns; [ ] owner checks.
- **Status:** Not started

### T38. Portal navigation: categories, pins, search and a guided tour
- **Owner's note (10 Nov):** "The TGA portal, I need it better and just easier to navigate; add a really good tour on it and make the tour very concise and useful; categorise things better and maybe make it dropdown; look at SIMS and Arbor and Moodle."
- **Reading:** staff menus laid out like a school MIS (Home, then job-named categories as dropdowns, remembered per person), pinned pages, one search that finds every page and common job in plain words, a short flat menu for families and pupils, the same categories in the phone menu. Then a short role tour (5 to 8 one-sentence steps on the real buttons), shown once, skippable, keyboard and phone friendly, relaunchable ("Take the tour"); 2 to 3 step tips only on complex pages (lesson editor, planner). Research, audit and the new category list are in `docs/portal-redesign.md` ("Navigation and tour").
- **Files:** `src/lib/learn/nav.ts` (`NAV_CATEGORIES`), `nav.test.ts`, `portalPrefs.ts`, `src/components/learn/PortalSidebar.tsx`, `MobileTabBar.tsx`, `CommandPalette.tsx`, `src/app/globals.css` (menu rows), migration 0200 `portal_prefs` + pgTAP `portal_prefs.test.sql`; tour: `src/components/learn/tour/`.
- **Done when:** [x] research and comparison written up; [x] every role's menu audited (counts, duplicates, odd names); [x] staff categories as dropdowns, open/closed remembered per person; [x] pinned pages; [x] families and pupils flat and short; [x] every page still reachable, old addresses unchanged (unit test); [x] search finds every page and common jobs by plain words; [x] phone: same categories in the menu, 4 most-used in the bottom bar; [x] role tours, shown once, relaunchable; [x] mini tips on the lesson editor and planner; [x] screenshots at desktop and 360px checked (made-up data); [ ] owner checks.
- **Status:** Done (awaiting owner check). Navigation PR #133, tour PR #135.

---

## Log

- 2026-11-10: T38 tour (branch `claude/portal-nav-tour`, migration 0202 `portal_prefs_tours`, pgTAP `portal_prefs_tours.test.sql`, unit test `src/lib/learn/tours.test.ts`). A short tour per role (5 to 8 one-sentence steps that outline the real menu, search, pins, notifications and key pages; phone wording on phones), shown once on first sign-in, skippable, Esc to close, focus kept in the card; again from "Take the tour" in the menu or search. Tips (3 steps) on the lesson editor and the planner, once each. Built in-house (`src/components/learn/tour/`), no tracking.
- 2026-11-10: T38 navigation (branch `claude/portal-nav-tour`, migration 0200 `portal_prefs`, pgTAP `portal_prefs.test.sql`, unit test `src/lib/learn/nav.test.ts`). Staff sidebar: Pinned, Home (Today, Waiting for you, Messages, Calendar), then categories as dropdowns (admin: Pupils and admissions, Classes and timetable, Curriculum, Assessment and reports, Attendance and behaviour, Safeguarding and SEND, Communication, Staff, School office, Settings; teacher: My teaching, Pupils, Curriculum, Assessment and reports, Attendance and behaviour, Safeguarding and SEND, Communication, My staff area); each category's pages are its tab strip. Families: Today, Homework, Messages, My children, Progress, Calendar, Fees. Pupils: Today, Homework, My classes, Revise, My progress, Calendar. Search (Ctrl K) matches plain words and lists jobs ("Take a register", "Pay fees", "Pin this page"). Phone bar: the 4 most-used places plus Menu, which now shows every category. Same addresses throughout.

- 2026-11-09: Backlog created from the owner's notes. T4 started: questions are now covered as soon as the pupil leaves the page, with a "Return to my assessment" button and a visible count (`AssessmentSitting.tsx`). T5 started: Print in the entry-assessment drawer now prints only the report (`EntryAssessmentsAdmin.tsx`, `printElement`).
- 2026-11-09: T13 done. `FaqAccordion.tsx`: wide screens get a sticky left sidebar (search, topics with counts that jump to each section, "Still have a question?"), answers use the rest of the width; phones and tablets get a compact sticky bar under the header with search and a single scrolling row of topics. The current topic is highlighted as you scroll. Topics now jump to their section instead of filtering; search still filters. `faqs/page.tsx`: list no longer limited to `max-w-3xl`.
- 2026-11-09: Owner answered: T2 action pack = a to-do list, AI-drafted questions OK for teacher review; T6 = sign-in tabs; T9 won't do; T18 later. New item T19 (portal-wide professional look). T6 done: `src/app/learn/login/page.tsx` now refuses an account on a tab it holds no role for (signs it out, names the right tab, offers to switch), and lands multi-role users on the chosen area.
- 2026-11-09: Website batch (branch `claude/tafweed-website`): T7 booking wizard (`BookingCalendar.tsx`: Day → Time → Your details in one fixed panel with a summary column); T8 renamed RECIPE to **The Tarbiyyah Compass** (site, portal, lessons, policies, migration 0183); T10 accessibility menu visible from `lg` with a new links/focus option; T11 spacing scale and smooth transitions; T12 separate open-evening and taster sections and links, testimonials CTAs; T14 sticky header/footer and side-by-side children; T15 short/full email; T16 tighter curriculum pages; T17 fees calculator button. Also new policies 11 (Risk Assessment) and 30 (Safer Recruitment). Second batch added as T20–T33.
- 2026-11-09: T32 fixed (branch `claude/tafweed-T32-ai-revision`). Root cause: `_shared/claude.ts` sent `temperature`, which Claude 5.x models (default `claude-haiku-5-5`) reject, so every AI draft failed; the key and deploy were fine. Now no sampling parameters, thinking off for drafts, plain-English errors (`claudeErrorMessage`), and a "Test the AI connection" button in Settings › AI helpers. Same fix in the entry-assessment writing marker.
- 2026-11-09: T2 and T33 done (branch `claude/tafweed-T2-T33-revision-packs`, migration 0184 `revision_pack_drafts`, pgTAP `revision_pack_drafts.test.sql`). Revision pack tab rebuilt status-first (`RevisionPackPanel.tsx`) with AI-drafted questions held for teacher approval, a unit to-do list pupils tick off, and draft packs made automatically when every lesson in a unit is signed off, flagged in the Action centre.
- 2026-11-09: T3, T26, T27 and T31 done (branch `claude/tafweed-T26-pupils`, migration 0185 `pupils_year_group_pronouns`, pgTAP `pupils_admin_edit.test.sql`). Pupils list (`AdminPupils.tsx`): click anywhere on a row (or the name link by keyboard) to open the record; filter chips with counts (missing details, medical alerts, support plan, above year group); "Remind N families" (one email to all, families in Bcc) and "Copy email addresses" when showing missing details; classes shown as "3 classes" that opens to the list; 30-day attendance and support plan columns; Add pupil and Edit on each row; no emojis. Pupil record: Edit pupil button and a "Working above year group" chip. Add and Edit (`PupilPlacement.tsx`, `EditPupilModal.tsx`, also used by People › Add student): year group suggested from date of birth by England's 1 Sept to 31 Aug rule (`src/lib/learn/yearGroup.ts`, tests in `yearGroup.test.ts`, run in CI), staff can override, a year above the suggestion ticks "Working above year group" (only Headteacher/Admin can set it, enforced by a trigger), classes offered for the chosen year with "Show all classes". New portal date picker (`src/components/learn/DatePicker.tsx`): Day, Month, Year boxes plus a keyboard calendar. Report comment and weekly note AI forms prefill the pronoun from the pupil record via `pupil_pronoun()` (staff who teach the pupil, or Headteacher/Admin), still changeable. `DataTable` gained an optional `onRowClick`.
- 2026-11-09: T24, T25 and T1 done (branch `claude/tafweed-T25-action-centre`). T24: the calendar day panel (desktop side panel, phone sheet, day agenda) was cut off by a fixed-height card; new `ScrollArea.tsx` (shrinks in a flex column, focusable for keyboard, fade and "N more below" button) used there and in notifications, the marking list, the inbox and the new-message picker. T25: `ActionCentre.tsx` is one page with categories and counts (side list on wide screens, scrolling row on phones, `?cat=`), each item has Open, Mark done (this device, until it changes) and Print / Save as PDF, plus per-category and whole-list PDF; the admin Home "Needs attention" checks moved into `loadAdminItems()` in `actionCentre.ts` (registers, unexplained absences, overdue marking, signatures, flagged messages, safeguarding reviews, new applications, payment proofs, job applications, new pupils); shared loader `actions/useActionItems.ts` so Home and the Action centre agree. T1: `/admin/homework` and `/teach/homework` are now "Classwork to action" (`ClassworkToAction.tsx`): to mark, missing, late and resubmissions by class, each linking into the class's Classwork tab; setting work only happens in the class (`HomeworkWorkspace.tsx` and `LateMissingView.tsx` removed).
- 2026-11-09: T20 security audit (branch `claude/tafweed-T20-security`, migration 0188 `security_audit_revokes`, pgTAP `security_audit_revokes.test.sql`), written up in `docs/security-audit-2026-11.md`. No critical findings. Fixed: passwords printed in clear in Actions logs (`seed-demo-accounts.yml`, `set-learn-password.yml`); `quiz-send-plan` now one email per fresh lead plus rate limit; scheduled functions (`notify-flagged-messages`, `safeguarding-review-check`, `purge-data-exports`, `send-reminders`) need the service-role key (`_shared/serviceCaller.ts`); login lockout per email and network; policy markdown through `src/lib/safeMarkdown.ts` (raw HTML escaped, unsafe links dropped); security headers in `public/.htaccess` and the portal's; rate limit on `register.php`/`apply.php`; read-only token on 45 workflows; third-party actions pinned to commits; `resync_lesson_teachers` revoked from public; npm audit summary in CI. Listed for later: dependency upgrades (Next 16.4.5+, Sanity), rate limits on direct public inserts, main-site script CSP, HSTS in Cloudflare.
- 2026-11-09: T28 done (branch `claude/tafweed-T28-senco-cover`, migration 0186 `send_senco_role`, pgTAP `send_senco_role.test.sql`). New staff role `senco` ("SENCo"): set by the Headteacher in People › Staff or chosen in Add person, counts as staff, sees only the SEND register and the handbook in the Teaching area, and `send_can_manage()` admits it, so a SENCo reads and writes every pupil's SEND record. Teachers still read only active plans (support notes) for pupils they teach; parents never get the register, documents or the log. Register (`SendRegister.tsx`, `SendExtras.tsx`): an accessible table (cards on phones) where level, main need, status and next review save in place; "Add a pupil" for any pupil; a "Recent changes" tab. Each plan gains Documents (links to the EHC plan and reports in secure storage, new table `send_plan_documents`) and a Change history read from the audit log (`send_change_log()`, field names only). `learn-invite` accepts the new role.
- 2026-11-09: T30 done (branch `claude/tafweed-T30-cover`, migration 0187 `cover_part_days_log`, pgTAP `cover_part_days.test.sql`, unit tests `src/lib/learn/cover.test.ts`). Admin › Absences › Staff cover (`CoverSuggestions.tsx`, logic in `src/lib/learn/cover.ts`): record an absence for a range of days or part of a day (away from a time on the first day, back at a time on the last), with a type (sickness, medical, training, school business, leave, other); every affected lesson from the published timetable is listed, covered or not; free staff are ranked by subject match (teaches the subject, already teaches the class, cover staff), then free periods that day, then cover done in the last four weeks, with the reasons shown as chips; "Assign and notify" assigns the cover and emails the covering teacher (new in `cover-notify`, `teacher_notified_at`) as well as the families. The absence note is never sent to anyone. New Cover log (search, CSV, "Email again", Remove, which hands the lesson back via `timetable-cover` `action: remove`) and Cover report (absences by type, lessons affected and % covered, covers given and received per person, CSV) for the last 30 days, 90 days or 12 months.
- 2026-11-09: T21, T4, T5, T11 done (branch `claude/tafweed-T21-policy-outline`). T21: policy pages and the portal policy preview have a numbered side outline ("Contents" button on phones) that highlights the section being read (`PolicyOutline.tsx`, `policyOutline.ts`). T4: the assessment report leads with "Left the assessment N times"; staff can choose to end a part after 3, 5 or 10 leaves (`entry-assessment` `access.leaveLimit`, `countLeaves` in `_shared/assess/integrity.ts`). T5: printing a report no longer comes out blank (`print.tsx` `PRINT_CSS`), with letterhead and chart labels. T11: CLS measured on 15 public pages (all under 0.1); loading placeholders for the open-evening and vacancy lists.
- 2026-11-09: T36 done (branch `claude/tafweed-device-requirement`, migration 0190 `stylus_tablet_or_printer`). A tablet with a stylus is now listed as recommended for every pupil (any stylus tablet, or a basic graphics tablet that plugs into the laptop) to write on worksheets and the daily lesson PDF, with a home printer required without one: learning page, FAQs (equipment, and what fees do not cover), the "Is it right for us?" checklist and its full email, policies 02, 03, 07, 24 and 25 (versions bumped, live text updated by the migration so the PDFs rebuild), and a staff handbook line. Prospectus PDF still to update.
- 2026-11-09: T34 and T35 done (branch `claude/tafweed-lesson-feedback-editing`, migration 0191 `lesson_feedback_and_quick_build`, pgTAP `lesson_feedback_quick_build.test.sql`). Lesson feedback on any lesson or slide, a queue and an Action centre "Curriculum" category for the Headteacher/Admin (accept and edit at that slide, done, decline with a reason; the author sees the answer). Edit lesson now opens a click-to-edit slide and lesson plan view (`LessonStudio.tsx`) with an instant print-to-PDF; Save starts the new "Build one lesson" workflow so the PowerPoint, PDF and plan are ready to download in about two minutes. Teachers edit lessons in their own subjects (or all if none is recorded).
- 2026-11-09: T29 done (branch `claude/tafweed-T29-dropdowns-icons`). 183 bare `<select>`s in 95 files (portal and website) now use the branded dropdown: keyboard, screen reader and phone friendly, with a search box for lists of more than 12. The portal wrapper `src/components/learn/Select.tsx` behaves exactly like the old `<select>` (an "All ..." option can be picked again, a field with no default starts on its first option, same `name`/`required`/`disabled`/`onChange`), and its list floats over tables and cards and stays on a 360px screen (`Dropdown.tsx`: new opt-in `floating` and `native` props). Emojis (badges, medals, Add person tiles) and emoji-like symbols (ticks, stars, play, backspace) replaced with icons; new icons heart, medal, play, rotateCcw, arrowLeftRight, delete, zap. Guard: `src/lib/learn/uiControls.test.ts` (CI unit tests) and an ESLint rule fail on a new bare `<select>` or emoji. Country flags in the "Where are you joining from?" picker are kept.
- 2026-11-09: T37 added (pupil-record ideas from Ihsan LMS, owner's request). Duplicate portal PR #61 closed: the same items were already merged in #46 to #63.
- 2026-11-10: T19 long forms split into titled sections (branch `claude/tafweed-T19-polish`): Add/Edit pupil, new entry assessment, staff details, compliance and profile, policy details, Settings, the admissions application's child cards and the careers application. New `FormSection` in `ui.tsx`. Layout only; checked with screenshots at 1366px and 360px using made-up data.
- 2026-11-10: Website and admissions batch (owner: "less scrolling", "postcode suggests the address", "ask if they lived in the UK so we can contact the local council", "country code dropdown with flag", "improve navigation, make it cooler, keep the colours, improve forms"). PR #81: apply page has a short intro, a fold-away "What you'll need" box and the form straight away. PR #82: the steps are About you, Address and ID, Your children, Documents, Fees and declaration, with sticky progress and Back/Next, and one child card at a time. PR #83 (migration 0194 `admissions_uk_link`, pgTAP `admissions_uk_link.test.sql`): the council for a UK postcode (postcodes.io), "Has your child ever lived in the UK?" with the last UK postcode and its council for families abroad, and "Is <child> a British citizen?" per child, shown in the application drawer and the CSV; `deploy-site.yml` passes `vars.GOOGLE_MAPS_API_KEY` into the build (owner to add the key: Places API (New), restricted to the site). PR #86: `src/components/ui/PhoneInput.tsx` adds a searchable country code picker with flags (local SVGs in `public/images/flags`, MIT) on every public phone field, stored as one international number. PR #87: desktop menu panels with icons, descriptions and a featured next step, a current-section underline, quick tiles in the mobile menu, and a livelier homepage (turning star, facts band, ink "Why TGA" band, card lift, scroll reveal, CTA and footer glow) in the same palette. PR #88: the register interest form gets real validation, a year group dropdown and grouped fields.
- 2026-11-10: Owner: "remove any reference to Prevent or LADO, all of that we will categorise under safeguarding". Policy 05 is now "Safeguarding: Extremism and Radicalisation Policy" (`05-safeguarding-extremism-and-radicalisation`, old address redirects in `public/.htaccess`); policies 01, 04, 11, 22 reworded (local authority's allegations officer; extremism and radicalisation awareness); migration 0196 updates the live text without asking anyone to re-sign. Duties unchanged. Run Sync policies after deploy. Same day: the Tarbiyyah Compass got the Academy's own six values in three strands (Faith: Ikhlas, Shukr; Knowledge: Ilm, Itqan; Character: Adab, Amanah), `src/content/compass.ts`, policy 23 v2.0, migration 0195. About 20 lesson JSON files still name an old value (PSHE notes); update them in the next lesson rebuild.
- 2026-11-10 (later): Owner asked for an acronym after all. The Tarbiyyah Compass values now spell IHSAN: Ilm (love of learning), Honesty (sidq and amanah), Sabr and shukr, Adab, Niyyah (sincere intention); one per half term, Summer 2 is Ihsan with all five. `src/content/compass.ts`, policy 23 v2.1, migration 0197 (replaces 0195's six). About page shows the letters large so the word reads at a glance.
- 2026-11-10: Portal (Option B, "the portal is the school"): navigation rebuilt round one Today per role (PR #108), family and pupil figures (PR #109), shared Loading and notice dialogs (PR #110), push notifications for new messages (PR #111, migration 0199; owner adds the VAPID keys to switch it on).
- 2026-11-10: Owner asked again for (a) job applications managed in the portal: already at Staff › Recruitment (`/admin/recruitment`), to be surfaced better; (b) a timetable generator matching staff availability with pupils' subjects: already at Classes › Timetable › Generate (`/admin/lessons/generate`, solver `scripts/timetable-solver/generate.py`), to be surfaced better; (c) application form to pupil record without retyping: accepting now also copies gender, previous school and the parent/guardian as emergency contacts, filling only empty fields (PR "Admissions: accepting fills the pupil record"). Portal redesign canvas: https://claude.ai/artifact/5xxUxFxTLMmFfoGSi4izku
- 2026-11-10: Lesson builder: assessment mode. Tests, mocks and quizzes (`assessmentMode`, set on the 272 lessons the title detection finds) now get an exam-conditions slide with the timer, questions labelled Question 1, 2 or Section A, B with marks, no answers in the pupils' flow or PDF, and the mark scheme after a teacher-only divider and in the lesson plan (branch builder-assessment-mode).
- 2026-11-10: Assessment mode follow-up: quiz lessons (often review and quiz) now keep starter, guided practice and poll answers in the lesson and hold back only the quiz questions' answers; follow-on tasks in a mock are labelled "Extra" and left out of the total (branch builder-assessment-mode-2).
