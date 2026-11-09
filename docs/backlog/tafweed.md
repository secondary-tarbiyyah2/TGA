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

Statuses: **Not started** · **In progress** · **Done** · **Needs decision** · **Won't do**

---

## Portal (learn.tarbiyyah.co.uk)

### T1. Classwork lives under each class, not as its own top-level list
- **Owner's note:** "Classwork: we only need it under classes, as appropriate and actionable." (screenshot: Teaching › Classes › *All classwork*)
- **Reading:** remove *All classwork* as a hub tab for teachers/admin, or turn it into a short "needs action" view (late/missing, to mark) that links into each class's Classwork tab. Setting and marking work happens in the class.
- **Files:** `src/lib/learn/nav.ts` (admin "Classes" hub tabs: `/admin/homework`; teach hub), `src/app/learn/admin/homework/page.tsx`, `src/app/learn/teach/homework/`, class page Classwork tab under `src/components/learn/class/`.
- **Done when:** [ ] no duplicate place to set work; [ ] whatever remains outside the class is only actions (late, missing, to mark) with one-click links into the class; [ ] no broken links to the old route.
- **Status:** Not started

### T2. Revision pack page: clearer structure, plus generated action and question packs
- **Owner's note:** "Improve structure of this and generate your own action pack, Q pack." (screenshot: Curriculum › unit › *Revision pack*)
- **Reading:** reorder the pack page so staff see status and actions first (visible to pupils? what's in it? add questions), with the long explainer collapsed. "Generate your own action pack / Q pack": let staff generate an extra question pack and an action plan for the unit from the teacher-checked lesson content. DESIGN.md: **no AI with pupils**; generated questions must be teacher-reviewed before pupils see them.
- **Files:** `src/components/learn/revision/PackBuilder.tsx`, `src/components/learn/curriculum/CurriculumLibrary.tsx`, revision data (migration 0094 and later), `supabase/functions/ai-assist/` (only if AI drafting is used, staff-side only).
- **Done when:** [ ] page leads with status and actions; [ ] explainer collapsible; [ ] staff can create a question pack and an action pack in a few clicks; [ ] nothing generated reaches pupils without a teacher approving it.
- **Status:** Needs decision: confirm "action pack" means a revision action plan for pupils (what to do next), and whether AI may draft questions for teacher review.

### T3. Pupils list: actionable, and open a pupil for their full record
- **Owner's note:** "Improve this and make it actionable; allow me to zoom into students to access full data." (screenshot: *Pupils*, "44 with missing details", long class lists)
- **Reading:** each row opens the pupil's full record (details, medical, attendance, behaviour, reports, entry assessment). Show actions up front: a "Missing details" filter with "Remind family", compact class column (count + expand instead of the full list), sticky header, row click target.
- **Files:** `src/components/learn/pupil/AdminPupils.tsx`, `src/app/learn/admin/pupils/page.tsx`, pupil profile `src/components/learn/pupil/ProfileTabs.tsx`.
- **Done when:** [ ] whole row (keyboard too) opens the pupil record; [ ] missing-details filter and bulk reminder; [ ] class column no longer wraps to several lines; [ ] works at 360 px.
- **Status:** Not started

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

### T6. Faster, consistent switching between staff and student views
- **Owner's note:** "Improve the efficiency and standardisation of transitioning between staff / student."
- **Reading:** unclear. Probably moving between the staff area and the student (or parent) view: one consistent switcher in the account menu, same place on every page, remembering the last area.
- **Files:** `src/components/learn/LearnAccountMenu.tsx`, `src/components/learn/LearnLayoutShell.tsx`, `src/lib/learn/nav.ts` (`portalAreaFor`).
- **Done when:** [ ] owner confirms the meaning; [ ] one switcher, always in the same place.
- **Status:** Needs decision: what transition exactly (a staff member previewing as a student? switching areas? handing a device over?)

---

## Public website (globalacademy.tarbiyyah.co.uk)

### T7. Booking a call: a fixed, no-scroll wizard like Calendly
- **Owner's note:** "The booking shouldn't need scrolling and should be fixed; make the page smoother, like a wizard, similar to Calendly."
- **Reading:** a single panel with steps (choose time zone, then date, then time, then details, then confirm), each step fitting the viewport on desktop, with a fixed step header and Back.
- **Files:** `src/app/(marketing)/book-a-call/page.tsx`, `src/components/booking/BookingCalendar.tsx`, `src/components/booking/PlacePicker.tsx`, function `book-admissions-call`.
- **Done when:** [ ] each step fits at 1280×720 without page scroll; [ ] mobile works as a step-by-step flow; [ ] keyboard and screen-reader friendly; [ ] existing booking and manage-booking links still work.
- **Status:** Not started

### T8. "RECIPE" and "perks": consider other wording
- **Owner's note:** "Use something other than RECIPE or perks?"
- **Files:** `src/app/(marketing)/about/page.tsx` (RECIPE section, Sanity `aboutContent.recipe_items`), `src/app/(marketing)/pastoral-care/page.tsx`, policy `23-recipe-character-framework`, report comments (`ReportAiDraft.tsx`), anywhere "perks" appears.
- **Done when:** [ ] owner picks the new name; [ ] replaced consistently on site, portal and policies.
- **Status:** Needs decision: the replacement name (RECIPE is also a policy title and appears in reports).

### T9. Al-Banaat ethos: same as Secondary?
- **Owner's note:** "Al-Banaat ethos? Is it the same as secondary?"
- **Files:** `src/app/(marketing)/about/page.tsx` (sister schools paragraph), `src/components/Footer.tsx`, `src/components/prelaunch/PrelaunchHome.tsx`, `public/brand/school-*.png`.
- **Done when:** [ ] owner confirms each sister school's description; [ ] copy updated.
- **Status:** Needs decision: content question for the owner (don't invent).

### T10. Accessibility display options
- **Owner's note:** "Display: improve accessibility features?"
- **Reading:** an "Accessibility" control (text size, high contrast, reduced motion, dyslexia-friendly font) saved in the browser, on the public site (the portal may already have large text in places).
- **Files:** `src/components/Header.tsx`, `src/app/globals.css` (tokens), `src/app/(marketing)/accessibility/page.tsx`.
- **Done when:** [ ] settings menu in the header; [ ] persists across pages; [ ] all pairs still pass WCAG 2.2 AA in each mode.
- **Status:** Not started

### T11. Smoother site, less "chunky"
- **Owner's note:** "Ensure the website is smooth; avoid chunkiness."
- **Reading:** reduce layout jumps and heavy blocks: consistent section spacing, no content shift as things load (reserve space for live widgets), lighter page transitions, respect `prefers-reduced-motion`.
- **Files:** `src/app/globals.css` (`.section-pad`, `.hero-pad`), live components (`OpenEveningLive`, `CareersLive`, `FitCheck`).
- **Done when:** [ ] no visible layout shift on key pages (Lighthouse CLS < 0.1); [ ] spacing scale consistent.
- **Status:** Not started

### T12. Open evenings vs taster morning: same page, is one redundant? Testimonials CTA
- **Owner's note:** "When I press 'Open evenings' and 'taster evening' it goes to the same page. Is one useless? Have a CTA directly on testimonials? Or restructure so it works well."
- **Files:** `src/lib/nav.ts` (Admissions menu), `src/app/(marketing)/open-evening/page.tsx`, `src/content/keyDates.ts`, `src/app/(marketing)/testimonials/page.tsx`.
- **Done when:** [ ] one menu item per destination (or separate anchors/sections that actually differ); [ ] testimonials page ends with a clear CTA (book a place / apply).
- **Status:** Not started

### T13. FAQ page: wasted space on the right; sticky search and topics
- **Owner's note:** "Blank space on the FAQ far right; ensure optimal use of space. The 'search questions' and navigation menu: when I scroll down, the navigation goes; it needs to be sticky under the header for constant access."
- **Files:** `src/app/(marketing)/faqs/page.tsx`, `src/components/FaqAccordion.tsx`, `src/components/FaqPreview.tsx`, `src/components/Header.tsx` (header height for `top-*` offset).
- **Done when:** [ ] layout uses the width (e.g. topic sidebar + answers); [ ] search and topic menu stay visible under the sticky header while scrolling; [ ] fine at 360 px.
- **Status:** Not started

### T14. Eligibility ("Is it right for us?"): structure, sticky progress, second child
- **Owner's note:** "On the eligibility form I need optimal structure, and scrolling down shouldn't remove it [the navigation]. Adding a second child should maybe pop up across? Better use of space and ease of navigation. 'Where next' shouldn't be at the bottom of the eligibility page."
- **Files:** `src/app/(marketing)/eligibility/page.tsx`, `src/components/eligibility/FitCheck.tsx` (`add` child, ~line 465), `src/components/RelatedLinks.tsx` (remove "Where next" from this page), `src/content/fitCheck.ts`.
- **Done when:** [ ] step/progress bar sticky under the header; [ ] children shown side by side (cards in a row) on wide screens; [ ] no "Where next" block on this page.
- **Status:** Not started

### T15. Eligibility emailed summary: too much; offer short and full
- **Owner's note:** "The emailed summary is TOO MUCH INFO; restrict it to what's needed. Allow a condensed summary and a full summary?"
- **Files:** `supabase/functions/quiz-send-plan/` (the email), `src/components/eligibility/FitCheck.tsx` (send step).
- **Done when:** [ ] default email is short (fit answer, lesson times, fees total, one next step); [ ] "Send me the full details" option or link for the long version.
- **Status:** Not started

### T16. Curriculum pages: tighter spacing, better use of space
- **Owner's note:** "Curriculum pages need a reasonable distance; don't waste space. Better use of space."
- **Files:** `src/app/(marketing)/curriculum/page.tsx`, `src/app/(marketing)/curriculum/[stage]/page.tsx`.
- **Done when:** [ ] spacing reduced to the site scale; [ ] subject content in a grid on wide screens; [ ] fine at 360 px.
- **Status:** Not started

### T17. Fees calculator behind a button, visible from the start
- **Owner's note:** "Have the calculator as a button so when someone presses it, it expands, for the fees calculator, so they are aware of it being available from day one."
- **Files:** `src/app/(marketing)/fees/page.tsx` (`FeeEstimator` at ~line 162), `src/components/FeeEstimator.tsx`.
- **Done when:** [ ] a prominent "Work out your fees" button near the top of the fees page expands the calculator in place (and can be linked to with `#calculator`); [ ] collapsed by default; [ ] accessible disclosure (`aria-expanded`).
- **Status:** Not started

### T18. Update the prospectus
- **Owner's note:** "UPDATE PROSPECTUS."
- **Files:** `public/prospectus/TGA-Prospectus-2026-27.pdf` (linked from the menu, footer and open-evening page).
- **Done when:** [ ] owner says what has changed (launch January 2027, Year 1 to Year 11, fees, dates, careers?); [ ] new PDF replaces the old one at the same path.
- **Status:** Needs decision: what should change, and is there an editable source (Canva, Word, a Design artifact)?

---

## Log

- 2026-11-09: Backlog created from the owner's notes. T4 started: questions are now covered as soon as the pupil leaves the page, with a "Return to my assessment" button and a visible count (`AssessmentSitting.tsx`). T5 started: Print in the entry-assessment drawer now prints only the report (`EntryAssessmentsAdmin.tsx`, `printElement`).
