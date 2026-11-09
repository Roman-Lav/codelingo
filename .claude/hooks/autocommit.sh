#!/bin/bash
# Auto-commit hook (Stop + SubagentStop). Commits every change after each Claude turn / agent run.
# Never commits to main: if on main, it creates a task branch first (task/auto-<timestamp>).
# Disable temporarily:  touch .claude/autocommit.off   (or open /hooks)
set -u
INPUT=$(cat)
ROOT=${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}
[ -n "$ROOT" ] && cd "$ROOT" || exit 0
[ -f .claude/autocommit.off ] && exit 0
git rev-parse --verify -q HEAD >/dev/null || exit 0                 # no initial commit yet
[ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -f .git/MERGE_HEAD ] && exit 0
[ -z "$(git status --porcelain)" ] && exit 0                        # nothing changed

# One commit at a time even when several sessions stop together.
LOCK=.git/claude-autocommit.lock
for _ in $(seq 50); do mkdir "$LOCK" 2>/dev/null && break; sleep 0.1; done
[ -d "$LOCK" ] || exit 0
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

read -r EVENT AGENT < <(printf '%s' "$INPUT" | python3 -c '
import sys, json
try: d = json.load(sys.stdin)
except Exception: d = {}
print(d.get("hook_event_name") or "Stop", d.get("agent_type") or d.get("subagent_type") or "-")
' 2>/dev/null)
[ "$EVENT" = "SubagentStop" ] && WHO="agent ${AGENT:--}" || WHO="claude turn"

BRANCH=$(git symbolic-ref --short -q HEAD || echo "")
[ -z "$BRANCH" ] && exit 0                                          # detached HEAD: leave alone
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  BRANCH="task/auto-$(date +%Y%m%d-%H%M%S)"
  git switch -q -c "$BRANCH" || exit 0
fi

git add -A
FILES=$(git diff --cached --name-only | head -5 | paste -sd ',' - | sed 's/,/, /g')
N=$(git diff --cached --name-only | wc -l | tr -d ' ')
[ "$N" -gt 5 ] && FILES="$FILES, +$((N - 5)) more"
git commit -q -F - <<EOF || exit 0
auto: ${WHO} — ${FILES}

Automatic commit by .claude/hooks/autocommit.sh after ${WHO}.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
printf '{"systemMessage":"autocommit: %s on %s"}\n' "$(git rev-parse --short HEAD)" "$BRANCH"
