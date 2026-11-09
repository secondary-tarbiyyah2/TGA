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
- **Done when:** [x] questions hidden behind a "You left the assessment" screen on tab/window switch; [x] count shown to the pupil; [ ] staff report headline shows "Left the assessment N times" prominently (check `EntryReport.tsx`); [ ] optional: staff setting to end the part after N leaves.
- **Status:** In progress

### T5. Printing an assessment report looks like a screenshot
- **Owner's note:** "When I try to print, it shouldn't come out as a screenshot of the page; the format should be good."
- **Reading:** Print should output only the report, full width, paginated, not the drawer and page behind it.
- **Files:** `src/components/learn/assess/EntryAssessmentsAdmin.tsx` (Detail drawer, Print button), `src/components/learn/printScope.tsx`, `src/components/learn/print.ts(x)` (`PRINT_CSS`), `EntryReport.tsx` print classes.
- **Done when:** [x] Print uses `printElement()` scoped to the report; [ ] checked in Chrome print preview: no drawer chrome, no cut-off right edge, charts readable, sensible page breaks.
- **Status:** In progress

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
- **Done when:** [x] spacing scale consistent (`.section-pad` clamp(3rem,6vw,5rem), new `.section-pad-tight`); [x] smooth scrolling and short cross-page view transitions, only when motion isn't reduced; [ ] Lighthouse CLS < 0.1 on key pages.
- **Status:** In progress (CLS check outstanding)

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
- **Status:** Not started

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
- **Done when:** [ ] outline on public and portal policy pages; [ ] current section highlighted; [ ] works at 360 px and by keyboard.
- **Status:** Not started

