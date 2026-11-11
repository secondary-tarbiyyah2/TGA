#!/bin/bash
# wait.sh <sha>: wait until all check runs on the commit are complete; print a summary.
SHA=$1
for i in $(seq 1 90); do
  J=$(gh api "repos/secondary-tarbiyyah2/TGA/commits/$SHA/check-runs?per_page=100" --jq '[.check_runs[] | {n:.name,s:.status,c:.conclusion}]')
  TOTAL=$(echo "$J" | jq length)
  PENDING=$(echo "$J" | jq '[.[] | select(.s != "completed")] | length')
  if [ "$TOTAL" -ge 4 ] && [ "$PENDING" = 0 ]; then echo "$J" | jq -r '.[] | "\(.n): \(.c)"'; exit 0; fi
  sleep 20
done
echo "timeout"; echo "$J" | jq -r '.[] | "\(.n): \(.s) \(.c)"'
