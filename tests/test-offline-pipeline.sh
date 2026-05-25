#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-offline-pipeline.XXXXXX")"
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
echo "Recommended approach: fake claude advisor"
echo "Verification: assert offline artifact creation"
EOF

cat >"$fake_bin/gemini" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-gemini 1.0.0"
  exit 0
fi
echo "Recommended approach: fake gemini advisor"
echo "Risks: fake risk lane"
EOF

cat >"$fake_bin/codex" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "fake-codex 1.0.0"
  exit 0
fi
echo "FAKE-CODEX-OK"
echo "executor saw ${#} args"
EOF

chmod +x "$fake_bin/claude" "$fake_bin/gemini" "$fake_bin/codex"

PATH="$fake_bin:$PATH" "$repo_root/bin/omk" run --repo "$work_repo" \
  "Offline conductor smoke. Final output must include FAKE-CODEX-OK." \
  >"$test_root/omk.out" 2>"$test_root/omk.err"

grep -q "FAKE-CODEX-OK" "$test_root/omk.out"

run_dir="$(find "$work_repo/.omk/runs" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
[[ -f "$run_dir/claude.md" ]]
[[ -f "$run_dir/gemini.md" ]]
[[ -f "$run_dir/codex.prompt.md" ]]
[[ -f "$run_dir/codex.out" ]]
grep -q "fake claude advisor" "$run_dir/claude.md"
grep -q "fake gemini advisor" "$run_dir/gemini.md"

echo "offline pipeline ok: $run_dir"