### T22. LADO equivalent for an online school, and who is involved
- **Owner's note:** "Check equivalent of LADO and who's involved."
- **Reading:** LADO (Local Authority Designated Officer) handles allegations against adults who work with children, in the local authority where the adult works or the child lives. For an online school with international staff and pupils, the safeguarding policy must say which LADO is used (the school's registered UK local authority), what happens for staff or pupils abroad (local police/child protection in that country, plus the UK LADO for advice), and who in school leads (Headteacher; Chair of Governors if the allegation is about the Headteacher). Research the current KCSIE 2025/26 wording and the school's registered local authority **before** writing; do not invent phone numbers.
- **Files:** safeguarding and allegations policies in `content/policies/` (check numbers in `scripts/policies.json`), `content/policies/30-safer-recruitment.md` (links).
- **Done when:** [ ] owner confirms the school's registered local authority; [ ] policy text names the LADO route, contacts (from the LA website) and the overseas route; [ ] reviewed by the DSL.
- **Status:** Needs decision: which local authority the school is registered with.

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
- **Done when:** [ ] SENCO role assignable; [ ] SENCO can edit, others per RLS; [ ] changes logged; [ ] tests pass.
- **Status:** Not started

### T29. Portal controls: custom dropdowns, no emojis, compartmentalised forms
- **Owner's note:** "Options shouldn't be the native dropdown, make it unique; remove the emojis and make it more suitable for the system; compartmentalise things to make it easy."
- **Reading:** use the existing `Select`/`Dropdown` from `src/components/ui/Dropdown.tsx` (already used on the public site) across the portal instead of bare `<select>`; replace emoji icons with the icon set; long forms split into titled sections/cards.
- **Files:** `grep -rn "<select" src/components/learn src/app/learn`, `grep -rnP "[\x{1F300}-\x{1FAFF}]" src/components/learn src/app/learn`.
- **Done when:** [ ] no bare `<select>` in the portal; [ ] no emojis in portal UI; [ ] lint rule or test stops new ones.
- **Status:** Not started

### T30. Cover and absences: more than the basics
- **Owner's note:** "Suggesting cover and recording absences is very basic."
- **Reading:** record staff absence for a date range and part days; the system lists affected lessons and suggests cover ranked by subject match, free periods and recent cover load; one click to assign and notify; a cover log and simple report.
- **Files:** grep `cover` under `src/components/learn/` and `supabase/migrations/`.
- **Done when:** [ ] ranged absences; [ ] ranked suggestions with reasons; [ ] assign + notify; [ ] cover report.
- **Status:** Not started

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

---

## Log

- 2026-11-09: Backlog created from the owner's notes. T4 started: questions are now covered as soon as the pupil leaves the page, with a "Return to my assessment" button and a visible count (`AssessmentSitting.tsx`). T5 started: Print in the entry-assessment drawer now prints only the report (`EntryAssessmentsAdmin.tsx`, `printElement`).
- 2026-11-09: T13 done. `FaqAccordion.tsx`: wide screens get a sticky left sidebar (search, topics with counts that jump to each section, "Still have a question?"), answers use the rest of the width; phones and tablets get a compact sticky bar under the header with search and a single scrolling row of topics. The current topic is highlighted as you scroll. Topics now jump to their section instead of filtering; search still filters. `faqs/page.tsx`: list no longer limited to `max-w-3xl`.
- 2026-11-09: Owner answered: T2 action pack = a to-do list, AI-drafted questions OK for teacher review; T6 = sign-in tabs; T9 won't do; T18 later. New item T19 (portal-wide professional look). T6 done: `src/app/learn/login/page.tsx` now refuses an account on a tab it holds no role for (signs it out, names the right tab, offers to switch), and lands multi-role users on the chosen area.
- 2026-11-09: Website batch (branch `claude/tafweed-website`): T7 booking wizard (`BookingCalendar.tsx`: Day → Time → Your details in one fixed panel with a summary column); T8 renamed RECIPE to **The Tarbiyyah Compass** (site, portal, lessons, policies, migration 0183); T10 accessibility menu visible from `lg` with a new links/focus option; T11 spacing scale and smooth transitions; T12 separate open-evening and taster sections and links, testimonials CTAs; T14 sticky header/footer and side-by-side children; T15 short/full email; T16 tighter curriculum pages; T17 fees calculator button. Also new policies 11 (Risk Assessment) and 30 (Safer Recruitment). Second batch added as T20–T33.
- 2026-11-09: T32 fixed (branch `claude/tafweed-T32-ai-revision`). Root cause: `_shared/claude.ts` sent `temperature`, which Claude 5.x models (default `claude-haiku-5-5`) reject, so every AI draft failed; the key and deploy were fine. Now no sampling parameters, thinking off for drafts, plain-English errors (`claudeErrorMessage`), and a "Test the AI connection" button in Settings › AI helpers. Same fix in the entry-assessment writing marker.
- 2026-11-09: T2 and T33 done (branch `claude/tafweed-T2-T33-revision-packs`, migration 0184 `revision_pack_drafts`, pgTAP `revision_pack_drafts.test.sql`). Revision pack tab rebuilt status-first (`RevisionPackPanel.tsx`) with AI-drafted questions held for teacher approval, a unit to-do list pupils tick off, and draft packs made automatically when every lesson in a unit is signed off, flagged in the Action centre.
- 2026-11-09: T3, T26, T27 and T31 done (branch `claude/tafweed-T26-pupils`, migration 0185 `pupils_year_group_pronouns`, pgTAP `pupils_admin_edit.test.sql`). Pupils list (`AdminPupils.tsx`): click anywhere on a row (or the name link by keyboard) to open the record; filter chips with counts (missing details, medical alerts, support plan, above year group); "Remind N families" (one email to all, families in Bcc) and "Copy email addresses" when showing missing details; classes shown as "3 classes" that opens to the list; 30-day attendance and support plan columns; Add pupil and Edit on each row; no emojis. Pupil record: Edit pupil button and a "Working above year group" chip. Add and Edit (`PupilPlacement.tsx`, `EditPupilModal.tsx`, also used by People › Add student): year group suggested from date of birth by England's 1 Sept to 31 Aug rule (`src/lib/learn/yearGroup.ts`, tests in `yearGroup.test.ts`, run in CI), staff can override, a year above the suggestion ticks "Working above year group" (only Headteacher/Admin can set it, enforced by a trigger), classes offered for the chosen year with "Show all classes". New portal date picker (`src/components/learn/DatePicker.tsx`): Day, Month, Year boxes plus a keyboard calendar. Report comment and weekly note AI forms prefill the pronoun from the pupil record via `pupil_pronoun()` (staff who teach the pupil, or Headteacher/Admin), still changeable. `DataTable` gained an optional `onRowClick`.
- 2026-11-09: T24, T25 and T1 done (branch `claude/tafweed-T25-action-centre`). T24: the calendar day panel (desktop side panel, phone sheet, day agenda) was cut off by a fixed-height card; new `ScrollArea.tsx` (shrinks in a flex column, focusable for keyboard, fade and "N more below" button) used there and in notifications, the marking list, the inbox and the new-message picker. T25: `ActionCentre.tsx` is one page with categories and counts (side list on wide screens, scrolling row on phones, `?cat=`), each item has Open, Mark done (this device, until it changes) and Print / Save as PDF, plus per-category and whole-list PDF; the admin Home "Needs attention" checks moved into `loadAdminItems()` in `actionCentre.ts` (registers, unexplained absences, overdue marking, signatures, flagged messages, safeguarding reviews, new applications, payment proofs, job applications, new pupils); shared loader `actions/useActionItems.ts` so Home and the Action centre agree. T1: `/admin/homework` and `/teach/homework` are now "Classwork to action" (`ClassworkToAction.tsx`): to mark, missing, late and resubmissions by class, each linking into the class's Classwork tab; setting work only happens in the class (`HomeworkWorkspace.tsx` and `LateMissingView.tsx` removed).
- 2026-11-09: T20 security audit (branch `claude/tafweed-T20-security`, migration 0186 `security_audit_revokes`, pgTAP `security_audit_revokes.test.sql`), written up in `docs/security-audit-2026-11.md`. No critical findings. Fixed: passwords printed in clear in Actions logs (`seed-demo-accounts.yml`, `set-learn-password.yml`); `quiz-send-plan` now one email per fresh lead plus rate limit; scheduled functions (`notify-flagged-messages`, `safeguarding-review-check`, `purge-data-exports`, `send-reminders`) need the service-role key (`_shared/serviceCaller.ts`); login lockout per email and network; policy markdown through `src/lib/safeMarkdown.ts` (raw HTML escaped, unsafe links dropped); security headers in `public/.htaccess` and the portal's; rate limit on `register.php`/`apply.php`; read-only token on 45 workflows; third-party actions pinned to commits; `resync_lesson_teachers` revoked from public; npm audit summary in CI. Listed for later: dependency upgrades (Next 16.4.5+, Sanity), rate limits on direct public inserts, main-site script CSP, HSTS in Cloudflare.
