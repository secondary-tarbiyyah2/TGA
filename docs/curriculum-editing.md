# Editing the curriculum in the portal

A guide for staff. You can change the curriculum and individual lessons straight in the portal. There is nothing to
download or upload: after you press Save, the slides, lesson plans, PDFs and the syllabus pack are rebuilt for you.

Who can edit: teachers, the Headteacher and admins. Cover teaching assistants can look but not change anything.

## The Curriculum planner (long-term and week-by-week plans)

**Where:** Curriculum, then the **Curriculum planner** tab (in the Teaching area and in Admin).

1. Pick a year group at the top (Y1 to Y11).
2. You see every subject down the side and the six half terms across the top (Autumn 1 to Summer 2). On a phone, each
   subject is a card with its half terms underneath each other. Years 10 and 11 show the exam board's suggested term
   (Autumn, Spring, Summer) instead, because they follow the GCSE specification.
3. Units that have not been given a half term yet sit in **Not placed yet**. Open one and choose its half term.
4. Tap a unit to open it. You can change:
   - its title and half term (a title that starts "Autumn 1:" is renamed for you when you move it);
   - **What it covers** (for Years 10 and 11, the specification points), skills and key terms, one per line;
   - how it is checked, what it builds on and what it leads to;
   - resources, and a line about how it fits the founding year (January to July 2027);
   - the **week-by-week plan**: for each week, the lessons (one per line), key vocabulary and a home activity. Add,
     remove and move weeks with the buttons under each week.
5. Press **Save**. If something is missing (for example a unit with nothing under What it covers), the editor tells
   you what to fill in.
6. **+ Add unit** in any half term adds a new unit there. The arrows beside a unit move it up or down within its
   half term. **Remove unit** takes it out; it can be put back from **Recently removed** at the bottom of the page.

## Editing a lesson

**Where:** Curriculum, **Lesson library**. Pick the year and the unit, then press **Edit lesson** on the lesson.

You can change the title, unit, length, big question, objectives, success criteria, key words, resources, each teaching
slide (heading, bullet points, the teacher note, a routine and its block), homework, and the SEND, EAL and stretch line.
A lesson needs 3 to 7 teaching slides.

- **Questions with answers.** The starter, practice, independent tasks and exit ticket have a row per question: the
  question, its answer (optional) and minutes (optional). An answer adds a "Check your answers" slide after that
  section (exit ticket answers go on a teacher-only slide at the very end) and goes in the lesson plan's answer key.
  Minutes set the timer shown on the slide.
- **Hook (optional).** A full-screen first slide to grab attention: a question, a scene to picture, a short story, a
  puzzle or an odd one out, with optional options and what to draw out.
- **Routines.** How pupils answer on Teams (Show me, Chat waterfall, Teams poll, Cold call, Think pair share, Hands
  down), shown as a badge on the slide. Leave on "Usual" for the school's defaults.
- **Slide blocks.** Pick a block for a slide (worked example, hinge question, chart, number line, fraction bars,
  concept map, card sort and others): a template appears to fill in. It is checked as you type; the shapes are in
  `content/lessons/README.md`.

Write what you changed in the box at the bottom (optional, it helps colleagues) and press **Save and rebuild the
slides**.

**Your own slides.** If you prefer to make the slides yourself in PowerPoint, the old way still works: in the lesson's
menu (⋯) choose **Upload my own slides instead**. Uploaded slides are never replaced when someone later edits the
lesson; only the lesson plan is rebuilt. To go back to slides built from the lesson, open **Edit lesson** and tick
"replace them with new slides built from this lesson".

## The Syllabus pages and the syllabus pack

**Where:** Curriculum, then the **Syllabus** tab (Teaching area; in Admin for the Headteacher).

Pick a subject. **Long-term plan** shows Years 1 to 9 half term by half term (the founding-year half terms, Spring 1
to Summer 2, are shaded) and the Years 10 and 11 specification route by term. **Year by year** lists a year's units;
choose one to see what it covers, the skills and vocabulary, how it is checked, what it builds on and leads to, the
week-by-week plan, and links to its lessons in the Lesson library. **Progression** and **Exams** show how the subject
builds across the years and how Years 10 and 11 are examined. The page reads the Curriculum planner directly, so a
saved change shows at once. A link to the page keeps the subject, year and unit, so it can be shared.

