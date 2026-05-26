#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-agent-routing.XXXXXX")"
fake_bin="$test_root/bin"
work_repo="$test_root/workspace"

mkdir -p "$fake_bin" "$work_repo"

cat >"$fake_bin/agentcat" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "snapshot" && "${2:-}" == "--json" ]]; then
  cat <<'JSON'
{
  "activity": {
    "countsByProvider": {"codex": 0, "claude": 1, "gemini": 0},
    "memoryBytesByProvider": {"claude": 268435456},
    "motionStage": "walking",
    "processes": [{"provider": "claude", "cpuPercent": 3.5}]
  },
  "providers": {
    "codex": {
      "status": "ok",
      "tokens": {"week": 1000},
      "limits": {"quotas": [{"label": "7d", "remainingPercent": 20}]}
    },
    "claude": {
      "status": "ok",
      "tokens": {"week": 2000},
      "limits": {"quotas": [{"label": "7d", "remainingPercent": 90}]}
    },
    "gemini": {
      "status": "ok",
      "tokens": {"week": 3000},
      "limits": {"quotas": [{"label": "daily", "remainingPercent": 99}]}
    }
  }
}
JSON
  exit 0
fi
if [[ "${1:-}" == "version" ]]; then
  echo "fake-agentcat 1.0.0"
  exit 0
fi
exit 0
EOF

cat >"$fake_bin/codex" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-codex 1.0.0"
  exit 0
fi
echo "FAKE-CODEX-ROUTE"
EOF

cat >"$fake_bin/claude" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-claude 1.0.0"
  exit 0
fi
echo "FAKE-CLAUDE-ROUTE"
EOF

cat >"$fake_bin/gemini" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-gemini 1.0.0"
  exit 0
fi
echo "FAKE-GEMINI-ROUTE"
EOF

chmod +x "$fake_bin/agentcat" "$fake_bin/codex" "$fake_bin/claude" "$fake_bin/gemini"

PATH="$fake_bin:/usr/bin:/bin:/usr/sbin:/sbin" OMK_SKIP_AGENTCAT_INSTALL=1 \
  "$repo_root/bin/omk" agents >"$test_root/agents.out"

grep -q "suggested: claude" "$test_root/agents.out"
grep -q "claude" "$test_root/agents.out"
grep -q "90.0% 7d" "$test_root/agents.out"

PATH="$fake_bin:/usr/bin:/bin:/usr/sbin:/sbin" OMK_SKIP_AGENTCAT_INSTALL=1 \
  "$repo_root/bin/omk" auto --repo "$work_repo" \
  "Route to the most available non-Gemini executor." \
  >"$test_root/auto.out" 2>"$test_root/auto.err"

grep -q "omk auto route: claude" "$test_root/auto.out"
grep -q "FAKE-CLAUDE-ROUTE" "$test_root/auto.out"

echo "agent routing ok"
