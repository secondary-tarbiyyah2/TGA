# Working on this repo (for any AI or developer)

1. **Read `DESIGN.md` first.** It is the standing brief: architecture (static
   Next.js export + Supabase), brand, accessibility (WCAG 2.2 AA), RLS on every
   table, safeguarding and "never invent" rules. It overrides anything else.
2. **Open work lives in `docs/backlog/`.** The current list is
   `docs/backlog/tafweed.md`: numbered items (T1, T2, …) with the owner's
   words, the files involved, "Done when" checks and a status. When the owner
   says "carry on" or "do T7", start there, and update that file (status, log
   line) in the same pull request.
3. **Branches and PRs:** branch from `main` as `claude/<topic>`; never push to
   `main`. The sandbox usually can't run `npm`, so CI (lint, `tsc`, build,
   a11y, `supabase test db`) is the check: open the PR and make sure it's green.
4. **Migrations** are numbered in `supabase/migrations/`; take the next free
   number from `main` at the time you open the PR.
