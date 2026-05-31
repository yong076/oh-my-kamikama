#!/usr/bin/env bash
set -euo pipefail

# Offline test for the conductor `ask` path. The first turn returns an `ask`
# envelope; omk renders a picker (here driven non-interactively by
# OMK_CONDUCT_AUTO_ANSWER), then feeds "User selected: <answer>" back to the
# conductor, which echoes it and finishes.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-conductor-ask.XXXXXX")"
fake_bin="$test_root/bin"
work_repo="$test_root/workspace"
node_bin="$(command -v node)"
node_dir="$(dirname "$node_bin")"

mkdir -p "$fake_bin" "$work_repo"

cat >"$fake_bin/claude" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then echo "fake-claude 2.1.156"; exit 0; fi
last="\${@: -1}"
if [[ "\$last" == *"User selected:"* ]]; then
  "$node_bin" -e 'const last=process.argv[1]||""; const sel=(last.split("User selected:")[1]||"").trim(); process.stdout.write(JSON.stringify({type:"result",is_error:false,result:JSON.stringify({say:"PICKED["+sel+"]",delegations:[],ask:null,done:true}),session_id:"s"}))' "\$last"
else
  "$node_bin" -e 'process.stdout.write(JSON.stringify({type:"result",is_error:false,result:JSON.stringify({say:"choosing",delegations:[],ask:{question:"Pick a color",options:["Red","Blue","Green"]},done:false}),session_id:"s"}))'
fi
EOF
chmod +x "$fake_bin/claude"

PATH="$fake_bin:$node_dir:/usr/bin:/bin" OMK_SKIP_AGENTCAT_INSTALL=1 OMK_CONDUCT_QUOTA_HINT=0 \
  OMK_CONDUCT_AUTO_ANSWER="Blue" \
  "$repo_root/bin/omk" conduct --repo "$work_repo" "ask flow" \
  >"$test_root/out.txt" 2>"$test_root/err.txt"

# The selected answer was fed back and echoed by the conductor.
grep -q "PICKED\[Blue\]" "$test_root/out.txt"

run_dir="$(find "$work_repo/.omk/runs" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
grep -q "User selected: Blue" "$run_dir/turn-1.json"

echo "conductor ask ok: $run_dir"
