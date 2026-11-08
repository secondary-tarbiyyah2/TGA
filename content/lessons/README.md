# Lesson content format

One JSON file per subject + year group: `content/lessons/<subject-slug>/<year>.json`
(`year` is `reception`, `y1` ... `y11`). Each file is an object:

```json
{
  "subject": "Mathematics",
  "year": "y10",
  "board": "Pearson Edexcel GCSE (9-1) Mathematics (1MA1), Higher tier",
  "boardShort": "Edexcel GCSE 1MA1 Higher",
  "exam": "Pearson Edexcel International GCSE (9-1) Mathematics A (4MA1), Higher tier",
  "examShort": "Edexcel IGCSE 4MA1",
  "source": "Which school material was adapted",
  "lessons": [ { ...lesson... } ]
}
```

`board` is the specification the lessons are taught from (KS4: the portal spec in `content/syllabus/ks4`).
`boardShort` is optional: it goes on the title slide, where the full name is too long.
`exam` / `examShort` are set only when pupils sit a different qualification from the one taught (the spec's
`examEntry`, e.g. taught from GCSE 1MA1, entered for International GCSE 4MA1); decks then show the exam.

To retire a lesson, remove it from its file and add `{ "subject_slug", "year", "lesson_no", "title", "reason" }` to
`content/retired-lessons.json` (see its `note`). Retired lesson numbers are never reused.

## Lesson

```json
{
  "unit": "Unit 1: Number and proportion",
  "n": 1,
  "title": "Ratio and sharing in a ratio",
  "duration": 50,
  "bigQuestion": "How can two people share fairly when they did not put in the same amount?",
  "objectives": ["Simplify a ratio", "Share an amount in a given ratio"],
  "successCriteria": ["All: simplify a ratio", "Most: share in a ratio", "Some: solve ratio problems given a difference"],
  "crossCurricular": "Business: sharing profit between partners",
  "smsc": "Moral: fairness and justice ('adl) in sharing",
  "keywords": [{ "term": "ratio", "def": "compares the size of two or more quantities" }],
  "starter": ["Retrieval question 1", "Retrieval question 2", "Retrieval question 3"],
  "teach": [
    { "heading": "Slide heading", "bullets": ["short point", "short point"], "note": "teacher script / what to say and ask" }
  ],
  "practice": ["Guided question 1", "Guided question 2"],
  "independent": ["Core task", "Extend task", "Stretch task"],
  "exit": ["Exit ticket question 1", "Exit ticket question 2"],
  "homework": "One sentence of homework",
  "send": "One line: adaptation for SEND / EAL / stretch for most able"
}
```

`bigQuestion`, `successCriteria` (all / most / some, in that order), `crossCurricular`
and `smsc` are optional but expected in secondary lessons: they follow the school's
planning format (INSET "Lesson Planning"). The big question gets its own slide and
returns on the exit ticket so the plenary evidences progress.

## Teach slide blocks

A teach slide can carry **one** block, which gets its own layout. Bullets are then
optional and shown beside or under the block. Use them: a lesson where every slide
is plain bullets is the thing to avoid. Aim for at least one `model` (I do) and one
`check` (hinge question) in every secondary lesson, as the school's "10 steps for
every lesson" asks for models and checks of all pupils' understanding.

| Block | Shape | Use for |
| --- | --- | --- |
| `model` | `{ "problem": "...", "steps": ["2-6 steps"], "answer": "..." }` | Worked example, I do |
| `check` | `{ "q": "...", "options": ["3-4 options"], "answer": 0, "why": "..." }` | Hinge question on mini-whiteboards; answer goes to the notes only |
| `misconception` | `{ "wrong": "...", "right": "..." }` | A common error set against the correct version |
| `quote` | `{ "text": "...", "source": "..." }` | Text extract, source, ayah or hadith (authentic, cited) to annotate |
| `compare` | `{ "left": {"title","points":[]}, "right": {...}, "label": "vs" }` | Two things side by side |
| `timeline` | `[{ "label": "1929", "text": "..." }]` (3-6) | Dated or ordered events |
| `table` | `{ "head": [...], "rows": [[...]] }` (1-8 rows) | Small data or comparison table |
| `code` | `{ "lang": "python", "text": "lines\\nlines", "output": "..." }` | Programs to trace (max 16 lines) |
| `cycle` | `["step", "step", "step"]` (3-6) | Repeating processes |

Rules: 3-7 `teach` slides, each with 2-5 bullets of at most 14 words; real, accurate,
age-appropriate content only; British spelling; Islamic ethos woven in where natural
(bismillah starter, adab) and never contradicting Islamic belief; no invented facts,
hadith or quotations. Questions must have concrete content (real numbers, real
sentences), not placeholders.

`node scripts/lessons/validate.mjs` checks all of this. To preview decks from a
scratch folder: `LESSONS_DIR=path node scripts/lessons/build-decks.mjs out/preview`.

## Edited in the portal

Each lesson is also held in the portal (`curriculum_lessons.content`, migration 0179), where staff edit it with
**Edit lesson** in the Lesson library. The portal is the source of truth: the workflow "Sync curriculum from the
portal" (`scripts/curriculum/sync.mjs`) writes edited lessons back into these files (only the edited lesson objects
change) and starts "Build lesson decks", which rebuilds the slides and plan of any lesson whose content changed (as a
new version; a teacher's uploaded deck is kept). Editing a file here still works and is copied into the portal, unless
the same lesson was also edited in the portal since the last sync (then the portal version wins). Add new lessons
and retire lessons here, as before. See docs/curriculum-editing.md.
