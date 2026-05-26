#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-shell-surfaces.XXXXXX")"
fake_bin="$test_root/bin"
work_repo="$test_root/workspace"

mkdir -p "$fake_bin" "$work_repo"

cat >"$fake_bin/agentcat" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "snapshot" && "${2:-}" == "--json" ]]; then
  cat <<'JSON'
{
  "activity": {"countsByProvider": {}, "memoryBytesByProvider": {}, "motionStage": "sleeping", "processes": []},
  "insights": {
    "status": "ok",
    "summary": {
      "top_provider": "codex",
      "top_model": "gpt-5.5",
      "total_tokens": 1234567,
      "estimated_cost_usd": 12.34,
      "cache_hit_percent": 98.7
    }
  },
  "providers": {
    "codex": {"status": "ok", "tokens": {"today": 100, "week": 200, "month": 300}, "limits": {"quotas": [{"label": "7d", "remainingPercent": 80}]}},
    "claude": {"status": "ok", "tokens": {"today": 10, "week": 20, "month": 30}, "limits": {"quotas": [{"label": "7d", "remainingPercent": 70}]}},
    "gemini": {"status": "ok", "tokens": {"today": 1, "week": 2, "month": 3}, "limits": {"quotas": [{"label": "daily", "remainingPercent": 90}]}}
  }
}
JSON
  exit 0
fi
if [[ "${1:-}" == "version" ]]; then
  echo "fake-agentcat"
fi
EOF

cat >"$fake_bin/codex" <<'EOF'
#!/usr/bin/env bash
echo fake-codex
EOF
cat >"$fake_bin/claude" <<'EOF'
#!/usr/bin/env bash
echo fake-claude
EOF
cat >"$fake_bin/gemini" <<'EOF'
#!/usr/bin/env bash
echo fake-gemini
EOF
chmod +x "$fake_bin/agentcat" "$fake_bin/codex" "$fake_bin/claude" "$fake_bin/gemini"

(
  cd "$work_repo"
  git init -q
  git config user.email test@example.com
  git config user.name Test
  printf '{"scripts":{"test":"echo test"}}\n' >package.json
  git add package.json
  git commit -qm init
  printf 'changed\n' >>package.json
)

PATH="$fake_bin:/usr/bin:/bin:/usr/sbin:/sbin" OMK_SKIP_AGENTCAT_INSTALL=1 \
  "$repo_root/bin/omk" context --repo "$work_repo" >"$test_root/context.out"
grep -q "Repository Context" "$test_root/context.out"
grep -q "npm scripts" "$test_root/context.out"

PATH="$fake_bin:/usr/bin:/bin:/usr/sbin:/sbin" OMK_SKIP_AGENTCAT_INSTALL=1 \
  "$repo_root/bin/omk" diff --repo "$work_repo" >"$test_root/diff.out"
grep -q "Git Diff" "$test_root/diff.out"
grep -q "package.json" "$test_root/diff.out"

PATH="$fake_bin:/usr/bin:/bin:/usr/sbin:/sbin" OMK_SKIP_AGENTCAT_INSTALL=1 \
  "$repo_root/bin/omk" cost >"$test_root/cost.out"
grep -q "top provider: codex" "$test_root/cost.out"
grep -q 'estimated cost: $12.34' "$test_root/cost.out"

PATH="$fake_bin:/usr/bin:/bin:/usr/sbin:/sbin" OMK_SKIP_AGENTCAT_INSTALL=1 \
  "$repo_root/bin/omk" task --repo "$work_repo" add "write regression test" >"$test_root/task-add.out"
PATH="$fake_bin:/usr/bin:/bin:/usr/sbin:/sbin" OMK_SKIP_AGENTCAT_INSTALL=1 \
  "$repo_root/bin/omk" tasks --repo "$work_repo" >"$test_root/tasks.out"
grep -q "write regression test" "$test_root/tasks.out"
PATH="$fake_bin:/usr/bin:/bin:/usr/sbin:/sbin" OMK_SKIP_AGENTCAT_INSTALL=1 \
  "$repo_root/bin/omk" task --repo "$work_repo" done 1 >"$test_root/task-done.out"
grep -q "done" "$work_repo/.omk/tasks.tsv"

echo "shell surfaces ok"
