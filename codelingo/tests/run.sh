#!/bin/bash
# Run CodeLingo tests in headless Chrome. No Node/npm needed.
# Usage: tests/run.sh [grep]      e.g. tests/run.sh data:
set -u
cd "$(dirname "$0")/.."
# A free port by default, so parallel runs (e.g. two agents) never share one server.
PORT=${PORT:-$(python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PROFILE=$(mktemp -d)
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!; disown $SERVER
trap 'kill $SERVER 2>/dev/null; rm -rf "$PROFILE"' EXIT
up=0
for _ in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && { up=1; break; }; sleep 0.1; done
[ $up = 1 ] || { echo "ERROR: test server did not start on port $PORT (not a test failure)"; exit 2; }

URL="http://127.0.0.1:$PORT/tests/runner.html${1:+?grep=$1}"
OUT=$("$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check ${CHROME_FLAGS:-} \
  --user-data-dir="$PROFILE" --window-size=1200,1000 --virtual-time-budget=240000 \
  --dump-dom "$URL" 2>/dev/null)
if ! grep -q '<pre id="log">' <<<"$OUT"; then
  echo "ERROR: Chrome returned no test log (runner did not load; not a test failure). Rerun the script."
  exit 2
fi

# Print the log as plain text. By default passed tests are hidden (saves agent tokens);
# VERBOSE=1 tests/run.sh shows every line.
echo "$OUT" | VERBOSE="${VERBOSE:-}" python3 -c '
import sys, html, re, os
dom = sys.stdin.read()
m = re.search(r"<pre id=\"log\">(.*?)</pre>", dom, re.S)
body = m.group(1) if m else dom
body = re.sub(r"<div class=\"\w+\">", "", body).replace("</div>", "\n")
lines = html.unescape(body).rstrip().splitlines()
if not os.environ.get("VERBOSE"):
    lines = [l for l in lines if not l.startswith("✓")]
print("\n".join(lines))
'
echo "$OUT" | grep -q 'data-status="PASS"'
