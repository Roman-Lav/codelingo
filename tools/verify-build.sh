#!/bin/bash
# Build, then open both outputs in headless Chrome and check the app actually boots.
# Exit 0 = both builds render the home screen with all courses and the tab bar.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PORT=${PORT:-$(python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')}
python3 tools/build.py

PROFILE=$(mktemp -d)
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory dist/web >/dev/null 2>&1 &
SERVER=$!; disown $SERVER
trap 'kill $SERVER 2>/dev/null; rm -rf "$PROFILE"' EXIT
up=0
for _ in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && { up=1; break; }; sleep 0.1; done
[ $up = 1 ] || { echo "FAIL: local server on port $PORT did not start"; exit 1; }

COURSES=$(grep -c "^C('" codelingo/courses/*.js | awk -F: '{s+=$2} END {print s}')
fail=0
check() { # name url
  local dom n
  # CHROME_FLAGS: extra flags, e.g. --no-sandbox on CI runners (set in the workflow).
  dom=$("$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check ${CHROME_FLAGS:-} \
    --user-data-dir="$PROFILE" --window-size=390,844 --virtual-time-budget=5000 --dump-dom "$2" 2>&1 \
    | python3 -I -c 'import re,sys; print(re.sub(r"<script\b.*?</script>", "", sys.stdin.read(), flags=re.S))') || true
  n=$( (grep -o 'data-act="course"' <<<"$dom" || true) | wc -l | tr -d ' ')
  if [ "$n" = "$COURSES" ] && grep -q 'data-act="tab"' <<<"$dom"; then
    echo "✓ $1: home screen shows $n courses"
  else
    echo "✗ $1: expected $COURSES courses, got $n"; fail=1
    grep -iE "error|sandbox" <<<"$dom" | head -5 || true
  fi
}
check "dist/web (http)" "http://127.0.0.1:$PORT/"
check "dist/codelingo.html (file://)" "file://$PWD/dist/codelingo.html"
[ $fail = 0 ] && echo "PASS: build verified" || { echo "FAIL"; exit 1; }
