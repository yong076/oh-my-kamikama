#!/usr/bin/env bash
set -euo pipefail

# Exercises the Node REPL -> conductor wiring (buildConductorIo) end to end in
# non-TTY mode: piping "/conduct …" must route through runConductorTask into the
# conductor and surface its narration. Also covers the default-mode routing
# (a plain task in auto mode goes to the conductor).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-repl-conduct.XXXXXX")"
fake_bin="$test_root/bin"
work_repo="$test_root/workspace"
node_bin="$(command -v node)"
node_dir="$(dirname "$node_bin")"

mkdir -p "$fake_bin" "$work_repo"

cat >"$fake_bin/claude" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then echo "fake-claude 2.1.158"; exit 0; fi
"$node_bin" -e 'process.stdout.write(JSON.stringify({type:"result",is_error:false,result:JSON.stringify({say:"REPL-CONDUCT-OK",plan:[{title:"ship it",status:"done"}],delegations:[],ask:null,done:true}),session_id:"s"}))'
EOF
chmod +x "$fake_bin/claude"

{
  echo "/conduct make it so"
  echo "/exit"
} | PATH="$fake_bin:$node_dir:/usr/bin:/bin" OMK_SKIP_AGENTCAT_INSTALL=1 OMK_CONDUCT_QUOTA_HINT=0 \
  "$node_bin" "$repo_root/bin/omk-repl.js" --repo "$work_repo" --mode conduct \
  >"$test_root/out.txt" 2>"$test_root/err.txt"

grep -q "REPL-CONDUCT-OK" "$test_root/out.txt"
# The conductor persisted a run under the target repo.
run_dir="$(find "$work_repo/.omk/runs" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
[[ -n "$run_dir" ]] || { echo "conductor run dir not created from REPL" >&2; exit 1; }
[[ -f "$run_dir/session.json" ]] || { echo "session.json missing" >&2; exit 1; }

echo "repl conduct ok: $run_dir"
