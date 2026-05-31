#!/usr/bin/env bash
set -euo pipefail

# Offline test for `omk resume`: a first conduct run persists session.json and a
# turn; `omk resume latest` reuses that run dir, resumes the claude session
# (claudeTurn takes the --resume branch), and appends a new turn WITHOUT
# clobbering the original.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-conductor-resume.XXXXXX")"
fake_bin="$test_root/bin"
work_repo="$test_root/workspace"
node_bin="$(command -v node)"
node_dir="$(dirname "$node_bin")"

mkdir -p "$fake_bin" "$work_repo"

# Fake claude: a --resume invocation returns RESUMED-OK; otherwise RUN1 (done).
cat >"$fake_bin/claude" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then echo "fake-claude 2.1.158"; exit 0; fi
is_resume=0; for a in "\$@"; do [[ "\$a" == "--resume" ]] && is_resume=1; done
if [[ "\$is_resume" == "1" ]]; then
  "$node_bin" -e 'process.stdout.write(JSON.stringify({type:"result",is_error:false,result:JSON.stringify({say:"RESUMED-OK",delegations:[],ask:null,done:true}),session_id:"s"}))'
else
  "$node_bin" -e 'process.stdout.write(JSON.stringify({type:"result",is_error:false,result:JSON.stringify({say:"RUN1-DONE",plan:[{title:"do the thing",status:"done"}],delegations:[],ask:null,done:true}),session_id:"s"}))'
fi
EOF
chmod +x "$fake_bin/claude"

base_env=(PATH="$fake_bin:$node_dir:/usr/bin:/bin" OMK_SKIP_AGENTCAT_INSTALL=1 OMK_CONDUCT_QUOTA_HINT=0)

# Run 1.
env "${base_env[@]}" "$repo_root/bin/omk" conduct --repo "$work_repo" "do the thing" \
  >"$test_root/run1.txt" 2>"$test_root/run1.err"
grep -q "RUN1-DONE" "$test_root/run1.txt"

run_dir="$(find "$work_repo/.omk/runs" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
[[ -f "$run_dir/session.json" ]] || { echo "session.json not persisted" >&2; exit 1; }
sid_before="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sessionId)' "$run_dir/session.json")"
[[ -f "$run_dir/turn-0.json" ]]

# Resume latest.
env "${base_env[@]}" "$repo_root/bin/omk" resume --repo "$work_repo" latest \
  >"$test_root/resume.txt" 2>"$test_root/resume.err"
grep -q "RESUMED-OK" "$test_root/resume.txt"

# Same run dir reused, same session id, original turn-0 NOT clobbered, new turn appended.
sid_after="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sessionId)' "$run_dir/session.json")"
[[ "$sid_before" == "$sid_after" ]] || { echo "session id changed on resume ($sid_before -> $sid_after)" >&2; exit 1; }
[[ -f "$run_dir/turn-0.json" ]] || { echo "original turn-0.json clobbered" >&2; exit 1; }
[[ -f "$run_dir/turn-1.json" ]] || { echo "resume did not append a new turn" >&2; exit 1; }
grep -q "Resume this task" "$run_dir/turn-1.json"

echo "conductor resume ok: $run_dir"
