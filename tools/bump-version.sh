#!/bin/bash
# Bump app VERSION (codelingo/app.js) and service-worker CACHE (codelingo/sw.js) together,
# so installed PWAs pick up the update. Usage: tools/bump-version.sh [patch|minor|major|X.Y.Z]
set -euo pipefail
cd "$(dirname "$0")/../codelingo"
cur=$(sed -n "s/.*const VERSION = '\([0-9.]*\)'.*/\1/p" app.js)
IFS=. read -r MA MI PA <<<"$cur"
case "${1:-patch}" in
  patch) new="$MA.$MI.$((PA + 1))" ;;
  minor) new="$MA.$((MI + 1)).0" ;;
  major) new="$((MA + 1)).0.0" ;;
  [0-9]*.[0-9]*.[0-9]*) new="$1" ;;
  *) echo "usage: $0 [patch|minor|major|X.Y.Z]" >&2; exit 2 ;;
esac
perl -pi -e "s/const VERSION = '\Q$cur\E'/const VERSION = '$new'/" app.js
perl -pi -e "s/const CACHE = 'codelingo-[0-9.]*'/const CACHE = 'codelingo-$new'/" sw.js
grep -q "const VERSION = '$new'" app.js && grep -q "const CACHE = 'codelingo-$new'" sw.js \
  || { echo "bump failed" >&2; exit 1; }
echo "$cur -> $new"
