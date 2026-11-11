# Working on this repo (for any AI or developer)

1. **Read `DESIGN.md` first.** It is the standing brief: architecture (static
   Next.js export + Supabase), brand, accessibility (WCAG 2.2 AA), RLS on every
   table, safeguarding and "never invent" rules. It overrides anything else.
2. **Open work lives in `docs/backlog/`.** The current list is
   `docs/backlog/tafweed.md`: numbered items (T1, T2, …) with the owner's
   words, the files involved, "Done when" checks and a status. When the owner
   says "carry on" or "do T7", start there, and update that file (status, log
   line) in the same pull request.
   **Curriculum, lessons, slides and syllabus work** is tracked in
   `docs/curriculum-rebuild.md`: read its "START HERE: handover" section first,
   and reuse the briefs in `docs/agent-briefs/`.
3. **Branches and PRs:** branch from `main` as `claude/<topic>`; never push to
   `main`. The sandbox usually can't run `npm`, so CI (lint, `tsc`, build,
   a11y, `supabase test db`) is the check: open the PR and make sure it's green.
4. **Owner's standing rule (11 Nov 2026):** "keep doing it, i want u to have used the lms i showed u for
   inspo BUT i need the structure to be clearly different". Ihsan LMS (`Bananamc/madrasa-maina`) and SchoolMS
   are sources of feature ideas only: every TGA page's structure and layout must be clearly different from
   both, in TGA's own design (DESIGN.md). Never copy their code.
5. **Migrations** are numbered in `supabase/migrations/`; take the next free
   number from `main` at the time you open the PR.
