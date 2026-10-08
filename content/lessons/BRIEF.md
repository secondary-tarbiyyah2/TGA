# Brief for lesson-content authors (Tarbiyyah Global Academy)

TGA is an online British Islamic school (Reception to Year 11), live lessons on Teams, classes of max 15.
Lesson lengths: KS1 30 min, KS2 45 min, KS3/KS4 50 min. Format: see README.md in this folder (read it first).

## Scope: Phase 1 = the FIRST FOUR TEACHING WEEKS (Mon 2 Nov – Fri 27 Nov 2026), term start is 3 Nov.
So every year group starts a fresh Autumn-style sequence at its natural beginning-of-year point
for that subject (for Y11/Y10 GCSE the pupils are mid-course: begin at a sensible next topic of the
two-year spec for the stated board). Number lessons `n` sequentially from 1 across the four weeks and
group them in coherent `unit`s. Lessons per subject per year are given in your assignment.

## Exam boards
Default board = Pearson Edexcel for everything at KS4 (and align KS3 to it).
EXCEPTIONS: science (Combined Trilogy / Separate Biology, Chemistry, Physics) and English Language /
English Literature are AQA. Geography KS4 follows the AQA GCSE (9-1) spec because the school's Drive
already holds AQA geography resources. Before you write, use the Google Drive tools (read-only) to look
at the school's existing material for your subject and USE/ADAPT it where it exists:
- Curriculum root folder id 11Ulz_0VnIyutyfwyZyzkLDvhV_mPDX1v (subject folders: Maths 16QvajU4FDc87XQ4mtHVeKleI9VmmGZUq,
  English 1qIIXiK-5fem6YC7pP2jCgUFy-MWdIsiV, Science 18M7VkKvAs4NLuzjNftfh16ZCNtWfp6My, History 160tCly_N-uMh2GunL3t6LwHTRGx1hMno,
  Geography 1Udr1WHn3BK2Bs4FF_jpYu9kdpTtNGlfY, Computer Science 1FBHG5cIlX1-kKABvOJ2Y-TdIsOJyGCOe, Arabic 1WdNGwSU4q44BIpW982DMKmAs-1Cn4d1J,
  Quran 1hiHAvMe_90M32TNOfXZNGSPy6ipwm1ua, RE 1e13-yTXaLZgHp3NvYgZ_e-oHs8IVHrbj, PSHE 1cYRmGemiDF7GfEeOhCb1zpnlxqVF5ksw,
  Art & Design 1mCVCT-ubPcUnCqqwuroO7kSdTVUE0zVg, PE 1LSBhZVGi3P5Pdh51O2pzrffSJj77cgZH, Business Studies 1GrabzZcr0H82XYUtqwYezywaJKEIlHFI)
- Schemes of work folder 1-R1OVBf7dHRegT6oicCbByMpZTAijAYz (per-subject folders; also "Oak National" 1FcCWuBxQb2FqXIaaknKtJGvTc9uzA7KM)
- Lesson plan examples folder 1itUcJNfzq5zJ62kUX4N1cs6pbOGCI33R
- Curriculum policy doc id 1exDql1D7y-nGYrH0414KrpCItuW63OWVH0Lf3kokW04
Spend modest effort there (a handful of searches/reads); do not stall if a folder is empty — fall back to the
National Curriculum / the board's specification from your own knowledge.
Record in each file a top-level `"source"` string: which Drive material was adapted, or "National Curriculum"/"Edexcel spec".

## Quality bar
Professional, teachable-as-is lessons. Accurate subject knowledge. Worked examples with real numbers/text.
Each lesson follows: retrieval starter → short explanation (4-6 teach slides) → guided practice →
independent practice → exit ticket → homework. Include a teacher `note` on every teach slide (what to say, what to
ask, likely misconceptions). Keep bullets short (they go on slides). Keep JSON valid (no trailing commas, no comments).
Islamic ethos: begin lessons naturally with bismillah/adab where fitting; never invent hadith, ayat or scholarly
quotes — only include Qur'an/hadith references you are certain are authentic and cite them plainly.

## Process
1. Write one JSON file per year group at `content/lessons/<subject-slug>/<year>.json` (create folders).
2. Run `bun scripts/lessons/validate.mjs` and fix any problems it reports for YOUR files.
3. Do NOT run git commands. Do not edit any other files. Write files incrementally (per year) so progress survives.
4. Final reply: one short line per file: path, lesson count, source.
