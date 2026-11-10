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

Owner decisions, 9 Nov 2026:
1. Art: no drawing of people (faces or figures) in any year (1 to 11), and no tasks in other subjects that have pupils
   draw or paint people (portraits, "draw yourself", comic strips, puppets with faces). Subjects are objects, plants,
   buildings, landscapes, pattern, geometry and calligraphy. Artists' work that shows people may be looked at; pupils do
   not reproduce the people. The Year 8 study of the hand (no face) is kept for now (owner to check).
2. PSHE Year 8 "types of relationships in Britain" and Year 9 "marriage, civil partnerships and same-sex relationships and
   the British law relating to them" are taught as law and citizenship: what British law says (Marriage Act, civil
   partnership, Equality Act 2010 protected characteristics), with the Islamic teaching on marriage taught alongside and
   respect for every person; no relationships or sex education content, no promotion, factual and age-appropriate.
   Puberty and bulugh are taught in Year 7 only, boys and girls separately.
3. Riba and interest: interest rates, loans, shares and compound interest are taught where the exam requires them
   (Business 4BS1, Maths 4MA1, KS3 maths) as knowledge of how the wider economy works, never as something to take.
   Wherever interest appears: "Islamic note: riba (رِبَا) is forbidden (Qur'an 2:275: Allah has permitted trade and
   forbidden riba). Islamic finance uses partnership (mushārakah, مُشَارَكَة) and cost-plus sale (murābaḥah, مُرَابَحَة)
   instead." The Year 9 Islamic Studies riba unit is unchanged.

## Weekly lessons (from the plan)

| | Y1-2 (30 min) | Y3-6 (45 min) | Y7-9 (50 min) | Y10-11 (50 min) |
| --- | --- | --- | --- | --- |
| Total | 15 | 20 | 23 | 23 |

Y1-2: English and phonics 5, maths 4, topic 2, Qur'an with Qaidah 3, Islamic Studies / PSHE 1 (alternate weeks).

## START HERE: handover (updated 9 Nov 2026, 17:30)
Read this first; the sections further down are history.

Live on main (merged and deployed): curriculum editor; syllabus v2 pages and pack; every subject aligned with the
school's own files (Islamic Studies, Arabic, History, Geography, English, Maths, Science, Business, Computing, Art, PSHE,
all primary subjects); owner decisions (no drawing people; PSHE relationships taught as law and citizenship; standard riba
note); founding-year calendar (induction 4 to 8 Jan, live lessons from Mon 11 Jan, 20 weeks); slide builder v3 (#56,
owner feedback: ponder hook, one objective, up to 3 criteria, pictures, polls, models, pupil PDF); lesson feedback and
on-slide editing in the portal (#59); Tafweed website batch, pupils pages, Action centre, AI fix, revision packs,
SENCo and SEND register, cover, security audit, policy outline, device requirement.

Lessons written to v3 for Spring 1 (11 Jan to 8 Feb 2027) and merged: Maths Y1-11, English Y1-11, Science Y3-11,
Islamic Studies Y1-11, Arabic Y3-11, Computing Y3-9, Art Y7-9, PSHE Y1-11.

Portal redesign (owner brief, 9 Nov 2026, evening): done first, before more lessons. PR #66 merged: design system,
navigation, dashboards, lesson workspaces, review workflow (migration 0192), curriculum map, search. The plan, rules and
what's left are in docs/portal-redesign.md; follow its design rules for every new page.

Next, in this order (each one agent; briefs in docs/agent-briefs/):
(10 Nov 2026, 06:00: running now on branches `lessons-humanities-s1`, `lessons-comp-art-pshe-s1`,
`lessons-quran-options-s1` (all of item 1 except Year 1-2 science, which sits in Topic) and `claude/tafweed-T19-polish`
(long forms in titled sections, redesign Next items 2, 3 and 5). If a session stops, resume from those branches.)
1. Spring 1 lessons still to write: Year 1-2 Topic and Year 1-2 science; History, Geography, Computing, Art and DT,
   PSHE (Y1-11); Qur'an (Y1-11); Business and Computer Science options (Y10-11). (English Y7-11, Islamic Studies
   Y1-11 and Arabic Y3-11 are done and merged.)
