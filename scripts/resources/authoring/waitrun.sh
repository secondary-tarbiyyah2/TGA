#!/bin/bash
# waitrun.sh <sha>: wait for the "Build term resources" run on that commit; on failure re-run once and wait again.
SHA=$1
find_run() { gh api "repos/secondary-tarbiyyah2/TGA/actions/runs?head_sha=$SHA&per_page=30" --jq '.workflow_runs[] | select(.name=="Build term resources") | "\(.id) \(.status) \(.conclusion)"' | head -1; }
RETRIED=0
for i in $(seq 1 120); do
  R=$(find_run)
  if [ -n "$R" ]; then
    set -- $R
    ID=$1; ST=$2; CO=$3
    if [ "$ST" = "completed" ]; then
      if [ "$CO" = "success" ]; then echo "run $ID success"; exit 0; fi
      if [ "$RETRIED" = 0 ]; then echo "run $ID $CO: re-running failed jobs"; gh api -X POST "repos/secondary-tarbiyyah2/TGA/actions/runs/$ID/rerun-failed-jobs" >/dev/null; RETRIED=1; sleep 30; continue; fi
      echo "run $ID $CO after retry"; exit 1
    fi
  fi
  sleep 30
done
echo "timeout: $R"
