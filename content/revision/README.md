# Revision packs

Unit revision (pupils: **Unit revision**; staff: each unit's **Revision pack** and **Pupil results** tabs in the Lesson library) gets its packs from two places:

1. **Lesson units, automatically.** Any unit in `content/lessons/` whose lessons hold at least four hinge questions (`check` blocks) gets a pack. Pupils revise from the unit's lesson slides; the quiz uses the hinge questions; each lesson's key words become extra practice questions.
2. **Summary packs, in this folder.** One JSON file per pack, with its own summary slides, questions and an optional video in `media/`. See `islamic-studies-y10-aqeedah-1.json`.

Summary pack fields: `subject_slug`, `subject`, `year` (`y7`…), `unit`, `title`, `video` (path under this folder), `summary` (slides: `title`, `time` in the video, `term` (Arabic), `transliteration`, `points`, `quote` {`text`, `src`}, `keywords` [{`t`, `d`}], `hint`), and `questions` (`topic` = a slide title, `question`, `options`, `answer` (index), `explanation`, `wrong` {option index: note}).

Check a pack builds with `node scripts/lessons/sync-revision.mjs check`. On push to `main`, the **Sync revision packs** workflow loads packs into the portal. Questions staff add in the portal are never changed by the sync, and a pack staff have hidden stays hidden.

Before pupils use a pack, a teacher should check it, especially Arabic and Qur'an or hadith references.

## Packs teachers make in the portal

Teachers can also make a summary pack without touching this folder: **Lesson library → + New revision pack** (or a unit's **Revision pack** tab → **Make a revision pack**).

1. Choose the subject and unit, and the title pupils see.
2. Upload one summary video (MP4, up to 200 MB; a narrated PowerPoint exported at 720p works well).
3. Play it and press **New chapter here** at each chapter's start, or paste times like `0:00 What is aqeedah?`. Each chapter stops at its own end; use **Check the ending** and **End here** to trim one that runs into the next.
4. Fill in each chapter's summary slide (Arabic term, transliteration, points, quote, key words) and add quiz questions.
5. Tick that the Arabic and references are checked, then **Show to pupils**. The database refuses to show an unchecked teacher-made pack.

These packs are `source = 'staff'`; the sync never overwrites them. Chapters are stored as `start`/`end` seconds on the summary slides of the unit's one video.