**Print or save the PDF** opens the subject's curriculum document (cover, contents, intent, long-term plan, a page
per unit with its weekly plan, progression, assessment, coverage, sources); **Word** downloads an editable copy. The
whole-school **Curriculum overview** (every year group's long-term plan) is on the page before a subject is chosen.
The documents are rebuilt by the "Build syllabus pack" workflow after each change (`scripts/syllabus/build.mjs`).

## What happens after you save

1. Your change is saved for everyone at once. Anyone who opens the unit or lesson sees it.
2. Within a minute or two the portal asks the school's build system to copy the change into the curriculum files.
3. The slides (PowerPoint and PDF), the lesson plan (Word and PDF), the revision booklet and the syllabus pack are
   rebuilt from the new version.

**How long it takes:** usually 15 to 30 minutes for slides and lesson plans, and about the same for the syllabus pack.
If the quick trigger is ever unavailable, an hourly check picks your change up instead, so allow up to about 90
minutes. While new slides are being made the lesson shows **New slides on the way**. The planner shows when your year
group's plan was last copied to the syllabus pack, and lists anything that could not be sent yet and why.

If two people edit the same unit or lesson at the same time, the second person to press Save is told that someone
else saved first, so nobody's work is silently overwritten. Copy what you need, close the window, open it again and
make your change on top of theirs.

## Seeing history and undoing a change

- **A unit:** open it and choose **See earlier versions**. Each entry shows who saved it and when. **Use this
  version** fills the form with it; press Save to keep it.
- **A lesson's content:** in **Edit lesson**, choose **See earlier versions**, then **Use this version** and Save.
- **A lesson's slides:** in the lesson's menu (⋯) choose **Version history**. Every set of slides is kept (rebuilt and
  uploaded ones), and any of them can be downloaded or restored. A restored older set is kept as it is until someone
  chooses to rebuild the slides from the lesson again.
- Every change is also kept in the portal's audit log.

## For whoever looks after the website (technical notes)

- The portal (tables `curriculum_units` and `curriculum_lessons.content`, migration 0179) is the source of truth.
  The workflow **Sync curriculum from the portal** (`.github/workflows/sync-curriculum-from-portal.yml`,
  `scripts/curriculum/sync.mjs`) writes portal edits into `content/syllabus/**.json` and `content/lessons/**.json`,
  commits them to `main`, then starts Build lesson decks, Build revision booklets, Sync revision packs, Build
  syllabus pack and (when the syllabus index changes) Deploy site. It runs after each save (Edge Function
  `curriculum-sync`), every hour, after each backend deploy and whenever `content/` changes on `main`.
- Editing the JSON files in the repo still works. Units are compared one by one (lessons one by one too): a repo
  change to a unit nobody has edited in the portal since the last sync is copied into the portal, even when other
  units of the same year were edited in the portal. If both sides changed the same unit or lesson, the portal's
  version wins and the clash is shown on that unit or lesson (the repo version stays in the git history).
- Before anything is committed, each part is checked with the same rules as `scripts/*/validate.mjs`, including the
  cross-curricular hub links (renaming a KS4 spec reference a hub uses is held back). A part that fails is left out
  and shown in the planner or lesson editor as "Not sent yet" with the reason; everything else still syncs.
- Uploaded decks are never replaced: builds are recorded through `curriculum_store_generated_deck`, which refuses
  if a teacher uploaded slides during the build and never overwrites an uploaded version.
- The first run after the migration fills the portal from the repo. It never overwrites portal edits.
- If `main` moves while the sync is pushing (a rebase clash, often in the generated `syllabusIndex.json`), the sync
  starts again from the latest `main`, re-runs the comparison and retries, up to five times
  (`scripts/curriculum/commit-and-push.sh`). If it still cannot push, nothing is lost: the next run sends it.
- Lessons may carry optional answers and minutes on questions, a hook, routines, resources and chart, numberline,
  fraction, diagram and sort blocks (`content/lessons/README.md`; rules in `src/lib/learn/lessonSchema.mjs`, used by
  the validator, the sync and the editor alike). `node scripts/curriculum/test-lesson-fields.mjs` checks offline that
  they survive the repo -> portal -> repo round trip.
- When the deck or plan design changes (`scripts/lessons/build-decks.mjs`, `deck-parts.mjs` or `lesson-plan.mjs`), the
  next Build lesson decks run on `main` re-renders every generated deck and plan (FORCE). It can also be started by
  hand: Actions, Build lesson decks, Run workflow, force = true.
- New keys a unit may carry in `content/syllabus`: `halfTerm`, `weeks` (`[{ week, lessons[], vocabulary[], home }]`),
  `resources` and `foundingYear`. See `content/syllabus/README.md`.
