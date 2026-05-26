#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-node-repl.XXXXXX")"
fake_bin="$test_root/bin"
work_repo="$test_root/workspace"
node_bin="$(command -v node)"

mkdir -p "$fake_bin" "$work_repo"

cat >"$fake_bin/agentcat" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "snapshot" && "${2:-}" == "--json" ]]; then
  cat <<'JSON'
{
  "activity": {"countsByProvider": {"claude": 1}, "memoryBytesByProvider": {}, "motionStage": "walking", "processes": []},
  "providers": {
    "codex": {"status": "ok", "tokens": {"week": 100}, "limits": {"quotas": [{"label": "7d", "remainingPercent": 50}]}},
    "claude": {"status": "ok", "tokens": {"week": 200}, "limits": {"quotas": [{"label": "7d", "remainingPercent": 90}]}},
    "gemini": {"status": "ok", "tokens": {"week": 300}, "limits": {"quotas": [{"label": "daily", "remainingPercent": 99}]}}
  }
}
JSON
  exit 0
fi
if [[ "${1:-}" == "version" ]]; then
  echo "fake-agentcat"
fi
EOF

cat >"$fake_bin/claude" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-claude"
else
  echo "NODE-REPL-CLAUDE-OK"
fi
EOF
cat >"$fake_bin/codex" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-codex"
else
  echo "NODE-REPL-CODEX-OK"
fi
EOF
cat >"$fake_bin/gemini" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-gemini"
else
  echo "NODE-REPL-GEMINI-OK"
fi
EOF
chmod +x "$fake_bin/agentcat" "$fake_bin/claude" "$fake_bin/codex" "$fake_bin/gemini"

{
  printf '/helpp\177\n'
  echo "/route"
  echo "/screen"
  echo "/mode claude"
  printf '첫 줄\\\n'
  echo "둘째 줄"
  echo "Node repl smoke."
  echo "/exit"
} | PATH="$fake_bin:/usr/bin:/bin:/usr/sbin:/sbin" OMK_SKIP_AGENTCAT_INSTALL=1 \
  "$node_bin" "$repo_root/bin/omk-repl.js" --repo "$work_repo" \
  >"$test_root/repl.out" 2>"$test_root/repl.err"

grep -q "Oh My Kamisama" "$test_root/repl.out"
grep -q "Slash commands" "$test_root/repl.out"
grep -q "auto route: claude" "$test_root/repl.out"
grep -q "activity: walking" "$test_root/repl.out"
grep -q "NODE-REPL-CLAUDE-OK" "$test_root/repl.out"

grep -R -q "첫 줄" "$work_repo/.omk/runs"
grep -R -q "둘째 줄" "$work_repo/.omk/runs"

echo "node repl ok"
