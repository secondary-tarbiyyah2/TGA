# Brief: carry on the owner's "Tafweed" backlog for the TGA portal and website

Repo: secondary-tarbiyyah2/TGA (Next.js static export + Supabase). You work in your own git worktree.
The owner is not a developer, wants work actually shipped, and wants no clarifying questions (act on sensible defaults).

1. Read `docs/backlog/tafweed.md` (single source of truth for this batch; follow its "How to carry on") and `DESIGN.md`
   (brand, accessibility, no hard-coded colours, static site, RLS, safeguarding). Take the newest copy from
   `origin/claude/tafweed-website` if it is not yet on main (PR #41 may still be merging): `git fetch origin` and use
   whichever is newer.
2. Do ONLY the items named in your task. Another agent is doing other items at the same time; stay inside your files.
   Shared components (`src/components/learn/ui.tsx`, `Dropdown.tsx`, `globals.css`, `nav.ts`) may be touched only for
   your items, with minimal, additive changes.
3. Branch `claude/tafweed-T<n>-<short-name>` from origin/main. Small commits. Commit messages end with:
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_013iHmWuLcNBBDaCmnGYQkAS
4. In the same PR update docs/backlog/tafweed.md: your items' Status, ticked "Done when" boxes, and one dated Log line.
   That file conflicts often: merge origin/main in and keep everyone's lines.
5. Database changes: a new migration file in supabase/migrations named with the next free number AT MERGE TIME
   (check origin/main right before merging; renumber yours if taken). RLS on every new table; pgTAP tests in
   supabase/tests for any role or RLS change. Never weaken an existing policy. Safeguarding data stays staff-only.
6. Checks you can run here: `npm ci` (if node_modules missing), `npx tsc --noEmit`, `npm run lint`, `npm run build`.
   Supabase CLI tests run in CI (db-tests). Use the UI, not just types: run `npm run build` and screenshot changed pages
   with Playwright where practical (chromium is preinstalled: require('playwright'); look at them yourself).
7. Open a PR via REST (GraphQL is blocked):
   gh api repos/secondary-tarbiyyah2/TGA/pulls -f title=... -f head=<branch> -f base=main -f body=...
   Body: plain English summary for a non-developer + what to check; it ends with:
   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   https://claude.ai/code/session_013iHmWuLcNBBDaCmnGYQkAS
   Then wait for its check runs (gh api repos/secondary-tarbiyyah2/TGA/commits/<sha>/check-runs) and, when all pass,
   merge: gh api -X PUT repos/secondary-tarbiyyah2/TGA/pulls/N/merge -f merge_method=squash. If a check fails, fix and
   push again (retry straight away). If it conflicts, merge origin/main in, resolve, re-check, retry.
8. House rules for any text: British spelling, no em dashes, plain English, no emojis in the portal UI, Islamic ethos
   (no music, no images of people's faces in illustrations), "PSHE" only, never invent facts about the school.
9. Nothing secret in code or commits. The Supabase project reachable from MCP tools in this session is NOT TGA's:
   do not use it. Diagnose live behaviour from code and GitHub Actions logs (gh run list / gh run view --log).

Reply with ONLY: PR number(s), merged SHA(s), and up to 6 plain-English lines: what changed for the owner, anything
they must check or decide.
