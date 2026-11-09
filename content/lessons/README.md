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

`duration` defaults to 30 minutes in Years 1-2, 45 in Years 3-6 and 50 in Years 7-11.

## Answers, timers, routines, hook and resources (all optional)

Old lessons need none of this: plain strings build exactly as before.

**Answers and minutes.** Every item of `starter`, `practice`, `independent` and `exit` may be a
string or an object:

```json
"starter": [
  "A question with no answer recorded",
  { "q": "What is 23 − 8?", "a": "15", "mins": 1 }
]
```

| Key | Type | Rules |
| --- | --- | --- |
| `q` | string | required: the question or task, as it appears on the slide |
| `a` | string | optional: the answer (or a model answer: "For example: …") |
| `mins` | whole number 1-30 | optional: minutes for this item |

When any item in a section has an `a`, a **"Check your answers"** slide (ticks, for pupils to
self-mark) follows the do now, guided practice and independent practice. Exit ticket answers go
on a **teacher-only slide after the last slide** (so they are never shown by accident). All
answers, with the worked examples, hinge answers and card-sort answers, form the **answer key**
in the lesson plan.

**Timers.** Task slides (do now, guided, independent, exit) show a timer badge: the items'
`mins` added up, or the default for the phase: do now 5, guided 8, independent 12, exit 5 in a
50-minute lesson, scaled to the lesson length (30 min: 3, 5, 7, 3; 45 min: 5, 7, 11, 5). The
plan's timed run-through uses the same minutes.

**Routines** for live Teams lessons, shown as a small icon badge on the slide, with what pupils
do in the speaker notes and the plan:

| Id | Badge | What pupils do |
| --- | --- | --- |
| `show-me` | Show me | write on the mini-whiteboard, hold it up to the camera on 3 |
| `chat-waterfall` | Chat waterfall | type in the chat, everyone presses enter together on "go" |
| `teams-poll` | Teams poll | answer a Teams poll; results shared |
| `cold-call` | Cold call | everyone thinks, the teacher names who answers |
| `think-pair-share` | Think, pair, share | think alone, talk in a breakout pair, share |
| `hands-down` | Hands down | no hands up; the teacher chooses who shares |

```json
"routines": { "starter": "show-me", "hinge": "teams-poll", "practice": "cold-call", "exit": "chat-waterfall" }
```

Sections: `hook`, `starter`, `teach` (every teach slide), `hinge` (slides with a `check`
block), `practice`, `independent`, `exit`. A teach slide may also set its own `"routine": "…"`.
Defaults when not set: starter `show-me`, hinge `show-me`, practice `cold-call`, exit
`chat-waterfall`, hook `chat-waterfall` (`show-me` for a puzzle or odd-one-out), others none.

**Hook.** A striking full-screen slide straight after the title, before the lesson map, to grab
attention in the first minute:

```json
"hook": { "type": "odd-one-out", "text": "Each describes 3, 5, 5, 8, 9. Which is the odd one out?", "options": ["5 (the mode)", "5 (the median)", "6 (the range)", "6 (the mean)"], "a": "The range: it is a spread, not an average." }
```

`type` is `question`, `image-prompt` (a scene for pupils to picture: no pictures are used),
`story`, `puzzle` or `odd-one-out`; `text` at most 240 characters; `options` 2-5 short lines
(3-5 for odd-one-out); `a` (optional) is what to draw out, in the notes and plan only.

**Resources.** `"resources": ["Slides", "Mini-whiteboard and pen", "Dice"]` (1-10 lines) for the
plan. Left out, the plan lists slides, mini-whiteboard and pen, exercise book.

**Lesson plan.** One A4 plan per lesson (Word and PDF): header, objectives and success
criteria, prior learning and next lesson (from the neighbouring lessons in the file), resources,
a timed run-through with routines and teacher actions, key questions and the hinge (what each
wrong answer reveals, from the check's `why`), misconceptions, the answer key, adaptations
(from `send`: label parts "SEND:", "EAL:", "Support:", "Stretch:"), assessment for learning,
and an "after the lesson" box.

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
| `chart` | `{ "kind": "bar" \| "line" \| "pie", "title"?: "...", "labels": ["2-8"], "values": [numbers, one per label], "unit"?: "..." }` | A real PowerPoint chart (editable); pie values 0 or more |
| `numberline` | `{ "min": 0, "max": 10, "step": 1, "marks"?: [{ "at": 3, "label"?: "Start" }] }` | Number lines; (max − min) / step a whole number up to 20; up to 6 marks |
| `fraction` | `{ "parts": 4, "shaded": 3, "label"?: "3/4" }` or a list of 1-4 of these | Fraction bars (parts 1-24), e.g. equivalent fractions |
| `diagram` | `{ "centre": "...", "items": ["3-8"] }` | Spider diagram / concept map |
| `sort` | `{ "columns": ["2-4"], "cards": ["4-12"], "answer"?: [column index per card] }` | Card sort: lettered cards, numbered columns; the answer goes in the notes and plan |

Teach slides may also carry `"routine": "show-me"` (see Routines above). Years 1-3 get the
friendlier deck design (bigger type, rounder shapes, a star collected at each stage of the
"mission"); Years 4-6 the primary design; Years 7-11 the secondary design.

Rules: 3-7 `teach` slides, each with 2-5 bullets of at most 14 words; real, accurate,
age-appropriate content only; British spelling; Islamic ethos woven in where natural
(bismillah starter, adab) and never contradicting Islamic belief; no invented facts,
hadith or quotations. Questions must have concrete content (real numbers, real
sentences), not placeholders.

`node scripts/lessons/validate.mjs` checks all of this (the shapes and limits live in
`src/lib/learn/lessonSchema.mjs`, shared with the portal editor and the curriculum sync). To preview decks from a
scratch folder: `LESSONS_DIR=path node scripts/lessons/build-decks.mjs out/preview`.

## Edited in the portal

Each lesson is also held in the portal (`curriculum_lessons.content`, migration 0179), where staff edit it with
**Edit lesson** in the Lesson library. The portal is the source of truth: the workflow "Sync curriculum from the
portal" (`scripts/curriculum/sync.mjs`) writes edited lessons back into these files (only the edited lesson objects
change) and starts "Build lesson decks", which rebuilds the slides and plan of any lesson whose content changed (as a
new version; a teacher's uploaded deck is kept). Editing a file here still works and is copied into the portal, unless
the same lesson was also edited in the portal since the last sync (then the portal version wins). Add new lessons
and retire lessons here, as before. See docs/curriculum-editing.md.
