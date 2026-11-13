#!/usr/bin/env bash
# Deploy the static site to Cloudflare Pages (docs/cloudflare-hosting.md).
# Needs: CLOUDFLARE_API_TOKEN (Pages: Edit), CLOUDFLARE_ACCOUNT_ID, SUPABASE_ACCESS_TOKEN
# (to read the anon key), and optionally BRANCH (default "main" = production;
# BRANCH=preview deploys preview.<project>.pages.dev for the staff preview).
# Usage: scripts/deploy-cloudflare.sh [--skip-build]
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}"
BRANCH="${BRANCH:-main}"
REF=bgtspjhdajqheaktudip

if [ "${1:-}" != "--skip-build" ]; then
  : "${SUPABASE_ACCESS_TOKEN:?}"
  export NEXT_PUBLIC_SUPABASE_URL="https://$REF.supabase.co"
  export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(curl -fsS "https://api.supabase.com/v1/projects/$REF/api-keys" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const k=JSON.parse(s).find(k=>k.name==="anon"||k.name==="publishable");process.stdout.write(k.api_key)})')"
  export NEXT_PUBLIC_LEARN_ORIGIN="${LEARN_SITE_URL:-https://learn.tarbiyyah.co.uk}"
  # Public values (they ship in the site's JavaScript anyway); same as the GitHub variables.
  export NEXT_PUBLIC_VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-BHHFDaV7ieqttuedPY1u9is3GvGvRGDS5yXh9UIu2eWp697lfuuTRROTlvjilzD2fcLdP6DnL8gJJ0-3qq_2W8g}"
  export NEXT_PUBLIC_ADMISSIONS_TEAMS_URL="${ADMISSIONS_TEAMS_URL:-https://teams.microsoft.com/l/meetup-join/19%3ameeting_M2UwM2U2NzYtNjhkMS00ZDRkLTlmODctNTZiMWZmMWFiMzcw%40thread.v2/0?context=%7b%22Tid%22%3a%22a0b25b15-bb34-4892-a564-6c8277ae3db2%22%2c%22Oid%22%3a%223b6d0aa6-0912-44cc-b592-f83506cd0d80%22%7d}"
  npm run build
  node scripts/build-policies.cjs --from-db --out out/policies || echo "WARN: policy PDFs not rebuilt (the live policy-file function still serves them)"
  npm run split-static-export
fi

# Apache-only files have no meaning on Pages.
rm -f out-main/.htaccess out-learn/.htaccess out-main/*.php out-learn/*.php

for site in main learn; do
  project="tga-$site"; [ "$site" = main ] && project="tga-site"
  (cd "cloudflare/$site" && npx --yes wrangler@4 pages deploy "../../out-$site" --project-name "$project" --branch "$BRANCH" --commit-dirty=true)
done
