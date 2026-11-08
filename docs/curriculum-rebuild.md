# Curriculum rebuild (November 2026): handover notes

Keep this file current. Anyone (person or AI) picking up the curriculum work starts here.

## Source of truth

- **TGA Curriculum Plan 2027** (Claude Doc, owner: the TGA lead): https://claude.ai/artifact/2WAihVvg7Jg9LWz2d99ha1
  Whole-school plan: principles, weekly lessons per key stage, Years 1-11 long-term plans, Qur'an/Arabic/Islamic
  Studies spine (hifdh targets), assessment, founding term (Jan-Jul 2027), decisions awaiting Headteacher sign-off.
- **Year packs** (one Claude Doc per year group, built in order from Year 1): everything a teacher needs for the year,
  week by week, per subject. Year 1 is the first (see "Status" below for the link).
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

### In progress
- Year 1 pack and Year 1 syllabus entries (content/syllabus/ks1-3/*.json, yearMap.y1).

### Next
1. Year 1 lessons for the founding year: bridge (11-22 Jan) + Spring 1 (Moon Zoom!), then Spring 2 to Summer 2.
   Existing content/lessons/*/y1.json lessons were written for an Autumn start: keep what fits, re-point the rest.
2. Year 2 pack, then Years 3-6, then 7-11 (from the TSS booklet).
3. After Headteacher sign-off of the plan: update policy 12 (Curriculum) text in the portal (it lives in
   policy_links.body_md; editing it asks staff to re-sign) so its KS1 table matches the new weekly lessons.
4. Retire Arabic Year 2 lessons the same way when the Year 2 pack is built.
