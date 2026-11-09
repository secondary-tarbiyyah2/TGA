#!/usr/bin/env bash
# Commit the Wikimedia Commons picture choices (content/lesson-pictures.json) that
# "Build lesson decks" made, so later builds use the same pictures. Run as the workflow's last step.
#
# main may have moved on during the build (other pushes), so each attempt starts from the latest
# main and merges this run's choices into its copy of the file (scripts/lessons/pictures.mjs merge).
# A picture choice must never block anything: after five failed attempts it gives up quietly and
# the next build finds the pictures again.
set -euo pipefail

F=content/lesson-pictures.json
SAVED="${RUNNER_TEMP:-/tmp}/lesson-pictures.json"
[ -f "$F" ] || { echo "No picture file."; exit 0; }
if git diff --quiet -- "$F" && [ -z "$(git ls-files --others --exclude-standard -- "$F")" ]; then
  echo "No new picture choices."
  exit 0
fi
cp "$F" "$SAVED"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

for attempt in 1 2 3 4 5; do
  git fetch -q origin main
  git reset -q --hard origin/main
  node scripts/lessons/pictures.mjs merge "$SAVED"
  if git diff --quiet -- "$F" && [ -z "$(git ls-files --others --exclude-standard -- "$F")" ]; then
    echo "main already has these picture choices."
    exit 0
  fi
  git add -- "$F"
  git commit -q -m "Lesson pictures: save the Wikimedia Commons choices" -m "Written by the \"Build lesson decks\" workflow (scripts/lessons/pictures.mjs)."
  if git push -q origin HEAD:main; then
    echo "Saved the picture choices (attempt $attempt)."
    exit 0
  fi
  echo "::warning::Attempt $attempt could not push the picture choices; trying again."
  sleep $((attempt * 5))
done
echo "::warning::Could not save the picture choices; the next build finds them again."
exit 0
