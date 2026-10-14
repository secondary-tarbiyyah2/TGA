# Revision packs

Unit revision (pupils: **Unit revision**; staff: each unit's **Revision pack** and **Pupil results** tabs in the Lesson library) gets its packs from two places:

1. **Lesson units, automatically.** Any unit in `content/lessons/` whose lessons hold at least four hinge questions (`check` blocks) gets a pack. Pupils revise from the unit's lesson slides; the quiz uses the hinge questions; each lesson's key words become extra practice questions.
2. **Summary packs, in this folder.** One JSON file per pack, with its own summary slides, questions and an optional video in `media/`. See `islamic-studies-y10-aqeedah-1.json`.

Summary pack fields: `subject_slug`, `subject`, `year` (`y7`…), `unit`, `title`, `video` (path under this folder), `summary` (slides: `title`, `time` in the video, `term` (Arabic), `transliteration`, `points`, `quote` {`text`, `src`}, `keywords` [{`t`, `d`}], `hint`), and `questions` (`topic` = a slide title, `question`, `options`, `answer` (index), `explanation`, `wrong` {option index: note}).

Check a pack builds with `node scripts/lessons/sync-revision.mjs check`. On push to `main`, the **Sync revision packs** workflow loads packs into the portal. Questions staff add in the portal are never changed by the sync, and a pack staff have hidden stays hidden.

Before pupils use a pack, a teacher should check it, especially Arabic and Qur'an or hadith references.
