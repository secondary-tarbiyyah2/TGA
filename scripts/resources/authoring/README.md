# Authoring helpers for term resources

Small scripts the resource agents use to write items in `content/resources/items` after `seed.mjs` has drafted them.
None of them run in CI. Pick the term with `TERM_ID` (spring-1, spring-2, summer-1, summer-2; default spring-1).
Run from the repo root, for example `TERM_ID=summer-1 node scripts/resources/authoring/generic.mjs geography`.

| File | What it does |
| --- | --- |
| `hand.mjs` | Shared helpers: `gen(subject, year)` lists a term's TO MAKE entries; `lesson`, `readItem`, `put` (write an item for a register entry, keeping its id, subject, year, unit, lessons and source); `teachBlocks` (the lesson's rules, tables, quotes, models, sorts and timelines as printable blocks), `qBlocks` (the lesson's practice, independent, hinge and exit questions with answers), `kwOf`, `qs`, `clean`. |
| `generic.mjs` | `rebuildGeneric(entry, { pre, mid, post, ... })`: rebuild a worksheet from the whole lesson. Run directly on subjects to rebuild every worksheet, frame and organiser (skips quizzes, papers, texts, sets, grids and practical guides). |
| `marks.mjs` | Revision sets, quizzes and papers: marks from the `[n]` in each question, reflection prompts dropped, every question given a mark. |
| `practical.mjs` | `practical(entry, aim, kit, steps, resultsHead, safety)`: a home practical guide with method, kit, safety and a results table. |
| `quran.mjs` | Qur'an items for any term: rule cards, ayah sheets with words spaced, read-and-colour, star charts and plans (Arabic copied from the lessons only). |
| `les.mjs` | Print lessons compactly: `node les.mjs <subject> <year> <n,n>` (add `full` for long text). |
| `needs.mjs` | For each TO MAKE entry: the lesson's teaching blocks and tasks that mention a sheet. |
| `sumt.mjs`, `count.mjs` | Summarise a term's items per subject (blocks, missing answers) and count them by type. |
| `types.mjs` | Add `overrides.json` type entries where an item's type differs from its register entry (rarely needed: the register takes a made item's type from the item). |
| `preview.sh` | Build a subject's PDFs into `$SCRATCH/out` and render chosen ones as PNGs (`PAGES=2` for more pages). Delete the previews afterwards. |
| `wait.sh`, `waitrun.sh` | Wait for a commit's check runs; wait for its "Build term resources" run and re-run failed jobs once. |

Subject-specific scripts (texts, papers, maps) are written per term and are not kept: they are one-off content, and the
content itself is in the items. The usual order is: `register.mjs`, `seed.mjs --term=<t> --subject=<s>`,
`generic.mjs <s>`, `marks.mjs <s>`, then hand-written texts, sets, papers and guides, then `validate.mjs`.
