# Portal demo

A working copy of the real portal (the same pages and components as
learn.tarbiyyah.co.uk) running entirely in the browser, with a made-up school
and no network. Built for showing the portal to people (it can be hosted as a
claude.ai artifact) and for clicking through every page as each role.

## Build it

```
npm run build:demo               # writes out-demo/
npm run build:demo -- <folder>   # or any folder
```

Optional: `DEMO_WORK_DIR=<folder>` sets where the temporary build copy goes
(default: the system temp folder). The output is one `index.html` at the top
of the folder plus `assets/`, `public/`, `brand/` and `favicon.svg`: about 115
files and 12 MB. Upload the whole folder.

## What you get

- **Sign-in** offers five roles instead of a password: Head teacher (Amina
  Rahman), Teacher (Yusuf Ali, English), Office (Sarah Begum), Parent (Khadijah
  Malik, two children) and Pupil (Aisha Malik, Year 8).
- **The Demo bar** (bottom right) switches role or resets the made-up school.
  Switching reloads the page as the other person; changes made this session
  (registers, messages, marks, settings) carry over until **Reset demo data** or
  the tab is closed (kept in `sessionStorage`).
- **The made-up school** (`src/lib/demo/seed.ts`): Years 7 to 9, 8 subjects,
  24 classes, a head teacher, office manager and 6 teachers, 40 pupils in 28
  families (some with siblings), a published timetable, four weeks of registers,
  homework handed in and marked, house points, behaviour, Qur'an marks, messages
  and groups, calendar, parents' evening bookings, reports at each stage, SEND
  plans, absences and follow-ups, fees with references and invoices
  (`TGA-F-1001`, `TGA-P-10001`, `TGA-INV-27-00001`), admissions at each stage,
  recruitment, fictional safeguarding records (nothing graphic) and policies.
  Every name is invented. Dates move with today, so it always looks current.
  Quizzes are switched off, as in the real school (School features).

## How it works

Nothing in the real build changes: the demo is built in a temporary copy of the
repo (`scripts/demo/build.mjs`), where

1. the portal's pages move from `src/app/learn` to `src/portal-pages` (modules,
   not routes) and `src/app` holds a demo root layout and one page that lists
   every portal page (generated) and renders `DemoApp`;
2. imports of `next/link` and `next/navigation` point at `src/lib/demo/link.tsx`
   and `navigation.ts`, and `@/lib/supabase/client` re-exports
   `src/lib/demo/client.ts`;
3. code that reads or sets `window.location` / `history` is pointed at the
   demo router (`window.__demoLoc`);
4. `next build --webpack` with `NEXT_PUBLIC_DEMO=1` makes a static export, and
   `scripts/demo/postprocess.mjs` keeps only `index.html` and what it loads,
   renames `_next` to `assets` (no path may start with `_`), makes every URL
   relative and copies in the files from `public/` the code refers to.

**Routing is by `#hash`** (`src/lib/demo/router.ts`), because the page is
served from an unknown path where ordinary paths would not survive a reload:
`#teach-dashboard` is `/teach/dashboard`, and a page with a query is
`#/teach/class?id=...&tab=classwork`. `DemoApp` loads the page's real component
and its real layouts when it is opened.

**Data** comes from an in-browser PostgREST (`src/lib/demo/postgrest.ts`):
selects with embeds (relationships read from the migrations into
`schema.generated.json` by `scripts/demo/schema.mjs`), filters, `or`/`and`,
order, range, counts, single; inserts, upserts, updates and deletes go to
memory. `server.ts` answers REST, auth, storage and Edge Functions, works out
the views (`homework_status`, `fee_charges_finance`, ...) and scopes rows the
way RLS would (a parent sees their own children). `rpc.ts` and `functions.ts`
answer the database functions and Edge Functions; files are made in the browser
(`files.ts`). Emails, payments and AI are never sent anywhere.

The files in `src/lib/demo` and `scripts/demo` are never imported by the real
site, so they are not in its bundles.

## Check it

```
node scripts/demo/verify.mjs out-demo <shotsFolder> [role ...]
SHOT_ALL=1 node scripts/demo/verify.mjs out-demo <shotsFolder>   # a screenshot of every page
```

Serves the folder from a deep path (`/some/deep/path/index.html`, proving the
URLs are relative), blocks all network except localhost and Google Fonts, signs
in as each role, opens every sidebar page and reports console errors, failed
requests, blank pages, error messages and anything still loading after 8
seconds. Needs Playwright with Chromium.

## When the portal changes

New pages are picked up automatically. A page that reads a new table shows its
empty state until rows are added to `seed.ts`; a new database function returns
an empty list until it is added to `rpc.ts`. Run `verify.mjs` after a change.
