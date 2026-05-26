#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-shell-mode.XXXXXX")"
fake_bin="$test_root/bin"
work_repo="$test_root/workspace"

mkdir -p "$fake_bin" "$work_repo"

cat >"$fake_bin/claude" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-claude 1.0.0"
  exit 0
fi
echo "Recommended approach: shell fake claude advisor"
EOF

cat >"$fake_bin/gemini" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-gemini 1.0.0"
  exit 0
fi
echo "Recommended approach: shell fake gemini advisor"
EOF

cat >"$fake_bin/codex" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-codex 1.0.0"
  exit 0
fi
echo "SHELL-FAKE-CODEX-OK"
EOF

chmod +x "$fake_bin/claude" "$fake_bin/gemini" "$fake_bin/codex"

{
  echo "/mode run"
  echo "/status"
  echo "Shell mode smoke. Final output must include SHELL-FAKE-CODEX-OK."
  echo "/exit"
} | OMK_SKIP_AGENTCAT_INSTALL=1 PATH="$fake_bin:$PATH" "$repo_root/bin/omk" shell --repo "$work_repo" \
  >"$test_root/omk.out" 2>"$test_root/omk.err"

grep -q "mode: run" "$test_root/omk.out"
grep -q "fake-claude" "$test_root/omk.out"
grep -q "SHELL-FAKE-CODEX-OK" "$test_root/omk.out"

run_dir="$(find "$work_repo/.omk/runs" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
[[ -f "$run_dir/claude.md" ]]
[[ -f "$run_dir/gemini.md" ]]
[[ -f "$run_dir/codex.out" ]]

echo "shell mode ok: $run_dir"
