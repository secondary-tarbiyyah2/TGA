#!/usr/bin/env bash
# Commit what "Sync curriculum from the portal" wrote into content/ (and the generated
# src/lib/learn/syllabusIndex.json) and push it to main.
#
#   bash scripts/curriculum/commit-and-push.sh [outDir]
#
# Several pushes can land on main within minutes (other agents editing content/, the deck and
# pack builds), so a rebase can conflict, most often in the generated syllabus index. Generated
# files must never block a push: when the rebase or the push fails, this script throws its commit
# away, resets to the latest main, runs the sync again on top of it (which also takes in whatever
# just landed), re-checks the files, regenerates the index and tries again, up to five times.
#
# Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the re-runs (as for sync.mjs). Writes
# pushed, sha and index_changed to $GITHUB_OUTPUT.
set -euo pipefail

OUT="${1:-out/curriculum-sync}"
S="$OUT/summary.json"
OUTPUT="${GITHUB_OUTPUT:-/dev/null}"
PATHS=(content src/lib/learn/syllabusIndex.json)

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

start_again() {
  git rebase --abort >/dev/null 2>&1 || true
  git fetch -q origin main
  git reset -q --hard origin/main
  node scripts/curriculum/sync.mjs run "$OUT"
  node scripts/syllabus/validate.mjs >/dev/null
  node scripts/lessons/validate.mjs >/dev/null
  node scripts/syllabus/export-portal-index.mjs >/dev/null
}

for attempt in 1 2 3 4 5; do
  if [ "$attempt" -gt 1 ]; then
    echo "Attempt $attempt: starting again from the latest main."
    start_again
  fi

  if git diff --quiet -- "${PATHS[@]}"; then
    echo "Nothing changed in the repo."
    echo "pushed=false" >> "$OUTPUT"
    exit 0
  fi

  EDITORS=$(jq -r '.editors | join(", ")' "$S")
  TITLE="Curriculum: copy edits from the portal ($(jq -r '.sent_units' "$S") unit change(s), $(jq -r '.sent_lessons' "$S") lesson(s))"
  # Only the site's syllabus index changed (content/ was edited in the repo): say so.
  if [ "$(jq -r '.changedFiles | length' "$S")" = "0" ]; then TITLE="Curriculum: refresh the portal's syllabus index from content/syllabus"; fi
  BODY="Written by the \"Sync curriculum from the portal\" workflow from the portal's Curriculum planner and lesson editor."
  if [ -n "$EDITORS" ]; then BODY="$BODY Edited by: $EDITORS."; fi

  git add -- "${PATHS[@]}"
  git commit -q -m "$TITLE" -m "$BODY"
  INDEX_CHANGED=false
  if git diff --name-only HEAD~1 HEAD | grep -qx "src/lib/learn/syllabusIndex.json"; then INDEX_CHANGED=true; fi

  if git pull --rebase -q origin main && git push -q origin HEAD:main; then
    {
      echo "pushed=true"
      echo "sha=$(git rev-parse HEAD)"
      echo "index_changed=$INDEX_CHANGED"
    } >> "$OUTPUT"
    echo "Pushed $(git rev-parse --short HEAD) on attempt $attempt."
    exit 0
  fi
  echo "::warning::Attempt $attempt could not be pushed (main moved on or the rebase clashed)."
  sleep $((attempt * 5))
done

git rebase --abort >/dev/null 2>&1 || true
echo "::error::Could not push the changes to main after 5 attempts. Nothing was lost: the next run sends them."
exit 1
