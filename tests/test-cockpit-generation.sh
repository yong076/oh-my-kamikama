#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-cockpit-generation.XXXXXX")"
fake_bin="$test_root/bin"
work_repo="$test_root/workspace"
cmux_log="$test_root/cmux.log"

mkdir -p "$fake_bin" "$work_repo"

cat >"$fake_bin/cmux" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${FAKE_CMUX_LOG:?}"
echo "workspace fake-cmux-workspace"
EOF

chmod +x "$fake_bin/cmux"

FAKE_CMUX_LOG="$cmux_log" PATH="$fake_bin:$PATH" "$repo_root/bin/omk" cockpit --repo "$work_repo" \
  "Open the cockpit and start a background run." \
  >"$test_root/omk.out" 2>"$test_root/omk.err"

grep -q "new-workspace" "$cmux_log"
grep -q "Oh My Kamisama cockpit" "$cmux_log"
grep -q "watch.sh" "$cmux_log"
grep -q "omk cockpit:" "$test_root/omk.out"

cockpit_dir="$(sed -n 's/^omk cockpit: //p' "$test_root/omk.out" | tail -n 1)"
[[ -n "$cockpit_dir" ]]
[[ -x "$cockpit_dir/watch.sh" ]]
[[ -x "$cockpit_dir/control.sh" ]]
grep -q "omk bg" "$cockpit_dir/control.sh"
grep -q "omk watch" "$cockpit_dir/watch.sh"
grep -q "Open the cockpit" "$cockpit_dir/task.txt"

echo "cockpit generation ok: $cockpit_dir"
