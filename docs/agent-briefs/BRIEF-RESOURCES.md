# Brief: term resources (make every resource the lessons name)

Owner, Nov 2026: "make those resources for everything". Every resource a lesson names must exist, be ready,
and be linked from the lesson; staff see a list of all resources per term. Read `AGENTS.md`, the
"START HERE" and "Term resources" sections of `docs/curriculum-rebuild.md`, `content/lessons/README.md`,
`BRIEF-LESSONS.md` and `LESSONS-V3-ADDENDUM.md` (their house rules apply to every resource), and follow
`BRIEF-TAFWEED.md` for git and PRs (REST via `gh api`, GraphQL is blocked; merge when checks pass).

## How it fits together

| Piece | File | What it does |
| --- | --- | --- |
| Register | `scripts/resources/register.mjs` | Reads every lesson's `resources` (and `homework` lines that name a sheet, set or quiz) and writes `content/resources/<term>.json` (spring-1, spring-2, summer-1, summer-2; the term comes from the lesson's unit). One entry per resource: id, title, type, subject, year, units, lessons, source, status, the lesson's wording. Deduplicated per subject and year; generic titles ("Knowledge organiser", "Own 4GE1-style exam questions") are split by unit or lesson. |
| Classifier | `scripts/resources/lib.mjs` (`classify`, `makeType`) | Type and source from the wording. Sources: `school` (named school file), `builder` (slides or the pupil PDF the deck builder makes), `external` (publisher, exam board, online or portal tool), `household` (pupil's own kit), `generated` (TGA makes it: the "TO MAKE" list). Fix a wrong one with `content/resources/overrides.json`: `{ "<id>": { "type"?, "source"?, "title"?, "skip"? } }`, or tighten the rules. |
| Items | `content/resources/items/<subject>/<year>/<id>.json` | The content of each resource TGA makes (questions, answers, marks, texts, frames, grids). Written by hand or drafted by the seeder, then improved by hand. |
| Seeder | `scripts/resources/seed.mjs --term=<t> --subject=<s>` | Drafts items from the lessons that use them (their questions and answers, key words, models, quotes, tables, sorts; grids from the name). Never overwrites an item unless `--overwrite`. |
| Generator | `scripts/resources/build.mjs`, `render.mjs`, `grids.mjs`, `render-docx.mjs` | Item to branded A4 PDF (Chromium via Playwright), a separate staff-only mark scheme PDF when the item has answers, and a Word copy for tests, mocks, quizzes, question sets and writing frames. |
| Checks | `scripts/resources/validate.mjs` | Item shape, marks on every test or mock question, answers for the mark scheme, lessons exist, no em dashes, no placeholders, British spelling. |
| Upload | `scripts/resources/upload.mjs`, workflow "Build term resources" | On merge to main: refreshes the registers, builds only items whose content or generator changed, uploads to the private `lesson-decks` bucket under `resources/<subject>/<year>/`, and writes table `curriculum_resources` (migration 0201, staff read only). |
| Portal | `src/components/learn/curriculum/TermResources.tsx`, `src/lib/learn/resources.ts` | Curriculum > Resources (staff): each term's list with filters (subject, year, type, status) and preview, download (PDF, mark scheme, Word) and Share to a class. Each lesson's workspace has "Resources this lesson uses". Pupils only get a resource a teacher shares (Classwork, `class_materials`). |

## Item format

```json
{
  "id": "mathematics-y11-...", "title": "...", "type": "revision set",
  "subject": "Mathematics", "subjectSlug": "mathematics", "year": "y11", "board": "Edexcel IGCSE 4MA1",
  "unit": "Spring 1: ...", "lessons": [71], "intro": "Instructions for pupils", "time": "30 minutes",
  "name": false,
  "blocks": [ ... ],
  "markScheme": [{ "q": "Question 5 (levels)", "a": "Level 3 (5-6 marks): ...", "marks": 6 }]
}
```

`id`, `subjectSlug` and `year` must match the register entry and the file path. `name: false` drops the name line
(organisers, printables). Blocks (one key each): `h` (section heading, optional `sub`), `text`, `bullets`,
`questions` (list of `{ q, a, marks?, options?, model?, lines?, space?: "box", height?, parts?: [{q,a,marks}],
grid?, picture? }`), `keywords` (`[{term, def}]`, `blank: true` to leave definitions for pupils), `panels`
(`[{title, points?|text?|arabic?}]`, `cols` 1-3), `table` (`{head, rows, blankRows?, tall?}`), `frame`
(`[{label, prompt?, starters?, lines?}]`), `starters` (word bank or sentence starters, `title`), `arabic`
(`{text, ref?, translation?, spaced?, quran?, size?}`: Qur'an and Arabic text exactly as in the lesson), `grid`
(`{kind: squared|dot|isometric|graph|numberline|hundred|times|placevalue|fractionwall|tenframe|clock|barchart|periodic, ...}`,
see `grids.mjs`), `cards` (cut-out cards, `answer` for the mark scheme), `picture` (`{find|file, alt, labels?, draw?}`:
a Wikimedia Commons picture, chosen as for lessons; a dashed drawing box if none), `practical` (`{aim, equipment,
safety, method, adult?}`), `passage` (`{title, paras, byline?, source?}`), `model` (`{title?, parts: [{label?, text}]}`),
`box` (`{title, lines?|height?}`), `timeline`, `checklist`, `tracker` (`{cols, rows, corner?}`), `note` (teacher
note, mark scheme only), `answers` (mark scheme only), `pagebreak`.

Rules: questions and answers come from the lesson wherever it fixes them (answers must match the lesson); work
every maths answer; own exam-style questions only (never copy past papers); Arabic and Qur'an text exactly as in
the lesson; no pictures of people or faces; British spelling, no em dashes; tests and mocks have marks on every
question and an answer for every question.

## How to continue (Spring 2, Summer 1, Summer 2)

1. `git fetch origin && git checkout -b claude/resources-<term>-<subjects> origin/main`.
2. `node scripts/resources/register.mjs` (refreshes the registers from the current lessons) and
   `node scripts/resources/register.mjs --report=<term>` (counts; the "generated" ones are the TO MAKE list).
3. Check the term's generated entries for one subject (`content/resources/<term>.json`, `"source":"generated"`):
   wrong type or source? Fix with `content/resources/overrides.json` or a rule in `lib.mjs`.
4. `node scripts/resources/seed.mjs --term=<term> --subject=<a>,<b>` drafts the items.
5. Improve the drafts by hand where the lesson gave too little (a homework "set (8 questions)" needs 8 new
   questions with worked answers; a mock needs a full paper; a reading text needs the full text; a labelling
   sheet needs the right diagram).
6. `node scripts/resources/validate.mjs` (0 problems), then build and look at 3 PDFs per subject as PNGs:
   `NODE_PATH=<dir with playwright and docx> node scripts/resources/build.mjs <scratch>/out --only=<subject>`
   and `pdftoppm -r 50 -png <file>.pdf <scratch>/p`. Delete the previews afterwards (disk is limited).
7. `node scripts/resources/register.mjs` again (status becomes "made"), commit, PR (2-3 subjects a PR), merge when
   green. Add a dated line to `docs/curriculum-rebuild.md` ("Term resources").
