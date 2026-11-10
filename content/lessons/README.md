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
| `model` | string | optional (v3): the teacher's worked model, gone through first ("I do"); see Lessons v3 |
| `options` | 2-4 strings | optional (v3): Teams poll options; or write them in `q` as "… A) x B) y C) z" |

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
Defaults when not set: starter `show-me`, hinge `teams-poll`, practice `show-me`, exit
`chat-waterfall`, hook `chat-waterfall` (`show-me` for a puzzle or odd-one-out), others none.
Avoid `cold-call` (the validator warns): use Teams polls (see Lessons v3).

**Hook.** A striking full-screen slide straight after the title, before the lesson map, to grab
attention in the first minute:

```json
"hook": { "type": "odd-one-out", "text": "Each describes 3, 5, 5, 8, 9. Which is the odd one out?", "options": ["5 (the mode)", "5 (the median)", "6 (the range)", "6 (the mean)"], "a": "The range: it is a spread, not an average." }
```

`type` is `ponder` (v3: the first slide, see Lessons v3), `question`, `image-prompt` (a scene
for pupils to picture), `story`, `puzzle` or `odd-one-out`; `text` at most 240 characters; `options` 2-5 short lines
(3-5 for odd-one-out); `a` (optional) is what to draw out, in the notes and plan only.

**Resources.** `"resources": ["Slides", "Mini-whiteboard and pen", "Dice"]` (1-10 lines) for the
plan. Left out, the plan lists slides, mini-whiteboard and pen, exercise book.

