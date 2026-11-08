# Curriculum rebuild (November 2026): handover notes

Keep this file current. Anyone (person or AI) picking up the curriculum work starts here.

## Source of truth

- **TGA Curriculum Plan 2027** (Claude Doc, owner: the TGA lead): https://claude.ai/artifact/2WAihVvg7Jg9LWz2d99ha1
  Whole-school plan: principles, weekly lessons per key stage, Years 1-11 long-term plans, Qur'an/Arabic/Islamic
  Studies spine (hifdh targets), assessment, founding term (1 Jan-9 Jul 2027), decisions awaiting Headteacher sign-off.
- **Year packs** (one Claude Doc per year group, built in order from Year 1): everything a teacher needs for the year,
  week by week, per subject, plus a dated week-by-week plan for the founding year (first live lessons Mon 4 Jan to 9 Jul 2027).
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
  - Years 10 and 11: docs being created (sources in docs/curriculum-packs/).
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
- Opening moved (owner, 8 Nov 2026): induction day Fri 1 Jan 2027, first live lessons Mon 4 Jan (99 teaching days),
  first fee payment 1 Jan. Code, policies, term-dates.ics, prospectus PDF and migration 0178 updated.
- Secondary curriculum maps (Years 7-11, xlsx from the TSS drive) cleaned of trips/visits/speakers and the
  "Redstone Academy" heading; sent to the owner (not stored in the repo).

### In progress
- In-portal curriculum editor: branch `curriculum-editor` (helper agent), PR not yet open. Migrations from 0179.

### Next
0. Optional: add content/syllabus/ks1-3/design-technology.json (KS1-3 DT statements from gov.uk) so DT is its own
   subject in the portal; for now DT units sit inside art.json.
1. Year 1 lessons for the founding year: bridge (4-15 Jan) + Spring 1 (Moon Zoom!), then Spring 2 to Summer 2.
   Existing content/lessons/*/y1.json lessons were written for an Autumn start: keep what fits, re-point the rest.
2. Year 2-11 packs (breadth first: year on one page, founding-year week-by-week, Spring 1-Summer 2 weekly per subject):
   being drafted (8 Nov) from briefs kept in the session scratchpad; each becomes a Claude Doc like Year 1. Not yet linked here.
   Cornerstones/White Rose detail still to be checked in Maestro (owner to give access; logins were not kept). Then the one-pass consolidation the owner
   agreed (8 Nov): every old SOW/map marked keep, adapt or retire; retired ones to an "Archive - do not teach from" folder.
3. After Headteacher sign-off of the plan: update policy 12 (Curriculum) text in the portal (it lives in
   policy_links.body_md; editing it asks staff to re-sign) so its KS1 table matches the new weekly lessons.
4. Retire Arabic Year 2 lessons the same way when the Year 2 pack is built.
