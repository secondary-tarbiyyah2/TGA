# Curriculum rebuild (November 2026): handover notes

Keep this file current. Anyone (person or AI) picking up the curriculum work starts here.

## Source of truth

- **TGA Curriculum Plan 2027** (Claude Doc, owner: the TGA lead): https://claude.ai/artifact/2WAihVvg7Jg9LWz2d99ha1
  Whole-school plan: principles, weekly lessons per key stage, Years 1-11 long-term plans, Qur'an/Arabic/Islamic
  Studies spine (hifdh targets), assessment, founding term (Jan-Jul 2027), decisions awaiting Headteacher sign-off.
- **Year packs** (one Claude Doc per year group, built in order from Year 1): everything a teacher needs for the year,
  week by week, per subject, plus a dated week-by-week plan for the founding year (11 Jan to 9 Jul 2027).
  - Year 1: **TGA Year 1 Curriculum Pack** https://claude.ai/artifact/MpxKfieQy6ZecHksoR5cko
    (tabs: Overview, English, Maths, Topic, Qur'an/Islamic Studies/PSHE). Its "To confirm" list is open.
  - Year 2: https://claude.ai/artifact/4rgmPugGuzYB78PZJ1PEEs
  - Year 3: https://claude.ai/artifact/9vYWnX4iNnNZRA3BazFLST
  - Year 4: https://claude.ai/artifact/EsdKxjWQXTWcjXQHqguZQi
  - Year 5: https://claude.ai/artifact/3uv1o5LGHDNUEWC4VPaXo6
  - Year 6: https://claude.ai/artifact/XGKfWgxbdXaH4bQJxH17GK
  - Year 7: https://claude.ai/artifact/Eh7nMbS7tKNTJJmavymD3S
  - Year 8: https://claude.ai/artifact/WfgvRBFjZUmic9bM7PHtzg
  - Year 9: https://claude.ai/artifact/RegmdsBx1cvrRpqab4tgzx
  - Year 10: https://claude.ai/artifact/NTUgLkCJLJuKcUteoSF2xL
  - Year 11: https://claude.ai/artifact/6smpe3kadbDLcrvknySaKb
  Markdown sources and the briefs used: docs/curriculum-packs/.
- Working files used to build each pack (subject plans by helper agents) are not kept in the repo; the docs are the record.
- Years 1-6 follow **Tarbiyyah Primary's Long Term Plan 2026-2027** (Cornerstones Maestro projects, same order),
  **White Rose** maths and **Little Wandle** phonics. Years 7-11 will follow the **Tarbiyyah Secondary School for Boys
  Curriculum Overview 2026-27** booklet, adapted to TGA (International GCSEs, no PE).

## House rules for all curriculum content

No PE. No RSE ("PSHE" only). No trips, visitors or theme weeks (online school). No music. Nothing celebrating other
faiths' festivals. Arabic script beside any transliteration. "hifdh" not "hifz". "Spring half term", never "Easter
break". British spelling. No em dashes. Never invent hadith, ayat or scholars' words.

## Weekly lessons (from the plan)

| | Y1-2 (30 min) | Y3-6 (45 min) | Y7-9 (50 min) | Y10-11 (50 min) |
| --- | --- | --- | --- | --- |
| Total | 15 | 20 | 23 | 23 |

Y1-2: English and phonics 5, maths 4, topic 2, Qur'an with Qaidah 3, Islamic Studies / PSHE 1 (alternate weeks).

## Status

### Done
- PE retired everywhere: content/lessons/pe removed (22 lessons listed in content/retired-lessons.json),
  content/syllabus/ks1-3/pe.json removed. (Website pages already had no PE: migration 0156.)
- Year 1 Arabic lessons retired (letters taught in Qur'an through the Qaidah; Arabic language from Year 3).
- Years 1-2 key stage page: src/content/curriculum.ts + migration 0177 (topic 2, IS/PSHE alternate weeks, Qaidah).

- Year 1 pack written (link above).
- Year 1 syllabus entries rewritten to the pack: content/syllabus/ks1-3/{english,mathematics,science,history,
  geography,art,computing,quran,islamic-studies,pshe}.json yearMap.y1 = one unit per half term
  ("Autumn 1: ..."). Art carries design and technology for now (there is no DT syllabus file yet).
- Years 2-9 syllabus entries rewritten to the packs: yearMap.y2..y9 one unit per half term (placed in the planner).
- Opening (owner, 9 Nov 2026; replaces the 8 Nov change): Fri 1 Jan 2027 is a bank holiday, so the first week is
  induction week Mon 4 to Fri 8 Jan, first live lessons Mon 11 Jan, first fee payment Fri 8 Jan. Migration 0181 updates
  the database copies; code, policies, term-dates.ics and the prospectus PDF went back to the 26 Oct wording.
- Secondary curriculum maps (Years 7-11, xlsx from the TSS drive) cleaned of trips/visits/speakers and the
  "Redstone Academy" heading; sent to the owner (not stored in the repo).
- **Curriculum editor in the portal** (built on branch `curriculum-editor`, PR open, live once merged; migration 0179; staff guide:
  docs/curriculum-editing.md). Curriculum planner (Curriculum hub, admin and teaching) edits units per year and half
  term with a week-by-week plan; the Lesson library's **Edit lesson** form edits a lesson and its slides, plan and
  PDFs rebuild with no upload. The workflow "Sync curriculum from the portal" (scripts/curriculum/sync.mjs) seeds the
  portal from content/ and copies portal edits back into content/syllabus and content/lessons, then starts the
  builds. **From now on the portal is the source of truth**: repo edits still flow in, but if a unit or lesson was
  also edited in the portal since the last sync, the portal's version wins. Before a big repo-side rewrite of a year
  (e.g. step 1 below), check the planner's "last change" line, or run the sync first.

### In progress
- In-portal curriculum editor: built, PR open from branch `curriculum-editor` (migration 0179), awaiting review and
  merge. After merge: Deploy Supabase backend runs the migration, then the sync seeds the portal automatically.

### Lessons, slides and plans upgrade (owner request, 9 Nov 2026)
Stages: (1) builder v2 on branch `lesson-builder-v2` (answers + answer-reveal slides, timers, online routines,
hook slide, chart/numberline/fraction/diagram/sort blocks, Years 1-3 design, fuller lesson plan; backwards compatible;
portal editor + sync carry the new fields); (2) upgrade the existing 1,521 lessons subject by subject (answers, hooks,
routines, visuals) checked against house rules; (3) write the missing founding-year lessons from Mon 4 Jan in date
order, year by year, from docs/curriculum-packs; (4) syllabus pages/pack upgrade. Owner sees before/after slides
before any whole-school rebuild.

Stage 4 built on branch `syllabus-v2` (PR open, not merged): the pack is now one curriculum document per subject,
Years 1 to 11 (`01_Subjects/<slug>/`, PDF via Chromium plus Word), and a whole-school overview (`00_Start_Here/`),
from one model (`scripts/syllabus/model.mjs`, `render-html.mjs`, `render-pdf.mjs`, `render-docx.mjs`). The old
per-key-stage spec/syllabus documents and the Start Here deck are gone; the matrix deck stays. The portal Syllabus
pages (`SyllabusBrowser.tsx`, `src/lib/learn/syllabusPlan.ts`) read `curriculum_units` live, falling back to
`syllabusIndex.json`. The workflow now installs docx, playwright, pdf-lib and fonts (it was failing on a missing
`docx`). Preview a change locally with `SYLLABUS_DIR=<copy of content/syllabus> node scripts/syllabus/build.mjs
--out /tmp/pack --pdf --only english,overview`.

### Next
0. Optional: add content/syllabus/ks1-3/design-technology.json (KS1-3 DT statements from gov.uk) so DT is its own
   subject in the portal; for now DT units sit inside art.json.
1. Year 1 lessons for the founding year: bridge (11-22 Jan) + Spring 1 (Moon Zoom!), then Spring 2 to Summer 2.
   Existing content/lessons/*/y1.json lessons were written for an Autumn start: keep what fits, re-point the rest.
2. Year 2-11 packs (breadth first: year on one page, founding-year week-by-week, Spring 1-Summer 2 weekly per subject):
   being drafted (8 Nov) from briefs kept in the session scratchpad; each becomes a Claude Doc like Year 1. Not yet linked here.
   Cornerstones/White Rose detail still to be checked in Maestro (owner to give access; logins were not kept). Then the one-pass consolidation the owner
   agreed (8 Nov): every old SOW/map marked keep, adapt or retire; retired ones to an "Archive - do not teach from" folder.
3. After Headteacher sign-off of the plan: update policy 12 (Curriculum) text in the portal (it lives in
   policy_links.body_md; editing it asks staff to re-sign) so its KS1 table matches the new weekly lessons.
4. Retire Arabic Year 2 lessons the same way when the Year 2 pack is built.
5. Curriculum editor follow-ups: place Years 2-9 units in half terms (they are all "Not placed yet": only Year 1
   carries half terms), add week-by-week plans from the year packs, and later let the planner add new lessons (v1
   edits existing lessons only; new lessons are still added in content/lessons).