**Lesson plan.** One A4 plan per lesson (Word and PDF): header, objectives and success
criteria, prior learning and next lesson (from the neighbouring lessons in the file), resources,
a timed run-through with routines and teacher actions, key questions and the hinge (what each
wrong answer reveals, from the check's `why`), misconceptions, the answer key, adaptations
(from `send`: label parts "SEND:", "EAL:", "Support:", "Stretch:"), assessment for learning,
and an "after the lesson" box.

## Tests, mocks and quizzes (`assessmentMode`, optional)

`"assessmentMode": "test"` (or `"mock"`, `"quiz"`) builds the lesson as an assessment; the
`independent` questions are the paper:

- an exam-conditions slide before the questions: the timer, the total marks, and
  "Cameras on, mics off, work alone, no other tabs", with how to answer (the portal response box);
- the questions labelled Question 1, 2… (or Section A, B… for a mock, or the item's own
  "Q3 …" / "Section B …"), each with its marks, not core / extend / stretch; a follow-on task in a
  mock ("Extend: self-mark") is labelled "Extra", not a new section;
- no answers to the test questions in the lesson or the pupil PDF. A test or mock also holds back the
  starter, guided practice and poll answers; a quiz (often a review lesson with a quiz in it) shows those
  as usual and holds back only the quiz questions' answers;
- after the last slide, a "Teacher only: mark scheme (do not show)" divider, then the mark scheme
  and the answers held back (and the exit ticket answers, as in every lesson); the lesson plan has the mark scheme too.

Marks come from the question text: `"Q1 (2 marks): …"`, `"Q1 Rivers (16): …"`, `"a 30-mark paper"`,
or part marks `"(a) … (1) (b) … (3)"` added up; or give an item `"marks": 4`. A question that is
"an alternative to Q1 or Q2" is not added to the total.

Left out, the mode is detected from the title (`detectAssessment` in `src/lib/learn/lessonSchema.mjs`:
test, mock, assessment, quiz, end-of-year paper, timed section, practice paper, end-of-block check;
not "test feedback", "mock review", "fair test", "risk assessment" and the like), and the validator
warns until it is set. `"assessmentMode": false` means "not an assessment" whatever the title says.

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
(adab; "Bismillah" in Qur'an, Islamic Studies and Arabic starters only) and never contradicting
Islamic belief; no invented facts,
hadith or quotations. Questions must have concrete content (real numbers, real
sentences), not placeholders.

It also fails on placeholder text: a key word whose definition is missing or a stand-in ("def"),
"TODO", "TBC", "lorem ipsum", "xxx", "[placeholder]", and empty strings where text is required
("term" and "placeholder zero" are real maths words, so they pass when properly defined).
`node scripts/lessons/validate.mjs` checks all of this (the shapes and limits live in
`src/lib/learn/lessonSchema.mjs`, shared with the portal editor and the curriculum sync). To preview decks from a
scratch folder: `LESSONS_DIR=path node scripts/lessons/build-decks.mjs out/preview`.

## Lessons v3 (the owner's design feedback, 9 Nov 2026)

All optional, so older lessons still build; new lessons should use them. The validator
(`node scripts/lessons/validate.mjs`, `--warnings` for the full list) **warns** (never fails) when
a lesson has more than 1 objective, more than 3 success criteria, a criterion that repeats the
objective, a `cold-call` routine, "Bismillah" in the starter of a subject other than Qur'an,
Islamic Studies or Arabic, or item `mins` adding up to more than the lesson length less 3 minutes.
The portal's lesson editor shows the same advice.

```json
"objectives": ["To understand why the body needs a variety of foods to stay healthy"],
"successCriteria": ["All: name the seven components of a balanced diet", "Most: give two food sources for each", "Some: explain why no single food gives the body everything"],
"hook": { "type": "ponder", "text": "If you could only eat one food for a month, which would keep you healthiest, and why?" },
"islamicLink": { "text": "Allah says: 'O mankind, eat from whatever is on earth that is lawful and good' (al-Baqarah 2:168) …", "at": "start" },
"pictures": [
  { "find": "olive oil bottle", "alt": "A bottle of olive oil (lipid)", "for": "keywords" },
  { "find": "fruit and vegetables market stall", "alt": "Fruit and vegetables", "for": "teach:2" }
],
"routines": { "starter": "teams-poll", "hinge": "teams-poll", "practice": "show-me", "exit": "teams-poll" },
"practice": [{ "q": "Name the seven components.", "a": "Carbohydrates, proteins, lipids, vitamins, minerals, fibre, water", "model": "Use the memory hook …", "mins": 3 }],
"exit": [{ "q": "What does fibre do? A) gives energy B) keeps food moving through the gut C) builds muscle", "a": "B) keeps food moving through the gut", "mins": 1 }]
```

1. **One objective**, high level ("To understand how …", "To explain why …"): the destination.
2. **Success criteria**: up to 3, All / Most / Some, each a concrete, checkable step towards the
   objective, never a restatement of it. The objective slide shows the destination above and the
   three steps as a staircase below.
3. **Ponder**: `hook` `{ "type": "ponder", "text": one open question }` is the **first slide**, on
   screen while pupils join ("Think while we wait"), with the link to the lesson PDF. Every lesson
   has one. It replaces the hook and big-question slides; the exit ticket returns to it.
4. **Pictures**: 2-4 `pictures` `{ find, alt, for, file?, credit?, licence? }`. `find` is a precise
   search phrase for a real photo, map or diagram on Wikimedia Commons; `for` is `hook` (the ponder
   slide), `teach:N` (teach slide N, 1-based) or `keywords` (the key words slide: one picture per key
   word where possible). Never people or faces, never drawn living beings: objects, places, plants
   and animals as photos, maps and diagrams only. `scripts/lessons/pictures.mjs resolve` (run by
   "Build lesson decks") picks the first safe file (licences CC0, public domain, CC BY, CC BY-SA;
   skips anything whose categories, file name or structured data suggest people, faces, paintings,
   statues or unsuitable content; when unsure it skips) and saves the choice in
   `content/lesson-pictures.json`, so the same picture is used every time. To choose a picture
   yourself, put its Commons file name in `file` (e.g. `"File:Olive oil from Oneglia.jpg"`). Each
   picture carries a small credit line. If Commons cannot be reached the slides are built without it.
   A picture for a teach slide with a block gets its own "Look closely" slide just before it.
5. **Diagrams**: use the `diagram` / `chart` / `numberline` / `fraction` / `sort` blocks wherever a
   picture of the idea helps.
6. **Key words**: keep `keywords` (3-6, child-friendly definitions). Each teach slide shows the key
   words it uses in a small box in its corner, and the unit's key words (collected across its
   lessons, today's highlighted) are the second-to-last slide.
7. **Bismillah** only in Qur'an, Islamic Studies and Arabic (and the start-of-day register).
8. **Islamic link**: `islamicLink` `{ text, at }`. Where Islam speaks to the topic, start from it as
   the foundation (`"at": "start"`, a slide straight after the title). Where the topic is a theory
   that conflicts with Islamic belief, teach the specification factually and give the Islamic
   position at the end (`"at": "end"`, after the exit ticket). Cite only ayat you are certain of
   (surah:ayah); never invent hadith.
9. **Polls, not cold calls**: with the routine `teams-poll` on the starter or exit, each item with
   2-4 options (in `options`, or "A) … B) …" in `q`) gets a poll slide (question, lettered options,
   "Vote in the Teams poll" and how to launch a Forms poll in the meeting) and then an answer slide
   (the right option ticked). Hinge questions (`check` blocks) are polls by default and also get an
   answer slide. Keep polls short, one correct answer, plausible wrong answers, not too hard.
10. **Modelling**: `practice` item 1 has a `model` (the worked answer; for writing subjects a model
    paragraph with its structure labelled, e.g. "Point: … Evidence: … Explain: … Link: …"): it gets an
    "I do" slide before the guided practice ("We do", the other items). `independent` item 1 also has
    a `model`, shown on a "Task 1: watch it done first" slide before the tasks.
11. **Longer written answers**: say in the item's `q` where pupils write (the portal's response box
    or a Forms long-answer question) and give a sentence starter.
12. **Timing**: the items' `mins` plus about 3-5 minutes a teach slide must fit the lesson (30 / 45 /
    50 minutes) with 3 minutes to spare. The plan adds the phases up and shows the total.
