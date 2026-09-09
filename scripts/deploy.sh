#!/usr/bin/env bash
# One deploy path for adapttolife.org. Usage: scripts/deploy.sh staging|intake|prod
#
# Written 2026-09-09. This repo had no deploy script, so every production ship
# was a hand-typed `wrangler deploy` with nothing verifying it afterwards. The
# lesson that forced it: production here has been running a FEATURE BRANCH
# (hero-lineup-2026-09), 10+ commits ahead of main, so a deploy from the obvious
# branch would have silently reverted live work. This script cannot know which
# branch you meant, but it CAN refuse to leave a broken site behind and it can
# tell you exactly what it just replaced.
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-}"
case "$target" in
  staging) args=(--env staging); url="https://adapt-to-life-staging.alec-af3.workers.dev" ;;
  intake)  args=(--env intake);  url="https://adapt-to-life-intake.alec-af3.workers.dev" ;;
  prod)    args=();              url="https://adapttolife.org" ;;
  *) echo "usage: scripts/deploy.sh staging|intake|prod" >&2; exit 1 ;;
esac

if [ "$target" = "prod" ]; then
  echo "— what production is running RIGHT NOW (compare before you ship):"
  echo "    live build.txt : $(curl -s --max-time 15 https://adapttolife.org/build.txt | head -1)"
  echo "    your HEAD      : $(git rev-parse HEAD)"
  echo "    your branch    : $(git rev-parse --abbrev-ref HEAD)"
  echo
fi

# CSS is generated (public/css is gitignored), so a clean checkout ships an
# empty stylesheet unless this runs first.
npm run css

cfrun wrangler deploy "${args[@]}"

echo "— smoke test: $url"
sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$url/")
echo "  /            -> $code"
[ "$code" = "200" ] || { echo "FAIL: homepage not 200" >&2; exit 1; }

raised=$(curl -s --max-time 30 "$url/api/raised" || true)
echo "  /api/raised  -> $(echo "$raised" | head -c 100)"
echo "$raised" | grep -q '"ok":true' || { echo "FAIL: /api/raised not ok" >&2; exit 1; }

stamp=$(curl -s --max-time 30 "$url/build.txt" | head -1 || true)
echo "  build.txt    -> $stamp"

echo "OK: $target deployed and healthy"