2. Then Spring 2, Summer 1, Summer 2 the same way, subject by subject.
3. Term resource lists (owner: "make those resources for everything"): for each term, list every resource the lessons
   name; mark which come from the school's files, which the builder makes (pupil PDF/worksheet), and write the rest
   (worksheets, revision sets, mock papers, printable graphs, knowledge organisers, writing frames) as printable PDFs
   uploaded to the portal and linked from the lessons. Start with Spring 1.
4. Consolidation pass (owner agreed): every old SOW, map and lesson marked keep / adapt / retire; retired lessons recorded in
   content/retired-lessons.json and moved to an "Archive - do not teach from" area; renumber lessons into teaching order.
5. Backlog docs/backlog/tafweed.md: T19 portal polish is folded into the redesign (docs/portal-redesign.md "Next"), T22 LADO (owner must say which local authority), T23 safeguarding mailbox (owner must create it in
   Microsoft 365). Prospectus PDF still needs the tablet-or-printer line (tools: the prospectus patch script approach in
   git history of public/prospectus).
6. Small fixes: arrows (→) in poll options render as dashes (branch `builder-arrows-fix` may exist); make the website use
   self-hosted fonts so builds don't fail when Google Fonts can't be reached.

Owner's open questions (waiting on them): Kitabi book per primary Arabic topic; which pupils sit Arabic 1AA0 and where they
take speaking; Khums framing in Islamic Studies; what the January Year 11 cohort has already covered; set-text suitability
lists in each pack's "To confirm"; whether teacher puppets are allowed; the Year 8 hand study in Art; Cornerstones and White
Rose logins (to check unit detail; credentials must never be written down anywhere).

Working rules that matter: the owner is not a developer, wants plain English, no clarifying questions, work actually
shipped (merge when checks pass, retry failures at once), small pushes, and this file kept current. Use GitHub REST via
`gh api` (GraphQL is blocked). Migrations: take the next free number on origin/main just before merging. Run at most
four or five agents at once (usage limits stop everything otherwise).

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
- Curriculum plans moved to the same opening (9 Nov 2026, branch `founding-year-11-jan`): docs/curriculum-packs/y2 to
  y11, the briefs and content/syllabus founding-year fields. Week of 4 Jan is induction week (baseline assessments, no
  live lessons); the maths and English bridge is 11 and 18 Jan; 20 live weeks (94 days). Spring 1 now has 5 live weeks,
  so each subject drops one Spring 1 week (its EXTENSION week, otherwise the least essential, named in each pack's
  "Founding year:" line); Spring 2 onwards is unchanged. The Claude Doc packs (links above) still show the old
  4 Jan start and need the same update.
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

### Lessons, slides and plans upgrade (owner request, 9 Nov 2026)
Stages: (1) builder v2 on branch `lesson-builder-v2` (answers + answer-reveal slides, timers, online routines,
hook slide, chart/numberline/fraction/diagram/sort blocks, Years 1-3 design, fuller lesson plan; backwards compatible;
portal editor + sync carry the new fields); (2) upgrade the existing 1,521 lessons subject by subject (answers, hooks,
routines, visuals) checked against house rules; (3) write the missing founding-year lessons from Mon 11 Jan in date
order, year by year, from docs/curriculum-packs; (4) syllabus pages/pack upgrade. Owner sees before/after slides
before any whole-school rebuild.
- 9 Nov 2026, branch `lessons-english-ks12-s1`: English Years 1-6, Spring 1 founding year (11 Jan to 8 Feb, bridge weeks
  included), 150 lessons to the v3 addendum (ponder hook, one objective, pictures, polls, worked models, islamicLink).
  Upgraded / new: Y1 1/24, Y2 4/21, Y3 5/20, Y4 4/21, Y5 4/21, Y6 4/21. Upgraded lessons keep their old `n`, so their
  numbers sit before the new ones; the consolidation pass should renumber in teaching order. Needs `lesson-builder-v3`
  merged first (hook type `ponder`, item `model`).