13. **Cross-curricular and SMSC**: one accurate, specific connection each, or leave it out.
14. **Resources**: name every resource precisely in `resources` (for the term resource list).

**Deck order (v3):** ponder · title with "Our online class promise" (cameras on, mic muted until
asked, respect and kind words, stay on this lesson's window, try your best) · Islamic foundation ·
objective and steps · lesson map · key words · starter (and polls) · teach slides · I do · we do ·
task 1 modelled · independent · connect it · exit (and polls) · Islamic position · topic key words ·
homework · teacher-only exit answers.

**Pupil PDF:** every lesson also gets `<NN>-<slug>-pupil.pptx`, converted to an A4 PDF: the slides
pupils need (no lesson map, breaks, answer slides or teacher-only slide) with a name line on each
page, then a worksheet with every guided, independent and exit question and lines to write on,
printable or for a drawing tablet. It is uploaded with the plan and opened from
`https://learn.tarbiyyah.co.uk/lesson-pdf/?s=<subject>&y=<year>&n=<lesson>` (staff, and pupils in
that year; migration 0189), linked on the first slide and in the plan.

**Lesson plan (two pages):** the objective, up to 3 criteria, the ponder question, a timed run-through
whose minutes add up (with a total), the models, polls and pictures, and the resources (with the
pupil PDF).

To preview: `ONLY_LESSONS=science/y8/1 LESSONS_DIR=path node scripts/lessons/build-decks.mjs out/preview`
(`PICTURES_JSON` and `PICTURES_DIR` point at another picture file and image folder).

## Edited in the portal

Each lesson is also held in the portal (`curriculum_lessons.content`, migration 0179), where staff edit it with
**Edit lesson** in the Lesson library. The portal is the source of truth: the workflow "Sync curriculum from the
portal" (`scripts/curriculum/sync.mjs`) writes edited lessons back into these files (only the edited lesson objects
change) and starts "Build lesson decks", which rebuilds the slides and plan of any lesson whose content changed (as a
new version; a teacher's uploaded deck is kept). Editing a file here still works and is copied into the portal, unless
the same lesson was also edited in the portal since the last sync (then the portal version wins). Add new lessons
and retire lessons here, as before. See docs/curriculum-editing.md.
