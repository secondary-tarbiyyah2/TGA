# Digital mushaf (hearing a recitation)

Used by **Hear and mark** in a Qur'an class (`src/components/learn/quran/RecitationWorkspace.tsx`).

- **Text:** the King Fahd Glorious Qur'an Printing Complex's Uthmanic Hafs data, version 18 (Hafs 'an 'Asim).
  No letter or mark is changed; only the ayah number at the end of each ayah is dropped, because the page draws
  its own. It's split into `public/mushaf/p001-020.json` … `p601-604.json` (about 50 KB each), as
  `{"pages": {"<page>": [[surah, ayah, text], …]}}`. The browser fetches a file the first time one of its pages
  is needed and keeps it for the visit. The files were taken from the owner's Ihsan LMS (repository
  `Bananamc/madrasa-maina`, `public/mushaf`), which built them from the Complex's published data. They are
  data, not code.
- **Pages:** the 604-page Madinah mushaf. `src/lib/learn/mushafPages.ts` (where each page starts) is generated
  from the files by `node scripts/build-mushaf-index.mjs`, which stops if any ayah is missing, repeated or out
  of order (6,236 ayat).
- **Font:** the Complex's Uthmanic Hafs font v18 (`public/fonts/uthmanic-hafs-v18.woff2`), served unmodified.
  The Complex lets it be used freely but not sold or modified. `@font-face` is in `src/app/globals.css`
  (`.mushaf-text`).
- **Tests:** `src/lib/learn/mushaf.test.ts` (pages, page counts, files).

## Marks

Stored on `quran_progress.mistakes` (jsonb) as `{kind, surah, ayah, word?, gap?}`:
`kind` is `prompt`, `slip` or `tajweed`, or `skipped` (an ayah the pupil did not reach: no points, and it is
left out of the pages the mark is judged on). `word` is the word's place in the ayah, counting from 0; `gap`
marks the join after that word (tajweed across two words). Older entries without `word` are mistakes on an
ayah only. Reading code: `readMistakes` in `src/lib/learn/quranMarking.ts`.