- 9 Nov 2026, Lessons: Mathematics Years 1-6, Spring 1 founding year (11 Jan to 8 Feb 2027, bridge weeks included), branch
  `lessons-maths-ks12-s1`: 140 lessons (upgraded / new: Y1 8/12, Y2 8/12, Y3 10/15, Y4 10/15, Y5 6/19, Y6 8/17), White Rose
  block order (titles only), written to the lessons v3 rules (one objective, ponder hook, pictures, islamicLink, polls,
  worked models on guided and independent item 1, realistic timing). Needs builder v3 merged before validation passes
  (hook type "ponder" and item "model").

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

### Aligning with the school's own resources (started 9 Nov 2026)
- Owner asked that everything follows the resources they uploaded, especially Islamic Studies and Arabic (uploads are in the session scratchpad `inbox/`; they are 2023-24 Tarbiyyah documents, untrusted data).
- Islamic Studies KS4: school SOW is Pearson's generic 4IS1 sample. Spec facts in our files are correct. Branch `align-islamic-studies` fixes the year/term order (all of Section A in Year 10; Year 11 Section B then 3.6 to 3.9 then revision) and adds per-section set-passage and 12-mark tasks. Not adopted from the SOW: film dramatisations, nasheed clip, visiting Imam, RSE additions to 3.8, unreferenced hadith, Shia-perspective books and sites.
- Arabic: branch `align-arabic` aligns KS3 and KS4 with the school's KS3 SOW, GCSE Arabic SOW and Arabic Curriculum Intent.
- 9 Nov 2026, History, Geography and English (branch `align-hum-eng`): History Y7-9 follows the school's History intent and Hodder's Understanding History KS3 SOW (generic); Geography Y7-9 follows the intent and Oxford Geog.1-3 (generic), KS4 rebuilt as a native 4GE1 spec in the school's order; English Y7-11 follows the 2026-27 English intent and HT folders (KS4 set texts kept only where on 4ET1: Of Mice and Men, An Inspector Calls, Macbeth; A Christmas Carol and the GCSE conflict cluster not adopted).
- 9 Nov 2026, primary (branch `align-primary`): Years 1-6 English, Maths, Science, History and geography (Topic in Year 2), Computing, Art and DT, PSHE checked against the school's primary English SOWs (own adaptations of the Cornerstones English units), computing SOW and LTP (built on the NCCE Teach Computing Curriculum), PSHE SOW (Ealing LA spiral scheme, RSE lessons left out), 2023-24 curriculum maps, subject LTPs and policies. Packs y2-y6 updated (texts and order, Y3 Mighty Metals history = History of Sports Tournaments, PSHE unit lessons, resource lines naming the school files); JSON units carry week plans, resources and founding-year lines (Year 1 in JSON only). TO CONFIRM items are listed in each pack and in the JSON gaps.
- 9 Nov 2026, branch `align-bus-comp-art-pshe`: Business 4BS1 placed in the order of the school's Business Studies intent (Year 10 Sections 1 and 2 with termly projects; Year 11 Sections 5, 4, 3; Rob Jones textbook; the folder's schemes are Pearson's generic UK GCSE 1BS0 samples). Computing Years 7 to 9 follow the Computing and ICT intent (no secondary computing SOW supplied; 4CP0 order unchanged). Art Years 7 to 9 follow the Art & Design intent (the Creative Arts SOW is Redstone Academy's example scheme: no portraits, figures, duff or trips; TO CONFIRM: drawing animate beings). PSHE Years 7 to 11 follow the PSHE intent, with the generic PSHE Association toolkit used only where it fits (no RSE).
- Maths and Science (9 Nov 2026), branch `align-maths-sci`: the school's files are generic publisher schemes (Pearson KS3 Maths Progress, Pearson 4MA1 two-year scheme, an older Edexcel linear "in steps" scheme, a 1MA1 resit scheme; Pearson Exploring Science and Edexcel GCSE five-year schemes; Oxford Activate/AQA five-year schemes) plus the school's Mathematics, Biology, Chemistry and Physics intents. Maths Years 7 to 9 keep White Rose order with Maths Progress lessons as resources; KS4 maths is now taught from 4MA1 itself (was 1MA1 with a 4MA1 entry) in the Pearson scheme's Higher order (Units 1 to 32); science Years 7 to 9 follow the Exploring Science units in the intents' order; 4SD0 order follows the KS4 intents and off-spec content (separate-science only or not in 4SD0) was removed from the Year 10 weeks.
- Next: the same pass for the other secondary SOWs (History, Geography, Maths, Science, Business, Computing, Art, PSHE) and the primary subject policies.
- Syllabus v2 (PR #31) merged 9 Nov. Builder v2 (PR #30) approved by the owner; merging after the review fixes (slide-block editor key bug, save guard, revision-booklet triggers, delete replaced deck files). Year 3 keeps the friendly style.

### Lessons v3: owner's design feedback (9 Nov 2026, 12:39)
Full rules: one high-level objective; up to 3 success criteria kept distinct from it; a "ponder" hook as the first screen;
real pictures of the topic and key vocabulary (no people); diagrams; topic keyword list plus corner keyword boxes; pupil PDF of
everything at the start; Bismillah only where relevant; an "online class promise" values strip; Islamic point as the
foundation at the start (conflicting theories such as human evolution: taught factually, Islamic position at the end);
Teams polls instead of cold calls; teacher models guided item 1 (with a labelled model paragraph) and independent item 1;
realistic timings; one accurate cross-curricular link, not several. Spec for lesson writers: the session scratchpad
`packs/LESSONS-V3-ADDENDUM.md` (copied into content/lessons/README.md by the builder v3 PR, branch `lesson-builder-v3`).
Also asked for (backlog): staff feedback on lessons with admin "make the change" (T-item), editing slides and plans
directly in the portal with instant download (T-item), a per-term list of every worksheet and resource with all of them
ready, and a device requirement (drawing tablet recommended; otherwise a printer) on the website and in the admissions
information.

### Lessons status
- 10 Nov 2026, Computing Y3-9, Art Y7-9 and PSHE Y1-11 Spring 1 (branch `lessons-comp-art-pshe-s1`): 99 lessons for 11 Jan to 8 Feb 2027, v3 rules (ponder, one objective, Teams polls, I do models, pictures, islamicLink where Islam speaks to the topic), 0 problems and no warnings. Upgraded / new: Computing Y3 3/2, Y4 0/5, Y5 0/5, Y6 1/4, Y7 0/5, Y8 1/4, Y9 0/5 (free browser tools: Scratch, MakeCode micro:bit simulator, diagrams.net, CircuitVerse; no sound blocks; object sprites only); Art Y7 0/5 (still life), Y8 0/5 (abstract, analogous colour, Islamic pattern and Hundertwasser), Y9 0/5 (optical illusion), objects, plants, geometry only; PSHE Y1 0/2 and Y2 0/2 (alternate weeks 18 Jan and 1 Feb), Y3 2/3, Y4 0/5, Y5 1/4, Y6 0/5 (riba note), Y7 1/4 (no puberty this half term), Y8 2/3, Y9 2/3, Y10 2/3 (Autumn 1 and 2 core weeks, then gambling, substances, online exploitation), Y11 2/3 (pathways, CPR, choking and bleeding, exam planning, mock-week wellbeing). Retrieval starters avoid Autumn units not taught in the founding year. TO CONFIRM: Scratch Teacher Account and CircuitVerse accounts through the school; a recognised first aid syllabus; Pearson 4CP0 data-unit convention (1000 or 1024); the PSHE Y4 syllabus `foundingYear` line was copied from Islamic Studies and needs correcting.
- 9 Nov 2026, English Years 7-11 Spring 1 (branch `lessons-english-ks34-s1`): 130 lessons for 11 Jan to 8 Feb 2027 (bridge weeks included), v3 rules. Upgraded / new: Y7 5/15; Y8 0/20; Y9 0/20; Y10 Language (4EB1) 3/12, Literature (4ET1) 0/10; Y11 Language (4EB1) 0/15 (revision cycle 1: Section A language and structure, writers' perspectives, Section B directed writing, Section C, then mock week), Literature (4ET1) 0/10 (anthology poems 1 to 16, unseen poetry, Of Mice and Men, then the Component 2 mock week). Y11 marks and AO splits checked against Pearson 4EB1 mark schemes; source texts and unseen poems are teacher-written originals. Also: the deck builder now keeps line breaks in quote blocks, so poems show their lines and stanzas. TO CONFIRM: which set texts each founding-year Year 11 pupil has studied.
- 9 Nov 2026, Maths Years 7-11 Spring 1 (branch `lessons-maths-ks34-s1`): 100 lessons for 11 Jan to 8 Feb 2027 (bridge + Spring 1), v3 rules applied. Y7 4 upgraded, 16 new; Y8 20 new; Y9 5 upgraded, 15 new; Y10 12 upgraded, 8 new (4MA1); Y11 20 new (revision cycle 1 and mock week, 4MA1). Y10 and Y11 files now labelled 4MA1 (taught and examined). Uses v3 fields (ponder hook, item `model`, `pictures`, `islamicLink`), so validation passes only once `lesson-builder-v3` merges.
- 9 Nov 2026, Science Years 3-11 Spring 1 (branch `lessons-science-s1`): 130 lessons for 11 Jan to 8 Feb 2027, v3 rules (ponder, one objective, Teams polls, I do models, pictures, Islamic foundation where Islam speaks to the topic), home practicals with written safety guides. Y3 10 new; Y4 4 upgraded, 6 new; Y5 10 new; Y6 10 new; Y7 15 new; Y8 7 upgraded, 8 new; Y9 6 upgraded, 9 new; Y10 (4SD0) 20 upgraded (bridge weeks + S1 w1 to w3), 5 new; Y11 (4SD0) 20 new revision lessons with own exam-style questions (mock week of 8 Feb not written as lessons). Y9 lessons 11 (composites) and 14 (LCA) are independent reading.
- 9 Nov 2026, Islamic Studies Years 1-11 Spring 1 (branch `lessons-is-arabic-s1`): 74 lessons for 11 Jan to 8 Feb 2027 (bridge weeks included), v3 rules (ponder, one objective, Teams polls, I do models, pictures, islamicLink, set passages and 12-mark practice at KS4). Upgraded / new: Y1-2 3/3; Y3 3/2; Y4 4/1; Y5 3/2; Y6 1/4; Y7 3/7 (hadith and the Sunnah, unit quiz); Y8 8/2 (iman and the road to Madinah, zakah, unit quiz; week 5 sources of Shari'ah not timetabled); Y9 3/7 (Hudaybiyyah, conquest of Makkah, leadership, sawm); Y10 (4IS1) 5/5 (bridge 1.1 to 1.4, then 1.5 and 1.6 with a 12-mark lesson); Y11 (4IS1) 0/8 (fast-teach of Section B and 3.6 to 3.9 with portal lessons 8 to 34 as independent study; mock week of 8 Feb not written as lessons). Hadith cited only from Bukhari and Muslim or named collections without numbers; seerah-only reports are labelled as such; Shia content taught factually. TO CONFIRM: approved seerah and hadith texts; approved resources for Shia content; what the January Year 11 cohort has already covered.
- 9 Nov 2026, Arabic Years 3-11 Spring 1 (branch `lessons-arabic-s1`): 70 lessons for 11 Jan to 8 Feb 2027 (bridge weeks included), v3 rules (ponder, one objective, Teams polls, I do models, pictures, islamicLink, Bismillah in starters). Upgraded / new: Y3 2/3; Y4 2/3; Y5 2/3; Y6 1/4 (one lesson a week); Y7 2/8 (bridge letters, vowels, greetings, days and months; numbers, colours, clothes, dictation and unit quiz); Y8 0/10 (bridge basics and About me; family, possessives, demonstratives, comparative, family paragraph and quiz); Y9 3/7 (bridge describing people, participles, town, weather; subjects, opinions, connectives, three tenses, informal email and quiz); Y10 7/3 (A1 and A2 core bridge, then 2.3 town and region, directions with the imperative, problems of my town, weather and unit quiz; Group A 4AA1 i'rab and summary tasks beside Group B 1AA0 speaking); Y11 3/7 (revision in theme order, 4AA1 summary and i'rab, 1AA0 conversation, role play and picture task, extended writing, mock week technique and review). Transliteration follows the syllabus style (hadha, ismi, 'id al-fitr). Kitabi readings for Years 4 and 6 (Basem in the village, the dialogues, the heater) are our own short texts until the Kitabi pages are checked; all KS4 texts are our own exam-style texts. TO CONFIRM: an Arabic specialist checks vowelling before delivery; Kitabi page references (CHECK IN KITABI); 4AA1 summary word limits against the current specification.

